import * as path from 'path';
import {
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_iam as iam,
  aws_logs as logs,
  aws_stepfunctions as stepfunctions,
  aws_stepfunctions_tasks as stepfunctions_tasks,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IntegrationPattern } from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import {
  Architecture,
  BaseProvider,
  IImageBuilder,
  IRunnerProvider,
  IRunnerProviderStatus,
  Os,
  RunnerImage,
  RunnerProviderProps,
  RunnerRuntimeParameters,
  RunnerVersion,
} from './common';
import { CodeBuildImageBuilder } from './image-builders/codebuild';

/**
 * Properties for FargateRunner.
 */
export interface FargateRunnerProviderProps extends RunnerProviderProps {
  /**
   * Provider running an image to run inside CodeBuild with GitHub runner pre-configured. A user named `runner` is expected to exist.
   *
   * The image builder determines the OS and architecture of the runner.
   *
   * @default image builder with `FargateRunner.LINUX_X64_DOCKERFILE_PATH` as Dockerfile
   */
  readonly imageBuilder?: IImageBuilder;

  /**
   * GitHub Actions label used for this provider.
   *
   * @default undefined
   * @deprecated use {@link labels} instead
   */
  readonly label?: string;

  /**
   * GitHub Actions labels used for this provider.
   *
   * These labels are used to identify which provider should spawn a new on-demand runner. Every job sends a webhook with the labels it's looking for
   * based on runs-on. We match the labels from the webhook with the labels specified here. If all the labels specified here are present in the
   * job's labels, this provider will be chosen and spawn a new runner.
   *
   * @default ['fargate']
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
   * @default Fargate default
   */
  readonly subnetSelection?: ec2.SubnetSelection;

  /**
   * Security group to assign to the task.
   *
   * @default a new security group
   *
   * @deprecated use {@link securityGroups}
   */
  readonly securityGroup?: ec2.ISecurityGroup;

  /**
   * Security groups to assign to the task.
   *
   * @default a new security group
   */
  readonly securityGroups?: ec2.ISecurityGroup[];

  /**
   * Existing Fargate cluster to use.
   *
   * @default a new cluster
   */
  readonly cluster?: ecs.Cluster;

  /**
   * Assign public IP to the runner task.
   *
   * Make sure the task will have access to GitHub. A public IP might be required unless you have NAT gateway.
   *
   * @default true
   */
  readonly assignPublicIp?: boolean;

  /**
   * The number of cpu units used by the task. For tasks using the Fargate launch type,
   * this field is required and you must use one of the following values,
   * which determines your range of valid values for the memory parameter:
   *
   * 256 (.25 vCPU) - Available memory values: 512 (0.5 GB), 1024 (1 GB), 2048 (2 GB)
   *
   * 512 (.5 vCPU) - Available memory values: 1024 (1 GB), 2048 (2 GB), 3072 (3 GB), 4096 (4 GB)
   *
   * 1024 (1 vCPU) - Available memory values: 2048 (2 GB), 3072 (3 GB), 4096 (4 GB), 5120 (5 GB), 6144 (6 GB), 7168 (7 GB), 8192 (8 GB)
   *
   * 2048 (2 vCPU) - Available memory values: Between 4096 (4 GB) and 16384 (16 GB) in increments of 1024 (1 GB)
   *
   * 4096 (4 vCPU) - Available memory values: Between 8192 (8 GB) and 30720 (30 GB) in increments of 1024 (1 GB)
   *
   * @default 1024
   */
  readonly cpu?: number;

  /**
   * The amount (in MiB) of memory used by the task. For tasks using the Fargate launch type,
   * this field is required and you must use one of the following values, which determines your range of valid values for the cpu parameter:
   *
   * 512 (0.5 GB), 1024 (1 GB), 2048 (2 GB) - Available cpu values: 256 (.25 vCPU)
   *
   * 1024 (1 GB), 2048 (2 GB), 3072 (3 GB), 4096 (4 GB) - Available cpu values: 512 (.5 vCPU)
   *
   * 2048 (2 GB), 3072 (3 GB), 4096 (4 GB), 5120 (5 GB), 6144 (6 GB), 7168 (7 GB), 8192 (8 GB) - Available cpu values: 1024 (1 vCPU)
   *
   * Between 4096 (4 GB) and 16384 (16 GB) in increments of 1024 (1 GB) - Available cpu values: 2048 (2 vCPU)
   *
   * Between 8192 (8 GB) and 30720 (30 GB) in increments of 1024 (1 GB) - Available cpu values: 4096 (4 vCPU)
   *
   * @default 2048
   */
  readonly memoryLimitMiB?: number;

  /**
   * The amount (in GiB) of ephemeral storage to be allocated to the task. The maximum supported value is 200 GiB.
   *
   * NOTE: This parameter is only supported for tasks hosted on AWS Fargate using platform version 1.4.0 or later.
   *
   * @default 20
   */
  readonly ephemeralStorageGiB?: number;

