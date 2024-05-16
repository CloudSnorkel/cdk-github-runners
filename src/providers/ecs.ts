import * as cdk from 'aws-cdk-lib';
import {
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_iam as iam,
  aws_logs as logs,
  aws_stepfunctions as stepfunctions,
  aws_stepfunctions_tasks as stepfunctions_tasks,
  RemovalPolicy,
  Stack,
} from 'aws-cdk-lib';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import { MachineImageType } from 'aws-cdk-lib/aws-ecs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IntegrationPattern } from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import {
  amiRootDevice,
  Architecture,
  BaseProvider,
  IRunnerProvider,
  IRunnerProviderStatus,
  Os,
  RunnerImage,
  RunnerProviderProps,
  RunnerRuntimeParameters,
  RunnerVersion,
} from './common';
import { ecsRunCommand } from './fargate';
import { IRunnerImageBuilder, RunnerImageBuilder, RunnerImageBuilderProps, RunnerImageComponent } from '../image-builders';
import { MINIMAL_EC2_SSM_SESSION_MANAGER_POLICY_STATEMENT, MINIMAL_ECS_SSM_SESSION_MANAGER_POLICY_STATEMENT } from '../utils';

/**
 * Properties for EcsRunnerProvider.
 */
export interface EcsRunnerProviderProps extends RunnerProviderProps {
  /**
   * Runner image builder used to build Docker images containing GitHub Runner and all requirements.
   *
   * The image builder determines the OS and architecture of the runner.
   *
   * @default EcsRunnerProvider.imageBuilder()
   */
  readonly imageBuilder?: IRunnerImageBuilder;

  /**
   * GitHub Actions labels used for this provider.
   *
   * These labels are used to identify which provider should spawn a new on-demand runner. Every job sends a webhook with the labels it's looking for
   * based on runs-on. We match the labels from the webhook with the labels specified here. If all the labels specified here are present in the
   * job's labels, this provider will be chosen and spawn a new runner.
   *
   * @default ['ecs']
   */
  readonly labels?: string[];

  /**
   * VPC to launch the runners in.
   *
   * @default default account VPC
   */
  readonly vpc?: ec2.IVpc;

  /**
   * Subnets to run the runners in.
   *
   * @default ECS default
   */
  readonly subnetSelection?: ec2.SubnetSelection;

  /**
   * Security groups to assign to the task.
   *
   * @default a new security group
   */
  readonly securityGroups?: ec2.ISecurityGroup[];

  /**
   * Existing ECS cluster to use.
   *
   * @default a new cluster
   */
  readonly cluster?: ecs.Cluster;

  /**
   * Existing capacity provider to use.
   *
   * Make sure the AMI used by the capacity provider is compatible with ECS.
   *
   * @default new capacity provider
   */
  readonly capacityProvider?: ecs.AsgCapacityProvider;

  /**
   * Assign public IP to the runner task.
   *
   * Make sure the task will have access to GitHub. A public IP might be required unless you have NAT gateway.
   *
   * @default true
   */
  readonly assignPublicIp?: boolean;

  /**
   * The number of cpu units used by the task. 1024 units is 1 vCPU. Fractions of a vCPU are supported.
   *
   * @default 1024
   */
  readonly cpu?: number;

  /**
   * The amount (in MiB) of memory used by the task.
   *
   * @default 3500, unless `memoryReservationMiB` is used and then it's undefined
   */
  readonly memoryLimitMiB?: number;

  /**
   * The soft limit (in MiB) of memory to reserve for the container.
   *
   * @default undefined
   */
  readonly memoryReservationMiB?: number;

  /**
   * Instance type of ECS cluster instances. Only used when creating a new cluster.
   *
   * @default m6i.large or m6g.large
   */
  readonly instanceType?: ec2.InstanceType;

  /**
   * The minimum number of instances to run in the cluster. Only used when creating a new cluster.
   *
   * @default 0
   */
  readonly minInstances?: number;

  /**
   * The maximum number of instances to run in the cluster. Only used when creating a new cluster.
   *
   * @default 5
   */
  readonly maxInstances?: number;

  /**
   * Size of volume available for launched cluster instances. This modifies the boot volume size and doesn't add any additional volumes.
   *
   * Each instance can be used by multiple runners, so make sure there is enough space for all of them.
   *
   * @default default size for AMI (usually 30GB for Linux and 50GB for Windows)
   */
  readonly storageSize?: cdk.Size;

