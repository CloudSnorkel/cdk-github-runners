import * as path from 'path';
import {
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
import { Architecture, IImageBuilder, IRunnerProvider, Os, RunnerImage, RunnerProviderProps, RunnerRuntimeParameters } from './common';
import { CodeBuildImageBuilder } from './image-builders/codebuild';


export interface CodeBuildRunnerProps extends RunnerProviderProps {
  /**
   * Provider running an image to run inside CodeBuild with GitHub runner pre-configured. A user named `runner` is expected to exist with access to Docker-in-Docker.
   *
   * @default image builder with `CodeBuildRunner.LINUX_X64_DOCKERFILE_PATH` as Dockerfile
   */
  readonly imageBuilder?: IImageBuilder;

  /**
   * GitHub Actions label used for this provider.
   *
   * @default 'codebuild'
   */
  readonly label?: string;

  /**
   * VPC to launch the runners in.
   *
   * @default no VPC
   */
  readonly vpc?: ec2.IVpc;

  /**
   * Security Group to assign to this instance.
   *
   * @default public project with no security group
   */
  readonly securityGroup?: ec2.ISecurityGroup;

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
}

/**
 * GitHub Actions runner provider using CodeBuild to execute the actions.
 *
 * Creates a project that gets started for each job.
 *
 * This construct is not meant to be used by itself. It should be passed in the providers property for GitHubRunners.
 */
export class CodeBuildRunner extends Construct implements IRunnerProvider {
  /**
   * Path to Dockerfile for Linux x64 with all the requirements for CodeBuild runner. Use this Dockerfile unless you need to customize it further than allowed by hooks.
   *
   * Available build arguments that can be set in the image builder:
   * * `BASE_IMAGE` sets the `FROM` line. This should be an Ubuntu compatible image.
   * * `EXTRA_PACKAGES` can be used to install additional packages.
   * * `DOCKER_CHANNEL` overrides the channel from which Docker will be downloaded. Defaults to `"stsable"`.
   * * `DIND_COMMIT` overrides the commit where dind is found.
   * * `DOCKER_VERSION` overrides the installed Docker version.
   * * `DOCKER_COMPOSE_VERSION` overrides the installed docker-compose version.
   */
  public static readonly LINUX_X64_DOCKERFILE_PATH = path.join(__dirname, 'docker-images', 'codebuild', 'linux-x64');

  /**
   * Path to Dockerfile for Linux ARM64 with all the requirements for CodeBuild runner. Use this Dockerfile unless you need to customize it further than allowed by hooks.
   *
   * Available build arguments that can be set in the image builder:
   * * `BASE_IMAGE` sets the `FROM` line. This should be an Ubuntu compatible image.
   * * `EXTRA_PACKAGES` can be used to install additional packages.
   * * `DOCKER_CHANNEL` overrides the channel from which Docker will be downloaded. Defaults to `"stsable"`.
   * * `DIND_COMMIT` overrides the commit where dind is found.
   * * `DOCKER_VERSION` overrides the installed Docker version.
   * * `DOCKER_COMPOSE_VERSION` overrides the installed docker-compose version.
   */
  public static readonly LINUX_ARM64_DOCKERFILE_PATH = path.join(__dirname, 'docker-images', 'codebuild', 'linux-arm64');

  /**
   * CodeBuild project hosting the runner.
   */
  readonly project: codebuild.Project;

  /**
   * Label associated with this provider.
   */
  readonly label: string;

  /**
   * VPC used for hosting the project.
   */
  readonly vpc?: ec2.IVpc;

  /**
   * Security group attached to the task.
   */
  readonly securityGroup?: ec2.ISecurityGroup;

  /**
   * Grant principal used to add permissions to the runner role.
   */
  readonly grantPrincipal: iam.IPrincipal;

  /**
   * Docker image in CodeBuild project.
   */
  readonly image: RunnerImage;

  constructor(scope: Construct, id: string, props: CodeBuildRunnerProps) {
    super(scope, id);

    this.label = props.label ?? 'codebuild';
    this.vpc = props.vpc;
    this.securityGroup = props.securityGroup;

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
        },
      },
      phases: {
        install: {
          commands: [
            'nohup /usr/local/bin/dockerd --host=unix:///var/run/docker.sock --host=tcp://127.0.0.1:2375 --storage-driver=overlay2 &',
            'timeout 15 sh -c "until docker info; do echo .; sleep 1; done"',
            'sudo -Hu runner /home/runner/config.sh --unattended --url "https://${GITHUB_DOMAIN}/${OWNER}/${REPO}" --token "${RUNNER_TOKEN}" --ephemeral --work _work --labels "${RUNNER_LABEL}" --disableupdate --name "${RUNNER_NAME}"',
          ],
        },
        build: {
          commands: [
            'sudo -Hu runner /home/runner/run.sh',
          ],
        },
      },
    };

    const imageBuilder = props.imageBuilder ?? new CodeBuildImageBuilder(this, 'Image Builder', {
      dockerfilePath: CodeBuildRunner.LINUX_X64_DOCKERFILE_PATH,
    });
    const image = this.image = imageBuilder.bind();

    if (this.image.os.is(Os.WINDOWS)) {
      buildSpec.phases.install.commands = [
        'cd \\actions',
        './config.cmd --unattended --url "https://${Env:GITHUB_DOMAIN}/${Env:OWNER}/${Env:REPO}" --token "${Env:RUNNER_TOKEN}" --ephemeral --work _work --labels "${Env:RUNNER_LABEL}" --disableupdate --name "${Env:RUNNER_NAME}"',
      ];
      buildSpec.phases.build.commands = [
        'cd \\actions',
        './run.cmd',
      ];
    }

    // choose build image
    let buildImage: codebuild.IBuildImage | undefined;
    if (image.os.is(Os.LINUX)) {
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
    this.project = new codebuild.Project(
      this,
      'CodeBuild',
      {
        description: `GitHub Actions self-hosted runner for label "${this.label}"`,
        buildSpec: codebuild.BuildSpec.fromObject(buildSpec),
        vpc: this.vpc,
        securityGroups: this.securityGroup ? [this.securityGroup] : undefined,
        subnetSelection: props.subnetSelection,
        timeout: props.timeout ?? Duration.hours(1),
        environment: {
          buildImage,
          computeType: props.computeType ?? ComputeType.SMALL,
          privileged: this.image.os.is(Os.LINUX),
        },
        logging: {
          cloudWatch: {
            logGroup: new logs.LogGroup(
              this,
              'Logs',
              {
                retention: props.logRetention ?? RetentionDays.ONE_MONTH,
                removalPolicy: RemovalPolicy.DESTROY,
              },
            ),
          },
        },
      },
    );

    this.grantPrincipal = this.project.grantPrincipal;
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
      this.label,
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
            value: this.label,
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
        },
      },
    );
  }

  /**
   * The network connections associated with this resource.
   */
  public get connections(): ec2.Connections {
    return this.project.connections;
  }
}