  /**
   * Use Fargate spot capacity provider to save money.
   *
   * * Runners may fail to start due to missing capacity.
   * * Runners might be stopped prematurely with spot pricing.
   *
   * @default false
   */
  readonly spot?: boolean;
}

/**
 * Properties for EcsFargateLaunchTarget.
 */
interface EcsFargateLaunchTargetProps {
  readonly spot: boolean;
  readonly enableExecute: boolean;
}

/**
 * Our special launch target that can use spot instances and set EnableExecuteCommand.
 */
class EcsFargateLaunchTarget implements stepfunctions_tasks.IEcsLaunchTarget {
  constructor(readonly props: EcsFargateLaunchTargetProps) {
  }

  /**
   * Called when the Fargate launch type configured on RunTask
   */
  public bind(_task: stepfunctions_tasks.EcsRunTask,
    launchTargetOptions: stepfunctions_tasks.LaunchTargetBindOptions): stepfunctions_tasks.EcsLaunchTargetConfig {
    if (!launchTargetOptions.taskDefinition.isFargateCompatible) {
      throw new Error('Supplied TaskDefinition is not compatible with Fargate');
    }

    return {
      parameters: {
        EnableExecuteCommand: this.props.enableExecute,
        CapacityProviderStrategy: [
          {
            CapacityProvider: this.props.spot ? 'FARGATE_SPOT' : 'FARGATE',
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
export class FargateRunnerProvider extends BaseProvider implements IRunnerProvider {
  /**
   * Path to Dockerfile for Linux x64 with all the requirement for Fargate runner. Use this Dockerfile unless you need to customize it further than allowed by hooks.
   *
   * Available build arguments that can be set in the image builder:
   * * `BASE_IMAGE` sets the `FROM` line. This should be an Ubuntu compatible image.
   * * `EXTRA_PACKAGES` can be used to install additional packages.
   */
  public static readonly LINUX_X64_DOCKERFILE_PATH = path.join(__dirname, '..', '..', 'assets', 'docker-images', 'fargate', 'linux-x64');

  /**
   * Path to Dockerfile for Linux ARM64 with all the requirement for Fargate runner. Use this Dockerfile unless you need to customize it further than allowed by hooks.
   *
   * Available build arguments that can be set in the image builder:
   * * `BASE_IMAGE` sets the `FROM` line. This should be an Ubuntu compatible image.
   * * `EXTRA_PACKAGES` can be used to install additional packages.
   */
  public static readonly LINUX_ARM64_DOCKERFILE_PATH = path.join(__dirname, '..', '..', 'assets', 'docker-images', 'fargate', 'linux-arm64');

  /**
   * Cluster hosting the task hosting the runner.
   */
  readonly cluster: ecs.Cluster;

  /**
   * Fargate task hosting the runner.
   */
  readonly task: ecs.FargateTaskDefinition;

  /**
   * Container definition hosting the runner.
   */
  readonly container: ecs.ContainerDefinition;

  /**
   * Labels associated with this provider.
   */
  readonly labels: string[];

  /**
   * VPC used for hosting the runner task.
   */
  readonly vpc?: ec2.IVpc;

  /**
   * Subnets used for hosting the runner task.
   */
  readonly subnetSelection?: ec2.SubnetSelection;

  /**
   * Whether runner task will have a public IP.
   */
  readonly assignPublicIp: boolean;

  /**
   * Grant principal used to add permissions to the runner role.
   */
  readonly grantPrincipal: iam.IPrincipal;

  /**
   * The network connections associated with this resource.
   */
  readonly connections: ec2.Connections;

  /**
   * Use spot pricing for Fargate tasks.
   */
  readonly spot: boolean;

  /**
   * Docker image loaded with GitHub Actions Runner and its prerequisites. The image is built by an image builder and is specific to Fargate tasks.
   */
  readonly image: RunnerImage;

  /**
   * Log group where provided runners will save their logs.
   *
   * Note that this is not the job log, but the runner itself. It will not contain output from the GitHub Action but only metadata on its execution.
   */
  readonly logGroup: logs.ILogGroup;

  private readonly securityGroups: ec2.ISecurityGroup[];

  constructor(scope: Construct, id: string, props?: FargateRunnerProviderProps) {
    super(scope, id, props);

    this.labels = this.labelsFromProperties('fargate', props?.label, props?.labels);
    this.vpc = props?.vpc ?? ec2.Vpc.fromLookup(this, 'default vpc', { isDefault: true });
    this.subnetSelection = props?.subnetSelection;
    this.securityGroups = props?.securityGroup ? [props.securityGroup] : (props?.securityGroups ?? [new ec2.SecurityGroup(this, 'security group', { vpc: this.vpc })]);
    this.connections = new ec2.Connections({ securityGroups: this.securityGroups });
    this.assignPublicIp = props?.assignPublicIp ?? true;
    this.cluster = props?.cluster ? props.cluster : new ecs.Cluster(
      this,
      'cluster',
      {
        vpc: this.vpc,
        enableFargateCapacityProviders: true,
      },
    );
    this.spot = props?.spot ?? false;

    const imageBuilder = props?.imageBuilder ?? new CodeBuildImageBuilder(this, 'Image Builder', {
      dockerfilePath: FargateRunnerProvider.LINUX_X64_DOCKERFILE_PATH,
    });
    const image = this.image = imageBuilder.bind();

    let arch: ecs.CpuArchitecture;
    if (image.architecture.is(Architecture.ARM64)) {
      arch = ecs.CpuArchitecture.ARM64;
    } else if (image.architecture.is(Architecture.X86_64)) {
      arch = ecs.CpuArchitecture.X86_64;
    } else {
      throw new Error(`${image.architecture.name} is not supported on Fargate`);
    }

    let os: ecs.OperatingSystemFamily;
    if (image.os.is(Os.LINUX)) {
      os = ecs.OperatingSystemFamily.LINUX;
    } else if (image.os.is(Os.WINDOWS)) {
      os = ecs.OperatingSystemFamily.WINDOWS_SERVER_2019_CORE;
      if (props?.ephemeralStorageGiB) {
        throw new Error('Ephemeral storage is not supported on Fargate Windows');
      }
    } else {
      throw new Error(`${image.os.name} is not supported on Fargate`);
    }

    this.logGroup = new logs.LogGroup(this, 'logs', {
      retention: props?.logRetention ?? RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.task = new ecs.FargateTaskDefinition(
      this,
      'task',
      {
        cpu: props?.cpu ?? 1024,
        memoryLimitMiB: props?.memoryLimitMiB ?? 2048,
        ephemeralStorageGiB: props?.ephemeralStorageGiB ?? !image.os.is(Os.WINDOWS) ? 25 : undefined,
        runtimePlatform: {
          operatingSystemFamily: os,
          cpuArchitecture: arch,
        },
      },
    );
    this.container = this.task.addContainer(
      'runner',
      {
        image: ecs.AssetImage.fromEcrRepository(image.imageRepository, image.imageTag),
        logging: ecs.AwsLogDriver.awsLogs({
          logGroup: this.logGroup,
          streamPrefix: 'runner',
        }),
        command: this.runCommand(),
      },
    );

    this.grantPrincipal = new iam.UnknownPrincipal({ resource: this.task.taskRole });
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
        launchTarget: new EcsFargateLaunchTarget({
          spot: this.spot,
          enableExecute: this.image.os.is(Os.LINUX),
        }),
        subnets: this.subnetSelection,
        assignPublicIp: this.assignPublicIp,
        securityGroups: this.securityGroups,
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

  private runCommand(): string[] {
    let runnerFlags = '';
    if (this.image.runnerVersion.is(RunnerVersion.latest())) {
      runnerFlags = '--disableupdate';
    }

    if (this.image.os.is(Os.LINUX)) {
      return [
        'sh', '-c',
        `./config.sh --unattended --url "https://$GITHUB_DOMAIN/$OWNER/$REPO" --token "$RUNNER_TOKEN" --ephemeral --work _work --labels "$RUNNER_LABEL" ${runnerFlags} --name "$RUNNER_NAME" && 
        ./run.sh &&
        STATUS=$(grep -Phors "finish job request for job [0-9a-f\\-]+ with result: \\K.*" _diag/ | tail -n1) &&
        [ -n "$STATUS" ] && echo CDKGHA JOB DONE "$RUNNER_LABEL" "$STATUS"`,
      ];
    } else if (this.image.os.is(Os.WINDOWS)) {
      return [
        'powershell', '-Command',
        `cd \\actions ; ./config.cmd --unattended --url "https://\${Env:GITHUB_DOMAIN}/\${Env:OWNER}/\${Env:REPO}" --token "\${Env:RUNNER_TOKEN}" --ephemeral --work _work --labels "\${Env:RUNNER_LABEL}" ${runnerFlags} --name "\${Env:RUNNER_NAME}" ; 
        ./run.cmd ; 
        $STATUS = Select-String -Path './_diag/*.log' -Pattern 'finish job request for job [0-9a-f\\-]+ with result: (.*)' | %{$_.Matches.Groups[1].Value} | Select-Object -Last 1 ; 
        if ($STATUS) { echo "CDKGHA JOB DONE $\{Env:RUNNER_LABEL\} $STATUS" }`,
      ];
    } else {
      throw new Error(`Fargate runner doesn't support ${this.image.os.name}`);
    }
  }
}

/**
 * @deprecated use {@link FargateRunnerProvider}
 */
export class FargateRunner extends FargateRunnerProvider {
}