  /**
   * Support building and running Docker images by enabling Docker-in-Docker (dind) and the required CodeBuild privileged mode. Disabling this can
   * speed up provisioning of CodeBuild runners. If you don't intend on running or building Docker images, disable this for faster start-up times.
   *
   * @default true
   */
  readonly dockerInDocker?: boolean;

  /**
   * Use spot capacity.
   *
   * @default false (true if spotMaxPrice is specified)
   */
  readonly spot?: boolean;

  /**
   * Maximum price for spot instances.
   */
  readonly spotMaxPrice?: string;
}

interface EcsEc2LaunchTargetProps {
  readonly capacityProvider: string;
  readonly enableExecute: boolean;
}

class EcsEc2LaunchTarget implements stepfunctions_tasks.IEcsLaunchTarget {
  constructor(readonly props: EcsEc2LaunchTargetProps) {
  }

  /**
   * Called when the ECS launch type configured on RunTask
   */
  public bind(_task: stepfunctions_tasks.EcsRunTask,
    _launchTargetOptions: stepfunctions_tasks.LaunchTargetBindOptions): stepfunctions_tasks.EcsLaunchTargetConfig {
    return {
      parameters: {
        PropagateTags: ecs.PropagatedTagSource.TASK_DEFINITION,
        EnableExecuteCommand: this.props.enableExecute,
        CapacityProviderStrategy: [
          {
            CapacityProvider: this.props.capacityProvider,
          },
        ],
      },
    };
  }
}

/**
 * GitHub Actions runner provider using ECS on EC2 to execute jobs.
 *
 * ECS can be useful when you want more control of the infrastructure running the GitHub Actions Docker containers. You can control the autoscaling
 * group to scale down to zero during the night and scale up during work hours. This way you can still save money, but have to wait less for
 * infrastructure to spin up.
 *
 * This construct is not meant to be used by itself. It should be passed in the providers property for GitHubRunners.
 */
export class EcsRunnerProvider extends BaseProvider implements IRunnerProvider {
  /**
   * Create new image builder that builds ECS specific runner images.
   *
   * You can customize the OS, architecture, VPC, subnet, security groups, etc. by passing in props.
   *
   * You can add components to the image builder by calling `imageBuilder.addComponent()`.
   *
   * The default OS is Ubuntu running on x64 architecture.
   *
   * Included components:
   *  * `RunnerImageComponent.requiredPackages()`
   *  * `RunnerImageComponent.runnerUser()`
   *  * `RunnerImageComponent.git()`
   *  * `RunnerImageComponent.githubCli()`
   *  * `RunnerImageComponent.awsCli()`
   *  * `RunnerImageComponent.docker()`
   *  * `RunnerImageComponent.githubRunner()`
   */
  public static imageBuilder(scope: Construct, id: string, props?: RunnerImageBuilderProps) {
    return RunnerImageBuilder.new(scope, id, {
      os: Os.LINUX_UBUNTU,
      architecture: Architecture.X86_64,
      components: [
        RunnerImageComponent.requiredPackages(),
        RunnerImageComponent.runnerUser(),
        RunnerImageComponent.git(),
        RunnerImageComponent.githubCli(),
        RunnerImageComponent.awsCli(),
        RunnerImageComponent.docker(),
        RunnerImageComponent.githubRunner(props?.runnerVersion ?? RunnerVersion.latest()),
      ],
      ...props,
    });
  }

  /**
   * Cluster hosting the task hosting the runner.
   */
  private readonly cluster: ecs.Cluster;

  /**
   * Capacity provider used to scale the cluster.
   */
  private readonly capacityProvider: ecs.AsgCapacityProvider;

  /**
   * ECS task hosting the runner.
   */
  private readonly task: ecs.Ec2TaskDefinition;

  /**
   * Container definition hosting the runner.
   */
  private readonly container: ecs.ContainerDefinition;

  /**
   * Labels associated with this provider.
   */
  readonly labels: string[];

  /**
   * VPC used for hosting the runner task.
   */
  private readonly vpc?: ec2.IVpc;

  /**
   * Subnets used for hosting the runner task.
   */
  private readonly subnetSelection?: ec2.SubnetSelection;

