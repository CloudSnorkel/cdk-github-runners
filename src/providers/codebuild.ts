import * as path from 'path';
import {
  Annotations,
  aws_codebuild as codebuild,
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_logs as logs,
  aws_stepfunctions as stepfunctions,
  aws_stepfunctions_tasks as stepfunctions_tasks,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { ComputeType } from 'aws-cdk-lib/aws-codebuild';
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
import { IRunnerImageBuilder, RunnerImageBuilder, RunnerImageBuilderProps, RunnerImageComponent } from '../image-builders';


export interface CodeBuildRunnerProviderProps extends RunnerProviderProps {
  /**
   * Runner image builder used to build Docker images containing GitHub Runner and all requirements.
   *
   * The image builder must contain the {@link RunnerImageComponent.docker} component unless `dockerInDocker` is set to false.
   *
   * The image builder determines the OS and architecture of the runner.
   *
   * @default CodeBuildRunnerProvider.imageBuilder()
   */
  readonly imageBuilder?: IRunnerImageBuilder;

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
   * @default ['codebuild']
   */
  readonly labels?: string[];

  /**
   * VPC to launch the runners in.
   *
   * @default no VPC
   */
  readonly vpc?: ec2.IVpc;

  /**
   * Security group to assign to this instance.
   *
   * @default public project with no security group
   *
   * @deprecated use {@link securityGroups}
   */
  readonly securityGroup?: ec2.ISecurityGroup;

  /**
   * Security groups to assign to this instance.
   *
   * @default a new security group, if {@link vpc} is used
   */
  readonly securityGroups?: ec2.ISecurityGroup[];

  /**
   * Where to place the network interfaces within the VPC.
   *
   * @default no subnet
   */
  readonly subnetSelection?: ec2.SubnetSelection;

  /**
   * The type of compute to use for this build.
   * See the {@link ComputeType} enum for the possible values.
   *
   * @default {@link ComputeType#SMALL}
   */
  readonly computeType?: codebuild.ComputeType;

  /**
   * The number of minutes after which AWS CodeBuild stops the build if it's
   * not complete. For valid values, see the timeoutInMinutes field in the AWS
   * CodeBuild User Guide.
   *
   * @default Duration.hours(1)
   */
  readonly timeout?: Duration;

  /**
   * Support building and running Docker images by enabling Docker-in-Docker (dind) and the required CodeBuild privileged mode. Disabling this can
   * speed up provisioning of CodeBuild runners. If you don't intend on running or building Docker images, disable this for faster start-up times.
   *
   * @default true
   */
  readonly dockerInDocker?: boolean;
}

/**
 * GitHub Actions runner provider using CodeBuild to execute jobs.
 *
 * Creates a project that gets started for each job.
 *
 * This construct is not meant to be used by itself. It should be passed in the providers property for GitHubRunners.
 */
export class CodeBuildRunnerProvider extends BaseProvider implements IRunnerProvider {
  /**
   * Path to Dockerfile for Linux x64 with all the requirements for CodeBuild runner. Use this Dockerfile unless you need to customize it further than allowed by hooks.
   *
   * Available build arguments that can be set in the image builder:
   * * `BASE_IMAGE` sets the `FROM` line. This should be an Ubuntu compatible image.
   * * `EXTRA_PACKAGES` can be used to install additional packages.
   * * `DOCKER_CHANNEL` overrides the channel from which Docker will be downloaded. Defaults to `"stable"`.
   * * `DIND_COMMIT` overrides the commit where dind is found.
   * * `DOCKER_VERSION` overrides the installed Docker version.
   * * `DOCKER_COMPOSE_VERSION` overrides the installed docker-compose version.
   *
   * @deprecated Use `imageBuilder()` instead.
   */
  public static readonly LINUX_X64_DOCKERFILE_PATH = path.join(__dirname, '..', '..', 'assets', 'docker-images', 'codebuild', 'linux-x64');

  /**
   * Path to Dockerfile for Linux ARM64 with all the requirements for CodeBuild runner. Use this Dockerfile unless you need to customize it further than allowed by hooks.
   *
   * Available build arguments that can be set in the image builder:
   * * `BASE_IMAGE` sets the `FROM` line. This should be an Ubuntu compatible image.
   * * `EXTRA_PACKAGES` can be used to install additional packages.
   * * `DOCKER_CHANNEL` overrides the channel from which Docker will be downloaded. Defaults to `"stable"`.
   * * `DIND_COMMIT` overrides the commit where dind is found.
   * * `DOCKER_VERSION` overrides the installed Docker version.
   * * `DOCKER_COMPOSE_VERSION` overrides the installed docker-compose version.
   *
   * @deprecated Use `imageBuilder()` instead.
   */
  public static readonly LINUX_ARM64_DOCKERFILE_PATH = path.join(__dirname, '..', '..', 'assets', 'docker-images', 'codebuild', 'linux-arm64');

  /**
   * Create new image builder that builds CodeBuild specific runner images.
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
   * CodeBuild project hosting the runner.
   */
  readonly project: codebuild.Project;

  /**
   * Labels associated with this provider.
   */
  readonly labels: string[];

  /**
   * Grant principal used to add permissions to the runner role.
   */
  readonly grantPrincipal: iam.IPrincipal;

  /**
   * Docker image loaded with GitHub Actions Runner and its prerequisites. The image is built by an image builder and is specific to CodeBuild.
   */
  readonly image: RunnerImage;

  /**
   * Log group where provided runners will save their logs.
   *
   * Note that this is not the job log, but the runner itself. It will not contain output from the GitHub Action but only metadata on its execution.
   */
  readonly logGroup: logs.ILogGroup;

  readonly retryableErrors = [
    'CodeBuild.CodeBuildException',
    'CodeBuild.AccountLimitExceededException',
  ];

  private readonly vpc?: ec2.IVpc;
  private readonly securityGroups?: ec2.ISecurityGroup[];
  private readonly dind: boolean;

  constructor(scope: Construct, id: string, props?: CodeBuildRunnerProviderProps) {
    super(scope, id, props);

    // warn against isolated networks
    if (props?.subnetSelection?.subnetType == ec2.SubnetType.PRIVATE_ISOLATED) {
      Annotations.of(this).addWarning('Private isolated subnets cannot pull from public ECR and VPC endpoint is not supported yet. ' +
        'See https://github.com/aws/containers-roadmap/issues/1160');
    }

    // error out on no-nat networks because the build will hang
    if (props?.subnetSelection?.subnetType == ec2.SubnetType.PUBLIC) {
      Annotations.of(this).addError('Public subnets do not work with CodeBuild as it cannot be assigned an IP. ' +
        'See https://docs.aws.amazon.com/codebuild/latest/userguide/vpc-support.html#best-practices-for-vpcs');
    }

    this.labels = this.labelsFromProperties('codebuild', props?.label, props?.labels);
    this.vpc = props?.vpc;
    if (props?.securityGroup) {
      this.securityGroups = [props.securityGroup];
    } else {
      if (props?.securityGroups) {
        this.securityGroups = props.securityGroups;
      } else {
        if (this.vpc) {
          this.securityGroups = [new ec2.SecurityGroup(this, 'SG', { vpc: this.vpc })];
        }
      }
    }

    this.dind = props?.dockerInDocker ?? true;

    let buildSpec = {
      version: '0.2',
      env: {
        variables: {
          RUNNER_TOKEN: 'unspecified',
          RUNNER_NAME: 'unspecified',
          RUNNER_LABEL: 'unspecified',
          OWNER: 'unspecified',
          REPO: 'unspecified',
          GITHUB_DOMAIN: 'github.com',
          REGISTRATION_URL: 'unspecified',
        },
      },
      phases: {
        install: {
          commands: [
            this.dind ? 'nohup dockerd --host=unix:///var/run/docker.sock --host=tcp://127.0.0.1:2375 --storage-driver=overlay2 &' : '',
            this.dind ? 'timeout 15 sh -c "until docker info; do echo .; sleep 1; done"' : '',
            'if [ "${RUNNER_VERSION}" = "latest" ]; then RUNNER_FLAGS=""; else RUNNER_FLAGS="--disableupdate"; fi',
            'sudo -Hu runner /home/runner/config.sh --unattended --url "${REGISTRATION_URL}" --token "${RUNNER_TOKEN}" --ephemeral --work _work --labels "${RUNNER_LABEL},cdkghr:started:`date +%s`" ${RUNNER_FLAGS} --name "${RUNNER_NAME}"',
          ],
        },
        build: {
          commands: [
            'sudo --preserve-env=AWS_CONTAINER_CREDENTIALS_RELATIVE_URI,AWS_DEFAULT_REGION,AWS_REGION -Hu runner /home/runner/run.sh',
            'STATUS=$(grep -Phors "finish job request for job [0-9a-f\\-]+ with result: \\K.*" /home/runner/_diag/ | tail -n1)',
            '[ -n "$STATUS" ] && echo CDKGHA JOB DONE "$RUNNER_LABEL" "$STATUS"',
          ],
        },
      },
    };

    const imageBuilder = props?.imageBuilder ?? CodeBuildRunnerProvider.imageBuilder(this, 'Image Builder');
    const image = this.image = imageBuilder.bindDockerImage();

    if (image.os.is(Os.WINDOWS)) {
      buildSpec.phases.install.commands = [
        'cd \\actions',
        'if (${Env:RUNNER_VERSION} -eq "latest") { $RunnerFlags = "" } else { $RunnerFlags = "--disableupdate" }',
        './config.cmd --unattended --url "${Env:REGISTRATION_URL}" --token "${Env:RUNNER_TOKEN}" --ephemeral --work _work --labels "${Env:RUNNER_LABEL},cdkghr:started:$(Get-Date -UFormat %s)" ${RunnerFlags} --name "${Env:RUNNER_NAME}"',
      ];
      buildSpec.phases.build.commands = [
        'cd \\actions',
        './run.cmd',
        '$STATUS = Select-String -Path \'./_diag/*.log\' -Pattern \'finish job request for job [0-9a-f\\-]+ with result: (.*)\' | %{$_.Matches.Groups[1].Value} | Select-Object -Last 1',
        'if ($STATUS) { echo "CDKGHA JOB DONE $\{Env:RUNNER_LABEL\} $STATUS" }',
      ];
    }

    // choose build image
    let buildImage: codebuild.IBuildImage | undefined;
    if (image.os.isIn(Os._ALL_LINUX_VERSIONS)) {
      if (image.architecture.is(Architecture.X86_64)) {
        buildImage = codebuild.LinuxBuildImage.fromEcrRepository(image.imageRepository, image.imageTag);
      } else if (image.architecture.is(Architecture.ARM64)) {
        buildImage = codebuild.LinuxArmBuildImage.fromEcrRepository(image.imageRepository, image.imageTag);
      }
    }
    if (image.os.is(Os.WINDOWS)) {
      if (image.architecture.is(Architecture.X86_64)) {
        buildImage = codebuild.WindowsBuildImage.fromEcrRepository(image.imageRepository, image.imageTag, codebuild.WindowsImageType.SERVER_2019);
      }
    }

    if (buildImage === undefined) {
      throw new Error(`Unable to find supported CodeBuild image for ${image.os.name}/${image.architecture.name}`);
    }

    // create project
    this.logGroup = new logs.LogGroup(
      this,
      'Logs',
      {
        retention: props?.logRetention ?? RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      },
    );
    this.project = new codebuild.Project(
      this,
      'CodeBuild',
      {
        description: `GitHub Actions self-hosted runner for labels ${this.labels}`,
        buildSpec: codebuild.BuildSpec.fromObject(buildSpec),
        vpc: this.vpc,
        securityGroups: this.securityGroups,
        subnetSelection: props?.subnetSelection,
        timeout: props?.timeout ?? Duration.hours(1),
        environment: {
          buildImage,
          computeType: props?.computeType ?? ComputeType.SMALL,
          privileged: this.dind && !image.os.is(Os.WINDOWS),
        },
        logging: {
          cloudWatch: {
            logGroup: this.logGroup,
          },
        },
      },
    );

    this.grantPrincipal = this.project.grantPrincipal;

    // allow SSM Session Manager access
    // this.project.role?.addToPrincipalPolicy(MINIMAL_SSM_SESSION_MANAGER_POLICY_STATEMENT);
    // step function won't let us pass `debugSessionEnabled: true` unless we use batch, so we can't use this
  }

  /**
   * Generate step function task(s) to start a new runner.
   *
   * Called by GithubRunners and shouldn't be called manually.
   *
   * @param parameters workflow job details
   */
  getStepFunctionTask(parameters: RunnerRuntimeParameters): stepfunctions.IChainable {
    return new stepfunctions_tasks.CodeBuildStartBuild(
      this,
      this.labels.join(', '),
      {
        integrationPattern: IntegrationPattern.RUN_JOB, // sync
        project: this.project,
        environmentVariablesOverride: {
          RUNNER_TOKEN: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: parameters.runnerTokenPath,
          },
          RUNNER_NAME: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: parameters.runnerNamePath,
          },
          RUNNER_LABEL: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.labels.join(','),
          },
          GITHUB_DOMAIN: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: parameters.githubDomainPath,
          },
          OWNER: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: parameters.ownerPath,
          },
          REPO: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: parameters.repoPath,
          },
          REGISTRATION_URL: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: parameters.registrationUrl,
          },
        },
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
      securityGroups: this.securityGroups?.map(sg => sg.securityGroupId),
      roleArn: this.project.role?.roleArn,
      logGroup: this.logGroup.logGroupName,
      image: {
        imageRepository: this.image.imageRepository.repositoryUri,
        imageTag: this.image.imageTag,
        imageBuilderLogGroup: this.image.logGroup?.logGroupName,
      },
    };
  }

  /**
   * The network connections associated with this resource.
   */
  public get connections(): ec2.Connections {
    return this.project.connections;
  }
}

/**
 * @deprecated use {@link CodeBuildRunnerProvider}
 */
export class CodeBuildRunner extends CodeBuildRunnerProvider {
}
