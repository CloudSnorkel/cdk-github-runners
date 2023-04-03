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
import { IRunnerImageBuilder, RunnerImageBuilder, RunnerImageBuilderProps, RunnerImageComponent } from './image-builders';

/**
 * Properties for FargateRunner.
 */
export interface FargateRunnerProviderProps extends RunnerProviderProps {
  /**
   * Runner image builder used to build Docker images containing GitHub Runner and all requirements.
   *
   * The image builder determines the OS and architecture of the runner.
   *
   * @default FargateRunnerProviderProps.imageBuilder()
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
   * @default 3500
   */
  readonly memoryLimitMiB?: number;

  /**
   * Instance type of ECS cluster instances. Only used when creating a new cluster.
   *
   * @default m5.large or m6g.large
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
}

interface EcsEc2LaunchTargetProps {
  readonly capacityProvider: string;
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
 * GitHub Actions runner provider using Fargate to execute jobs.
 *
 * Creates a task definition with a single container that gets started for each job.
 *
 * This construct is not meant to be used by itself. It should be passed in the providers property for GitHubRunners.
 */
export class EcsRunnerProvider extends BaseProvider implements IRunnerProvider {
  /**
   * Create new image builder that builds Fargate specific runner images using Ubuntu.
   *
   * Included components:
   *  * `RunnerImageComponent.requiredPackages()`
   *  * `RunnerImageComponent.runnerUser()`
   *  * `RunnerImageComponent.git()`
   *  * `RunnerImageComponent.githubCli()`
   *  * `RunnerImageComponent.awsCli()`
   *  * `RunnerImageComponent.dockerInDocker()`
   *  * `RunnerImageComponent.githubRunner()`
   */
  public static imageBuilder(scope: Construct, id: string, props?: RunnerImageBuilderProps): RunnerImageBuilder {
    return RunnerImageBuilder.new(scope, id, {
      os: Os.LINUX_UBUNTU,
      architecture: Architecture.X86_64,
      components: [
        RunnerImageComponent.requiredPackages(),
        RunnerImageComponent.runnerUser(),
        RunnerImageComponent.git(),
        RunnerImageComponent.githubCli(),
        RunnerImageComponent.awsCli(),
        RunnerImageComponent.dockerInDocker(),
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
   * Fargate task hosting the runner.
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
   * Docker image loaded with GitHub Actions Runner and its prerequisites. The image is built by an image builder and is specific to Fargate tasks.
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

  constructor(scope: Construct, id: string, props?: FargateRunnerProviderProps) {
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

    this.capacityProvider = props?.capacityProvider ?? new ecs.AsgCapacityProvider(this, 'Capacity Provider', {
      autoScalingGroup: new autoscaling.AutoScalingGroup(this, 'Auto Scaling Group', {
        vpc: this.vpc,
        vpcSubnets: this.subnetSelection,
        minCapacity: props?.minInstances ?? 0,
        maxCapacity: props?.maxInstances ?? 5,
        machineImage: this.defaultClusterInstanceAmi(),
        instanceType: props?.instanceType ?? this.defaultClusterInstaceType(),
      }),
      spotInstanceDraining: false, // waste of money to restart jobs as the restarted job won't have a token
    });
    this.securityGroups.map(sg => this.capacityProvider.autoScalingGroup.addSecurityGroup(sg));
    this.capacityProvider.autoScalingGroup.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));
    const thisStack = Stack.of(this);
    this.capacityProvider.autoScalingGroup.addUserData(
      `aws ecr get-login-password --region ${thisStack.region} | docker login --username AWS --password-stdin ${thisStack.account}.dkr.ecr.${thisStack.region}.amazonaws.com`,
      `docker pull ${image.imageRepository.repositoryUri}:${image.imageTag}`,
    );
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

    this.task = new ecs.Ec2TaskDefinition(this, 'task');
    this.container = this.task.addContainer(
      'runner',
      {
        image: ecs.AssetImage.fromEcrRepository(image.imageRepository, image.imageTag),
        cpu: props?.cpu ?? 1024,
        memoryLimitMiB: props?.memoryLimitMiB ?? 3500,
        logging: ecs.AwsLogDriver.awsLogs({
          logGroup: this.logGroup,
          streamPrefix: 'runner',
        }),
        command: ecsRunCommand(this.image.os),
        user: image.os.is(Os.WINDOWS) ? undefined : 'runner',
      },
    );

    this.grantPrincipal = this.task.taskRole;
  }

  private defaultClusterInstaceType() {
    if (this.image.architecture.is(Architecture.X86_64)) {
      return ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.LARGE);
    }
    if (this.image.architecture.is(Architecture.ARM64)) {
      return ec2.InstanceType.of(ec2.InstanceClass.M6G, ec2.InstanceSize.LARGE);
    }

    throw new Error(`Unable to find instance type for ECS instances for ${this.image.architecture.name}`);
  }

  private defaultClusterInstanceAmi() {
    if (this.image.os.is(Os.LINUX) || this.image.os.is(Os.LINUX_UBUNTU) || this.image.os.is(Os.LINUX_AMAZON_2)) {
      if (this.image.architecture.is(Architecture.X86_64)) {
        return ecs.EcsOptimizedImage.amazonLinux2(ecs.AmiHardwareType.STANDARD);
      }
      if (this.image.architecture.is(Architecture.ARM64)) {
        return ecs.EcsOptimizedImage.amazonLinux2(ecs.AmiHardwareType.ARM);
      }
    }

    if (this.image.os.is(Os.WINDOWS)) {
      return ecs.EcsOptimizedImage.windows(ecs.WindowsOptimizedVersion.SERVER_2019);
    }

    throw new Error(`Unable to find AMI for ECS instances for ${this.image.os.name}/${this.image.architecture.name}`);
  }

  /**
   * Generate step function task(s) to start a new runner.
   *
   * Called by GithubRunners and shouldn't be called manually.
   *
   * @param parameters workflow job details
   */
  getStepFunctionTask(parameters: RunnerRuntimeParameters): stepfunctions.IChainable {
    const task = new stepfunctions_tasks.EcsRunTask(
      this,
      this.labels.join(', '),
      {
        integrationPattern: IntegrationPattern.RUN_JOB, // sync
        taskDefinition: this.task,
        cluster: this.cluster,
        launchTarget: new EcsEc2LaunchTarget({ capacityProvider: this.capacityProvider.capacityProviderName }),
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
            ],
          },
        ],
      },
    );

    this.addRetry(task, ['Ecs.EcsException', 'Ecs.LimitExceededException', 'Ecs.UpdateInProgressException']);

    return task;
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