  /**
   * Whether runner task will have a public IP.
   */
  private readonly assignPublicIp: boolean;

  /**
   * Grant principal used to add permissions to the runner role.
   */
  readonly grantPrincipal: iam.IPrincipal;

  /**
   * The network connections associated with this resource.
   */
  readonly connections: ec2.Connections;

  /**
   * Docker image loaded with GitHub Actions Runner and its prerequisites. The image is built by an image builder and is specific to ECS tasks.
   */
  private readonly image: RunnerImage;

  /**
   * Log group where provided runners will save their logs.
   *
   * Note that this is not the job log, but the runner itself. It will not contain output from the GitHub Action but only metadata on its execution.
   */
  readonly logGroup: logs.ILogGroup;

  /**
   * Security groups associated with this provider.
   */
  private readonly securityGroups: ec2.ISecurityGroup[];

  /**
   * Run docker in docker.
   */
  private readonly dind: boolean;

  readonly retryableErrors = [
    'Ecs.EcsException',
    'ECS.AmazonECSException',
    'Ecs.LimitExceededException',
    'Ecs.UpdateInProgressException',
  ];

  constructor(scope: Construct, id: string, props?: EcsRunnerProviderProps) {
    super(scope, id, props);

    this.labels = props?.labels ?? ['ecs'];
    this.vpc = props?.vpc ?? ec2.Vpc.fromLookup(this, 'default vpc', { isDefault: true });
    this.subnetSelection = props?.subnetSelection;
    this.securityGroups = props?.securityGroups ?? [new ec2.SecurityGroup(this, 'security group', { vpc: this.vpc })];
    this.connections = new ec2.Connections({ securityGroups: this.securityGroups });
    this.assignPublicIp = props?.assignPublicIp ?? true;
    this.cluster = props?.cluster ? props.cluster : new ecs.Cluster(
      this,
      'cluster',
      {
        vpc: this.vpc,
        enableFargateCapacityProviders: false,
      },
    );

    const imageBuilder = props?.imageBuilder ?? EcsRunnerProvider.imageBuilder(this, 'Image Builder');
    const image = this.image = imageBuilder.bindDockerImage();

    if (props?.capacityProvider) {
      if (props?.minInstances || props?.maxInstances || props?.instanceType || props?.storageSize || props?.spot || props?.spotMaxPrice) {
        cdk.Annotations.of(this).addWarning('When using a custom capacity provider, minInstances, maxInstances, instanceType, storageSize, spot, and spotMaxPrice will be ignored.');
      }

      this.capacityProvider = props.capacityProvider;
    } else {
      const spot = props?.spot ?? props?.spotMaxPrice !== undefined;

      const launchTemplate = new ec2.LaunchTemplate(this, 'Launch Template', {
        machineImage: this.defaultClusterInstanceAmi(),
        instanceType: props?.instanceType ?? this.defaultClusterInstanceType(),
        blockDevices: props?.storageSize ? [
          {
            deviceName: amiRootDevice(this, this.defaultClusterInstanceAmi().getImage(this).imageId).ref,
            volume: {
              ebsDevice: {
                volumeSize: props.storageSize.toGibibytes(),
                deleteOnTermination: true,
              },
            },
          },
        ] : undefined,
        spotOptions: spot ? {
          requestType: ec2.SpotRequestType.ONE_TIME,
          maxPrice: props?.spotMaxPrice ? parseFloat(props?.spotMaxPrice) : undefined,
        } : undefined,
        requireImdsv2: true,
        securityGroup: this.securityGroups[0],
        role: new iam.Role(this, 'Launch Template Role', {
          assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
        }),
        userData: ec2.UserData.forOperatingSystem(image.os.is(Os.WINDOWS) ? ec2.OperatingSystemType.WINDOWS : ec2.OperatingSystemType.LINUX),
      });
      this.securityGroups.slice(1).map(sg => launchTemplate.connections.addSecurityGroup(sg));

      const autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'Auto Scaling Group', {
        vpc: this.vpc,
        launchTemplate,
        vpcSubnets: this.subnetSelection,
        minCapacity: props?.minInstances ?? 0,
        maxCapacity: props?.maxInstances ?? 5,
      });

      this.capacityProvider = props?.capacityProvider ?? new ecs.AsgCapacityProvider(this, 'Capacity Provider', {
        autoScalingGroup,
        spotInstanceDraining: false, // waste of money to restart jobs as the restarted job won't have a token
      });
    }

    this.capacityProvider.autoScalingGroup.addUserData(
      // we don't exit on errors because all of these commands are optional
      ...this.loginCommands(),
      this.pullCommand(),
      ...this.ecsSettingsCommands(),
    );
    this.capacityProvider.autoScalingGroup.role.addToPrincipalPolicy(MINIMAL_EC2_SSM_SESSION_MANAGER_POLICY_STATEMENT);
    image.imageRepository.grantPull(this.capacityProvider.autoScalingGroup);

    this.cluster.addAsgCapacityProvider(
      this.capacityProvider,
      {
        spotInstanceDraining: false,
        machineImageType: MachineImageType.AMAZON_LINUX_2,
      },
    );

    this.logGroup = new logs.LogGroup(this, 'logs', {
      retention: props?.logRetention ?? RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.dind = (props?.dockerInDocker ?? true) && !image.os.is(Os.WINDOWS);

    this.task = new ecs.Ec2TaskDefinition(this, 'task');
    this.container = this.task.addContainer(
      'runner',
      {
        image: ecs.AssetImage.fromEcrRepository(image.imageRepository, image.imageTag),
        cpu: props?.cpu ?? 1024,
        memoryLimitMiB: props?.memoryLimitMiB ?? (props?.memoryReservationMiB ? undefined : 3500),
        memoryReservationMiB: props?.memoryReservationMiB,
        logging: ecs.AwsLogDriver.awsLogs({
          logGroup: this.logGroup,
          streamPrefix: 'runner',
        }),
        command: ecsRunCommand(this.image.os, this.dind),
        user: image.os.is(Os.WINDOWS) ? undefined : 'runner',
        privileged: this.dind,
      },
    );

    this.grantPrincipal = this.task.taskRole;

    // permissions for SSM Session Manager
    this.task.taskRole.addToPrincipalPolicy(MINIMAL_ECS_SSM_SESSION_MANAGER_POLICY_STATEMENT);
  }

  private defaultClusterInstanceType() {
    if (this.image.architecture.is(Architecture.X86_64)) {
      return ec2.InstanceType.of(ec2.InstanceClass.M6I, ec2.InstanceSize.LARGE);
    }
    if (this.image.architecture.is(Architecture.ARM64)) {
      return ec2.InstanceType.of(ec2.InstanceClass.M6G, ec2.InstanceSize.LARGE);
    }

    throw new Error(`Unable to find instance type for ECS instances for ${this.image.architecture.name}`);
  }

  private defaultClusterInstanceAmi() {
    let baseImage: ec2.IMachineImage;
    let ssmPath: string;
    let found = false;

    if (this.image.os.isIn(Os._ALL_LINUX_VERSIONS)) {
      if (this.image.architecture.is(Architecture.X86_64)) {
        baseImage = ecs.EcsOptimizedImage.amazonLinux2(ecs.AmiHardwareType.STANDARD);
        ssmPath = '/aws/service/ecs/optimized-ami/amazon-linux-2023/recommended/image_id';
        found = true;
      }
      if (this.image.architecture.is(Architecture.ARM64)) {
        baseImage = ecs.EcsOptimizedImage.amazonLinux2(ecs.AmiHardwareType.ARM);
        ssmPath = '/aws/service/ecs/optimized-ami/amazon-linux-2023/arm64/recommended/image_id';
        found = true;
      }
    }

    if (this.image.os.is(Os.WINDOWS)) {
      baseImage = ecs.EcsOptimizedImage.windows(ecs.WindowsOptimizedVersion.SERVER_2019);
      ssmPath = '/aws/service/ami-windows-latest/Windows_Server-2019-English-Full-ECS_Optimized/image_id';
      found = true;
    }

    if (!found) {
      throw new Error(`Unable to find AMI for ECS instances for ${this.image.os.name}/${this.image.architecture.name}`);
    }

    const image: ec2.IMachineImage = {
      getImage(scope: Construct): ec2.MachineImageConfig {
        const baseImageRes = baseImage.getImage(scope);

        return {
          imageId: `resolve:ssm:${ssmPath}`,
          userData: baseImageRes.userData,
          osType: baseImageRes.osType,
        };
      },
    };

    return image;
  }

  private pullCommand() {
    if (this.image.os.is(Os.WINDOWS)) {
      return `Start-Job -ScriptBlock { docker pull ${this.image.imageRepository.repositoryUri}:${this.image.imageTag} }`;
    }
    return `docker pull ${this.image.imageRepository.repositoryUri}:${this.image.imageTag} &`;
  }

  private loginCommands() {
    const thisStack = Stack.of(this);
    if (this.image.os.is(Os.WINDOWS)) {
      return [`(Get-ECRLoginCommand).Password | docker login --username AWS --password-stdin ${thisStack.account}.dkr.ecr.${thisStack.region}.amazonaws.com`];
    }
    return [
      'yum install -y awscli || dnf install -y awscli',
      `aws ecr get-login-password --region ${thisStack.region} | docker login --username AWS --password-stdin ${thisStack.account}.dkr.ecr.${thisStack.region}.amazonaws.com`,
    ];
  }

  private ecsSettingsCommands() {
    // don't let ECS accumulate too many stopped tasks that can end up very big in our case
    // the default is 10m duration with 1h jitter which can end up with 1h10m delay for cleaning up stopped tasks
    if (this.image.os.is(Os.WINDOWS)) {
      return [
        '[Environment]::SetEnvironmentVariable("ECS_ENGINE_TASK_CLEANUP_WAIT_DURATION", "5s", "Machine")',
        '[Environment]::SetEnvironmentVariable("ECS_ENGINE_TASK_CLEANUP_WAIT_DURATION_JITTER", "5s", "Machine")',
      ];
    }
    return [
      'echo ECS_ENGINE_TASK_CLEANUP_WAIT_DURATION=5s >> /etc/ecs/ecs.config',
      'echo ECS_ENGINE_TASK_CLEANUP_WAIT_DURATION_JITTER=5s >> /etc/ecs/ecs.config',
    ];
  }

  /**
   * Generate step function task(s) to start a new runner.
   *
   * Called by GithubRunners and shouldn't be called manually.
   *
   * @param parameters workflow job details
   */
  getStepFunctionTask(parameters: RunnerRuntimeParameters): stepfunctions.IChainable {
    return new stepfunctions_tasks.EcsRunTask(
      this,
      this.labels.join(', '),
      {
        integrationPattern: IntegrationPattern.RUN_JOB, // sync
        taskDefinition: this.task,
        cluster: this.cluster,
        launchTarget: new EcsEc2LaunchTarget({
          capacityProvider: this.capacityProvider.capacityProviderName,
          enableExecute: this.image.os.isIn(Os._ALL_LINUX_VERSIONS),
        }),
        assignPublicIp: this.assignPublicIp,
        containerOverrides: [
          {
            containerDefinition: this.container,
            environment: [
              {
                name: 'RUNNER_TOKEN',
                value: parameters.runnerTokenPath,
              },
              {
                name: 'RUNNER_NAME',
                value: parameters.runnerNamePath,
              },
              {
                name: 'RUNNER_LABEL',
                value: this.labels.join(','),
              },
              {
                name: 'GITHUB_DOMAIN',
                value: parameters.githubDomainPath,
              },
              {
                name: 'OWNER',
                value: parameters.ownerPath,
              },
              {
                name: 'REPO',
                value: parameters.repoPath,
              },
              {
                name: 'REGISTRATION_URL',
                value: parameters.registrationUrl,
              },
            ],
          },
        ],
      },
    );
  }

  grantStateMachine(_: iam.IGrantable) {
  }

  status(statusFunctionRole: iam.IGrantable): IRunnerProviderStatus {
    this.image.imageRepository.grant(statusFunctionRole, 'ecr:DescribeImages');

    return {
      type: this.constructor.name,
      labels: this.labels,
      vpcArn: this.vpc?.vpcArn,
      securityGroups: this.securityGroups.map(sg => sg.securityGroupId),
      roleArn: this.task.taskRole.roleArn,
      logGroup: this.logGroup.logGroupName,
      image: {
        imageRepository: this.image.imageRepository.repositoryUri,
        imageTag: this.image.imageTag,
        imageBuilderLogGroup: this.image.logGroup?.logGroupName,
      },
    };
  }
}
