import * as crypto from 'crypto';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import {
  Annotations,
  aws_codebuild as codebuild,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_events as events,
  aws_events_targets as events_targets,
  aws_iam as iam,
  aws_imagebuilder as imagebuilder,
  aws_logs as logs,
  aws_s3_assets as s3_assets,
  CustomResource,
  Duration,
  RemovalPolicy,
  Stack,
} from 'aws-cdk-lib';
import { ComputeType } from 'aws-cdk-lib/aws-codebuild';
import { TagMutability, TagStatus } from 'aws-cdk-lib/aws-ecr';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { AmiRecipe } from './ami';
import { ImageBuilderComponent, uniqueImageBuilderName } from './common';
import { ContainerRecipe } from './container';
import { BuildImageFunction } from '../../lambdas/build-image-function';
import { DeleteAmiFunction } from '../../lambdas/delete-ami-function';
import { singletonLambda } from '../../utils';
import { Architecture, Os, RunnerAmi, RunnerImage, RunnerVersion } from '../common';

export interface RunnerImageAsset {
  readonly source: string;
  readonly target: string;
}

export abstract class RunnerImageComponent {
  static custom(commands: string[], assets?: RunnerImageAsset[]): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      getCommands(_os: Os, _architecture: Architecture) {
        return commands;
      }
      getAssets(_os: Os, _architecture: Architecture) {
        return assets ?? [];
      }
    }();
  }

  static requiredPackages(): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      getCommands(os: Os, architecture: Architecture): string[] {
        if (os.is(Os.LINUX_UBUNTU)) {
          let archUrl;
          if (architecture.is(Architecture.X86_64)) {
            archUrl = 'amd64';
          } else if (architecture.is(Architecture.ARM64)) {
            archUrl = 'arm64';
          } else {
            throw new Error(`Unsupported architecture for required packages: ${architecture.name}`);
          }

          return [
            'apt-get update',
            'DEBIAN_FRONTEND=noninteractive apt-get upgrade -y',
            'DEBIAN_FRONTEND=noninteractive apt-get install -y curl sudo jq bash zip unzip iptables software-properties-common ca-certificates',
            `curl -sfLo /tmp/amazon-cloudwatch-agent.deb https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/${archUrl}/latest/amazon-cloudwatch-agent.deb`,
            'dpkg -i -E /tmp/amazon-cloudwatch-agent.deb',
            'rm /tmp/amazon-cloudwatch-agent.deb',
          ];
        } else if (os.is(Os.LINUX_AMAZON_2)) {
          return [
            'yum update -y',
            'yum install -y jq tar gzip bzip2 which binutils zip unzip sudo shadow-utils',
          ];
        } else if (os.is(Os.WINDOWS)) {
          return [
            'Start-Process msiexec.exe -Wait -ArgumentList \'/i https://s3.amazonaws.com/amazoncloudwatch-agent/windows/amd64/latest/amazon-cloudwatch-agent.msi /qn\'',
          ];
        }

        throw new Error(`Unsupported OS for required packages: ${os.name}`);
      }
    };
  }

  static runnerUser(): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      getCommands(os: Os, _architecture: Architecture): string[] {
        if (os.is(Os.LINUX_UBUNTU)) {
          return [
            'addgroup runner',
            'adduser --system --disabled-password --home /home/runner --ingroup runner runner',
            'usermod -aG sudo runner',
            'echo "%sudo   ALL=(ALL:ALL) NOPASSWD: ALL" > /etc/sudoers.d/runner',
          ];
        } else if (os.is(Os.LINUX_AMAZON_2)) {
          return [
            '/usr/sbin/groupadd runner',
            '/usr/sbin/useradd --system --shell /usr/sbin/nologin --home-dir /home/runner --gid runner runner',
            'mkdir -p /home/runner',
            'chown runner /home/runner',
            'echo "%runner   ALL=(ALL:ALL) NOPASSWD: ALL" > /etc/sudoers.d/runner',
          ];
        } else if (os.is(Os.WINDOWS)) {
          return [];
        }

        throw new Error(`Unsupported OS for runner user: ${os.name}`);
      }
    };
  }

  static awsCli(): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      getCommands(os: Os, architecture: Architecture) {
        if (os.is(Os.LINUX_UBUNTU) || os.is(Os.LINUX_AMAZON_2)) {
          let archUrl: string;
          if (architecture.is(Architecture.X86_64)) {
            archUrl = 'x86_64';
          } else if (architecture.is(Architecture.ARM64)) {
            archUrl = 'aarch64';
          } else {
            throw new Error(`Unsupported architecture for awscli: ${architecture.name}`);
          }

          return [
            `curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-${archUrl}.zip" -o awscliv2.zip`,
            'unzip -q awscliv2.zip',
            './aws/install',
            'rm -rf awscliv2.zip aws',
          ];
        } else if (os.is(Os.WINDOWS)) {
          return [
            'Start-Process msiexec.exe -Wait -ArgumentList \'/i https://awscli.amazonaws.com/AWSCLIV2.msi /qn\'',
          ];
        }

        throw new Error(`Unknown os/architecture combo for awscli: ${os.name}/${architecture.name}`);
      }
    }();
  }

  static githubCli(): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      getCommands(os: Os, architecture: Architecture) {
        if (os.is(Os.LINUX_UBUNTU)) {
          return [
            'curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg',
            'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] ' +
            '  https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null',
            'apt-get update',
            'DEBIAN_FRONTEND=noninteractive apt-get install -y gh',
          ];
        } else if (os.is(Os.LINUX_AMAZON_2)) {
          return [
            'curl -fsSSL https://cli.github.com/packages/rpm/gh-cli.repo -o /etc/yum.repos.d/gh-cli.repo',
            'yum install -y gh',
          ];
        } else if (os.is(Os.WINDOWS)) {
          return [
            'cmd /c curl -w "%{redirect_url}" -fsS https://github.com/cli/cli/releases/latest > $Env:TEMP\\latest-gh',
            '$LatestUrl = Get-Content $Env:TEMP\\latest-gh',
            '$GH_VERSION = ($LatestUrl -Split \'/\')[-1].substring(1)',
            'Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_windows_amd64.msi" -OutFile gh.msi',
            'Start-Process msiexec.exe -Wait -ArgumentList \'/i gh.msi /qn\'',
            'del gh.msi',
          ];
        }

        throw new Error(`Unknown os/architecture combo for github cli: ${os.name}/${architecture.name}`);
      }
    }();
  }

  static git(): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      getCommands(os: Os, architecture: Architecture) {
        if (os.is(Os.LINUX_UBUNTU)) {
          return [
            'add-apt-repository ppa:git-core/ppa',
            'apt-get update',
            'DEBIAN_FRONTEND=noninteractive apt-get install -y git',
          ];
        } else if (os.is(Os.LINUX_AMAZON_2)) {
          return [
            'yum install -y git',
          ];
        } else if (os.is(Os.WINDOWS)) {
          return [
            'cmd /c curl -w "%{redirect_url}" -fsS https://github.com/git-for-windows/git/releases/latest > $Env:TEMP\\latest-git',
            '$LatestUrl = Get-Content $Env:TEMP\\latest-git',
            '$GIT_VERSION = ($LatestUrl -Split \'/\')[-1].substring(1)',
            '$GIT_VERSION_SHORT = ($GIT_VERSION -Split \'.windows.\')[0]',
            '$GIT_REVISION = ($GIT_VERSION -Split \'.windows.\')[1]',
            'If ($GIT_REVISION -gt 1) {$GIT_VERSION_SHORT = "$GIT_VERSION_SHORT.$GIT_REVISION"}',
            'Invoke-WebRequest -UseBasicParsing -Uri https://github.com/git-for-windows/git/releases/download/v${GIT_VERSION}/Git-${GIT_VERSION_SHORT}-64-bit.exe -OutFile git-setup.exe',
            'Start-Process git-setup.exe -Wait -ArgumentList \'/VERYSILENT\'',
            'del git-setup.exe',
          ];
        }

        throw new Error(`Unknown os/architecture combo for git: ${os.name}/${architecture.name}`);
      }
    }();
  }

  static githubRunner(runnerVersion: RunnerVersion): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      getCommands(os: Os, architecture: Architecture) {
        if (os.is(Os.LINUX_UBUNTU) || os.is(Os.LINUX_AMAZON_2)) {
          let versionCommand: string;
          if (runnerVersion.is(RunnerVersion.latest())) {
            versionCommand = 'RUNNER_VERSION=`curl -w "%{redirect_url}" -fsS https://github.com/actions/runner/releases/latest | grep -oE "[^/v]+$"`';
          } else {
            versionCommand = `RUNNER_VERSION='${runnerVersion.version}'`;
          }

          let archUrl;
          if (architecture.is(Architecture.X86_64)) {
            archUrl = 'x64';
          } else if (architecture.is(Architecture.ARM64)) {
            archUrl = 'arm64';
          } else {
            throw new Error(`Unsupported architecture for GitHub Runner: ${architecture.name}`);
          }

          let commands = [
            versionCommand,
            `curl -fsSLO "https://github.com/actions/runner/releases/download/v\${RUNNER_VERSION}/actions-runner-linux-${archUrl}-\${RUNNER_VERSION}.tar.gz"`,
            `tar -C /home/runner -xzf "actions-runner-linux-${archUrl}-\${RUNNER_VERSION}.tar.gz"`,
            `rm actions-runner-linux-${archUrl}-\${RUNNER_VERSION}.tar.gz`,
          ];

          if (os.is(Os.LINUX_UBUNTU)) {
            commands.push('/home/runner/bin/installdependencies.sh');
          } else if (os.is(Os.LINUX_AMAZON_2)) {
            commands.push('yum install -y openssl-libs krb5-libs zlib libicu60');
          }

          return commands;
        } else if (os.is(Os.WINDOWS)) {
          let runnerCommands: string[];
          if (runnerVersion.is(RunnerVersion.latest())) {
            runnerCommands = [
              'cmd /c curl -w "%{redirect_url}" -fsS https://github.com/actions/runner/releases/latest > $Env:TEMP\\latest-gha',
              '$LatestUrl = Get-Content $Env:TEMP\\latest-gha',
              '$RUNNER_VERSION = ($LatestUrl -Split \'/\')[-1].substring(1)',
            ];
          } else {
            runnerCommands = [`$RUNNER_VERSION = '${runnerVersion.version}'`];
          }

          return runnerCommands.concat([
            'Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-win-x64-${RUNNER_VERSION}.zip" -OutFile actions.zip',
            'Expand-Archive actions.zip -DestinationPath C:\\actions',
            'del actions.zip',
          ]);
        }

        throw new Error(`Unknown os/architecture combo for github runner: ${os.name}/${architecture.name}`);
      }
    }();
  }

  static docker(): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      getCommands(os: Os, architecture: Architecture) {
        if (os.is(Os.LINUX_UBUNTU)) {
          return [
            'curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker.gpg',
            'echo ' +
                '  "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ' +
                '  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null',
            'apt-get update',
            'DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin',
            'usermod -aG docker runner',
            'ln -s /usr/libexec/docker/cli-plugins/docker-compose /usr/bin/docker-compose',
          ];
        } else if (os.is(Os.LINUX_AMAZON_2)) {
          return [
            'yum install -y docker',
          ];
        } else if (os.is(Os.WINDOWS)) {
          return [
            'Invoke-WebRequest -UseBasicParsing -Uri https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe -OutFile docker-setup.exe',
            'Start-Process \'docker-setup.exe\' -Wait -ArgumentList \'/install --quiet --accept-license\'',
            'del docker-setup.exe',
            'cmd /c curl -w "%{redirect_url}" -fsS https://github.com/docker/compose/releases/latest > $Env:TEMP\\latest-docker-compose',
            '$LatestUrl = Get-Content $Env:TEMP\\latest-docker-compose',
            '$LatestDockerCompose = ($LatestUrl -Split \'/\')[-1]',
            'Invoke-WebRequest -UseBasicParsing -Uri  "https://github.com/docker/compose/releases/download/${LatestDockerCompose}/docker-compose-Windows-x86_64.exe" -OutFile $Env:ProgramFiles\\Docker\\docker-compose.exe',
            'copy $Env:ProgramFiles\\Docker\\docker-compose.exe $Env:ProgramFiles\\Docker\\cli-plugins\\docker-compose.exe',
          ];
        }

        throw new Error(`Unknown os/architecture combo for docker: ${os.name}/${architecture.name}`);
      }
    }();
  }

  static dockerInDocker(): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      getCommands(os: Os, architecture: Architecture) {
        if (os.is(Os.LINUX_UBUNTU) || os.is(Os.LINUX_AMAZON_2)) {
          let archUrl: string;
          if (architecture.is(Architecture.X86_64)) {
            archUrl = 'x86_64';
          } else if (architecture.is(Architecture.ARM64)) {
            archUrl = 'aarch64';
          } else {
            throw new Error(`Unsupported architecture for Docker-in-Docker: ${architecture.name}`);
          }

          return [
            'DOCKER_CHANNEL="stable"',
            'DIND_COMMIT="42b1175eda071c0e9121e1d64345928384a93df1"',
            'DOCKER_VERSION="20.10.18"',
            'DOCKER_COMPOSE_VERSION="2.11.0"',
            `curl -fsSL "https://download.docker.com/linux/static/\${DOCKER_CHANNEL}/${archUrl}/docker-\${DOCKER_VERSION}.tgz" -o docker.tgz`,
            'tar --strip-components 1 -C /usr/local/bin/ -xzf docker.tgz',
            'rm docker.tgz',
            '# set up subuid/subgid so that "--userns-remap=default" works out-of-the box',
            'addgroup dockremap',
            'useradd -g dockremap dockremap',
            'echo \'dockremap:165536:65536\' >> /etc/subuid',
            'echo \'dockremap:165536:65536\' >> /etc/subgid',
            'curl -fsSL "https://raw.githubusercontent.com/docker/docker/${DIND_COMMIT}/hack/dind" -o /usr/local/bin/dind',
            `curl -fsSL https://github.com/docker/compose/releases/download/v\${DOCKER_COMPOSE_VERSION}/docker-compose-linux-${archUrl} -o /usr/local/bin/docker-compose`,
            'mkdir -p /home/runner/.docker/cli-plugins && ln -s /usr/local/bin/docker-compose /home/runner/.docker/cli-plugins/docker-compose',
            'chown -R runner /home/runner/.docker',
            'chmod +x /usr/local/bin/dind /usr/local/bin/docker-compose',
            'addgroup docker && usermod -aG docker runner',
          ];
        }

        throw new Error(`Unknown os/architecture combo for Docker-in-Docker: ${os.name}/${architecture.name}`);
      }
    }();
  }

  /**
   * Add a trusted certificate authority. This can be used to support GitHub Enterprise Server with self-signed certificate.
   *
   * @param source path to certificate file in PEM format
   * @param name unique certificate name to be used on runner file system
   */
  static extraCertificates(source: string, name: string): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      getCommands(os: Os, architecture: Architecture) {
        if (os.is(Os.LINUX_UBUNTU)) {
          return [
            'update-ca-certificates',
          ];
        } else if (os.is(Os.LINUX_AMAZON_2)) {
          return [
            'update-ca-trust',
          ];
        } else if (os.is(Os.WINDOWS)) {
          return [
            // TODO don't override stuff -- delete cert after import?
            `Import-Certificate -FilePath C:\\${name}.crt -CertStoreLocation Cert:\\LocalMachine\\Root`,
            `Remove-Item C:\\${name}.crt`,
          ];
        }

        throw new Error(`Unknown os/architecture combo for extra certificates: ${os.name}/${architecture.name}`);
      }

      getAssets(os: Os, _architecture: Architecture): RunnerImageAsset[] {
        if (os.is(Os.LINUX_UBUNTU)) {
          return [
            { source, target: `/usr/local/share/ca-certificates/${name}.crt` },
          ];
        } else if (os.is(Os.LINUX_AMAZON_2)) {
          return [
            { source, target: `/etc/pki/ca-trust/source/anchors/${name}.crt` },
          ];
        } else if (os.is(Os.WINDOWS)) {
          return [
            // TODO don't override stuff
            { source, target: `C:\\${name}.crt` },
          ];
        }

        throw new Error(`Unsupported OS for extra certificates: ${os.name}`);
      }
    }();
  }

  static lambdaEntrypoint(): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      getCommands(os: Os, _architecture: Architecture) {
        if (!os.is(Os.LINUX_AMAZON_2) && !os.is(Os.LINUX_UBUNTU)) {
          throw new Error(`Unsupported OS for Lambda entrypoint: ${os.name}`);
        }

        return [];
      }

      getAssets(_os: Os, _architecture: Architecture): RunnerImageAsset[] {
        return [
          {
            source: path.join(__dirname, '..', 'docker-images', 'lambda', 'linux-x64', 'runner.js'),
            target: '${LAMBDA_TASK_ROOT}/runner.js',
          },
          {
            source: path.join(__dirname, '..', 'docker-images', 'lambda', 'linux-x64', 'runner.sh'),
            target: '${LAMBDA_TASK_ROOT}/runner.sh',
          },
        ];
      }

      getDockerCommands(_os: Os, _architecture: Architecture): string[] {
        return [
          'WORKDIR ${LAMBDA_TASK_ROOT}',
          'ENV RUNNER_VERSION=latest', // TODO
          'CMD ["runner.handler"]',
        ];
      }
    };
  }

  /**
   * Returns commands to run to in built image. Can be used to install packages, setup build prerequisites, etc.
   */
  abstract getCommands(_os: Os, _architecture: Architecture): string[];

  /**
   * Returns assets to copy into the built image. Can be used to copy files into the image.
   */
  getAssets(_os: Os, _architecture: Architecture): RunnerImageAsset[] {
    return [];
  }

  /**
   * Returns Docker commands to run to in built image. Can be used to add commands like `VOLUME`, `ENTRYPOINT`, `CMD`, etc.
   *
   * Docker commands are added after assets and normal commands.
   */
  getDockerCommands(_os: Os, _architecture: Architecture): string[] {
    return [];
  }

  get name(): string { // TODO use
    return '';
  }

  /**
   * Convert component to an AWS Image Builder component.
   *
   * @internal
   */
  _asAwsImageBuilderComponent(scope: Construct, id: string, os: Os, architecture: Architecture) {
    let platform: 'Linux' | 'Windows';
    if (os.is(Os.LINUX_UBUNTU) || os.is(Os.LINUX_AMAZON_2)) {
      platform = 'Linux';
    } else if (os.is(Os.WINDOWS)) {
      platform = 'Windows';
    } else {
      throw new Error(`Unknown os/architecture combo for image builder component: ${os.name}/${architecture.name}`);
    }

    return new ImageBuilderComponent(scope, id, {
      platform: platform,
      commands: this.getCommands(os, architecture),
      assets: this.getAssets(os, architecture).map((asset, index) => {
        return {
          asset: new s3_assets.Asset(scope, `${id} asset ${index}`, { path: asset.source }),
          path: asset.target,
        };
      }),
      displayName: id,
      description: id,
    });
  }
}

export interface RunnerImageBuilderProps {
  /**
   * Image architecture.
   *
   * @default Architecture.X86_64
   */
  readonly architecture?: Architecture;

  /**
   * Image OS.
   *
   * @default OS.LINUX
   */
  readonly os?: Os;

  /**
   * Base image from which Docker runner images will be built.
   *
   * @default public.ecr.aws/lts/ubuntu:22.04 for Os.LINUX_UBUNTU, public.ecr.aws/amazonlinux/amazonlinux:2 for Os.LINUX_AMAZON_2, mcr.microsoft.com/windows/servercore:ltsc2019-amd64 for Os.WINDOWS
   */
  readonly baseDockerImage?: string;

  /**
   * Base AMI from which runner AMIs will be built.
   *
   * @default TODO
   */
  readonly baseAmi?: string;

  /**
   * Version of GitHub Runners to install.
   *
   * @default latest version available
   */
  readonly runnerVersion?: RunnerVersion;

  /**
   * Components to install on the image.
   *
   * @default none
   */
  readonly components?: RunnerImageComponent[];

  /**
   * Schedule the image to be rebuilt every given interval. Useful for keeping the image up-do-date with the latest GitHub runner version and latest OS updates.
   *
   * Set to zero to disable.
   *
   * @default Duration.days(7)
   */
  readonly rebuildInterval?: Duration;

  /**
   * VPC to build the image in.
   *
   * @default no VPC
   */
  readonly vpc?: ec2.IVpc;

  /**
   * Security Groups to assign to this instance.
   */
  readonly securityGroups?: ec2.ISecurityGroup[];

  /**
   * Where to place the network interfaces within the VPC.
   *
   * @default no subnet
   */
  readonly subnetSelection?: ec2.SubnetSelection;

  /**
   * The number of days log events are kept in CloudWatch Logs. When updating
   * this property, unsetting it doesn't remove the log retention policy. To
   * remove the retention policy, set the value to `INFINITE`.
   *
   * @default logs.RetentionDays.ONE_MONTH
   */
  readonly logRetention?: logs.RetentionDays;

  /**
   * Removal policy for logs of image builds. If deployment fails on the custom resource, try setting this to `RemovalPolicy.RETAIN`. This way the CodeBuild logs can still be viewed, and you can see why the build failed.
   *
   * We try to not leave anything behind when removed. But sometimes a log staying behind is useful.
   *
   * @default RemovalPolicy.DESTROY
   */
  readonly logRemovalPolicy?: RemovalPolicy;

  /**
   * @default CodeBuild for Linux Docker image, AWS Image Builder for Windows Docker image and any AMI
   */
  readonly builderType?: RunnerImageBuilderType;

  /**
   * Options specific to CodeBuild image builder. Only used when builderType is RunnerImageBuilderType.CODE_BUILD.
   */
  readonly codeBuildOptions?: CodeBuildRunnerImageBuilderProps;

  /**
   * Options specific to AWS Image Builder. Only used when builderType is RunnerImageBuilderType.AWS_IMAGE_BUILDER.
   */
  readonly awsImageBuilderOptions?: AwsImageBuilderRunnerImageBuilderProps;
}

export enum RunnerImageBuilderType {
  /**
   * Build runner images using AWS CodeBuild.
   *
   * Faster than AWS Image Builder, but can only be used to build Linux Docker images.
   */
  CODE_BUILD = 'CodeBuild',

  /**
   * Build runner images using AWS Image Builder.
   *
   * Slower than CodeBuild, but can be used to build any type of image including AMIs and Windows images.
   */
  AWS_IMAGE_BUILDER = 'AwsImageBuilder',
}

export interface CodeBuildRunnerImageBuilderProps {
  /**
   * The type of compute to use for this build.
   * See the {@link ComputeType} enum for the possible values.
   *
   * @default {@link ComputeType#SMALL}
   */
  readonly computeType?: codebuild.ComputeType;

  /**
   * Build image to use in CodeBuild. This is the image that's going to run the code that builds the runner image.
   *
   * The only action taken in CodeBuild is running `docker build`. You would therefore not need to change this setting often.
   *
   * @default Ubuntu 20.04 for x64 and Amazon Linux 2 for ARM64
   */
  readonly buildImage?: codebuild.IBuildImage;

  /**
   * The number of minutes after which AWS CodeBuild stops the build if it's
   * not complete. For valid values, see the timeoutInMinutes field in the AWS
   * CodeBuild User Guide.
   *
   * @default Duration.hours(1)
   */
  readonly timeout?: Duration;
}

export interface AwsImageBuilderRunnerImageBuilderProps {
  /**
   * The instance type used to build the image.
   *
   * @default m5.large
   */
  readonly instanceType?: ec2.InstanceType;
}

export interface IRunnerImageBuilder {
  bindDockerImage(): RunnerImage;
  bindAmi(): RunnerAmi;
}

export abstract class RunnerImageBuilder extends Construct implements ec2.IConnectable, IRunnerImageBuilder {
  static new(scope: Construct, id: string, props?: RunnerImageBuilderProps): RunnerImageBuilder {
    if (props?.builderType === RunnerImageBuilderType.CODE_BUILD) {
      return new CodeBuildRunnerImageBuilder(scope, id, props);
    } else if (props?.builderType === RunnerImageBuilderType.AWS_IMAGE_BUILDER) {
      return new AwsImageBuilderRunnerImageBuilder(scope, id, props);
    }

    const os = props?.os ?? Os.LINUX_UBUNTU;
    if (os.is(Os.LINUX_UBUNTU) || os.is(Os.LINUX_AMAZON_2)) {
      return new CodeBuildRunnerImageBuilder(scope, id, props);
    } else if (os.is(Os.WINDOWS)) {
      return new AwsImageBuilderRunnerImageBuilder(scope, id, props);
    } else {
      throw new Error(`Unable to find runner image builder implementation for ${os.name}`);
    }
  }

  protected readonly components: RunnerImageComponent[] = [];

  protected constructor(scope: Construct, id: string, props?: RunnerImageBuilderProps) {
    super(scope, id);

    if (props?.components) {
      this.components.push(...props.components);
    }
  }

  abstract bindDockerImage(): RunnerImage;
  abstract bindAmi(): RunnerAmi;

  abstract get connections(): ec2.Connections;

  public addComponent(component: RunnerImageComponent) {
    this.components.push(component);
  }

  // TODO removeComponent #215

  protected defaultBaseDockerImage(os: Os) {
    if (os.is(Os.WINDOWS)) {
      return 'mcr.microsoft.com/windows/servercore:ltsc2019-amd64';
    } else if (os.is(Os.LINUX_UBUNTU)) {
      return 'public.ecr.aws/lts/ubuntu:22.04';
    } else if (os.is(Os.LINUX_AMAZON_2)) {
      return 'public.ecr.aws/amazonlinux/amazonlinux:2';
    } else {
      throw new Error(`OS ${os.name} not supported for Docker runner image`);
    }
  }
}

/**
 * @internal
 */
class CodeBuildRunnerImageBuilder extends RunnerImageBuilder {
  private static BUILDSPEC_VERSION = 1;

  private boundDockerImage?: RunnerImage;
  private readonly os: Os;
  private readonly architecture: Architecture;
  private readonly baseImage: string;
  private readonly runnerVersion: RunnerVersion;
  private readonly logRetention: RetentionDays;
  private readonly logRemovalPolicy: RemovalPolicy;
  private readonly vpc: ec2.IVpc | undefined;
  private readonly securityGroups: ec2.ISecurityGroup[] | undefined;
  private readonly buildImage: codebuild.IBuildImage;
  private readonly repository: ecr.Repository;
  private readonly subnetSelection: ec2.SubnetSelection | undefined;
  private readonly timeout: cdk.Duration;
  private readonly computeType: codebuild.ComputeType;
  private readonly rebuildInterval: cdk.Duration;
  private readonly assetsToGrant: s3_assets.Asset[] = [];

  constructor(scope: Construct, id: string, props?: RunnerImageBuilderProps) {
    super(scope, id, props);

    this.os = props?.os ?? Os.LINUX_UBUNTU;
    this.architecture = props?.architecture ?? Architecture.X86_64;
    this.runnerVersion = props?.runnerVersion ?? RunnerVersion.latest();
    this.rebuildInterval = props?.rebuildInterval ?? Duration.days(7);
    this.logRetention = props?.logRetention ?? RetentionDays.ONE_MONTH;
    this.logRemovalPolicy = props?.logRemovalPolicy ?? RemovalPolicy.DESTROY;
    this.vpc = props?.vpc;
    this.securityGroups = props?.securityGroups;
    this.subnetSelection = props?.subnetSelection;
    this.timeout = props?.codeBuildOptions?.timeout ?? Duration.hours(1);
    this.computeType = props?.codeBuildOptions?.computeType ?? ComputeType.SMALL;
    this.baseImage = props?.baseDockerImage ?? this.defaultBaseDockerImage(this.os);
    this.buildImage = props?.codeBuildOptions?.buildImage ?? this.getDefaultBuildImage();

    // warn against isolated networks
    if (props?.subnetSelection?.subnetType == ec2.SubnetType.PRIVATE_ISOLATED) {
      Annotations.of(this).addWarning('Private isolated subnets cannot pull from public ECR and VPC endpoint is not supported yet. ' +
        'See https://github.com/aws/containers-roadmap/issues/1160');
    }

    // create repository that only keeps one tag
    this.repository = new ecr.Repository(this, 'Repository', {
      imageScanOnPush: true,
      imageTagMutability: TagMutability.MUTABLE,
      removalPolicy: RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          description: 'Remove untagged images that have been replaced by CodeBuild',
          tagStatus: TagStatus.UNTAGGED,
          maxImageAge: Duration.days(1),
        },
      ],
    });
  }

  bindAmi(): RunnerAmi {
    throw new Error('CodeBuild image builder cannot be used to build AMI');
  }

  bindDockerImage(): RunnerImage {
    if (this.boundDockerImage) {
      return this.boundDockerImage;
    }

    // log group for the image builds
    const logGroup = new logs.LogGroup(
      this,
      'Logs',
      {
        retention: this.logRetention ?? RetentionDays.ONE_MONTH,
        removalPolicy: this.logRemovalPolicy ?? RemovalPolicy.DESTROY,
      },
    );

    // generate buildSpec
    const buildSpec = this.getBuildSpec(this.repository, logGroup, this.runnerVersion);

    // create CodeBuild project that builds Dockerfile and pushes to repository
    const project = new codebuild.Project(this, 'CodeBuild', {
      description: `Build docker image for self-hosted GitHub runner ${this.node.path} (${this.os.name}/${this.architecture.name})`,
      buildSpec: codebuild.BuildSpec.fromObject(buildSpec),
      vpc: this.vpc,
      securityGroups: this.securityGroups,
      subnetSelection: this.subnetSelection,
      timeout: this.timeout,
      environment: {
        buildImage: this.buildImage,
        computeType: this.computeType,
        privileged: true,
      },
      logging: {
        cloudWatch: {
          logGroup,
        },
      },
    });

    // permissions
    this.repository.grantPullPush(project);
    // TODO just define a role ahead of time?? -- this.policyStatements.forEach(project.addToRolePolicy);

    // call CodeBuild during deployment and delete all images from repository during destruction
    const cr = this.customResource(project);

    // rebuild image on a schedule
    this.rebuildImageOnSchedule(project, this.rebuildInterval);

    // asset permissions
    for (const asset of this.assetsToGrant) {
      asset.grantRead(project);
    }

    this.boundDockerImage = {
      imageRepository: ecr.Repository.fromRepositoryAttributes(this, 'Dependable Image', {
        // There are simpler ways to get name and ARN, but we want an image object that depends on the custom resource.
        // We want whoever is using this image to automatically wait for CodeBuild to start and finish through the custom resource.
        repositoryName: cr.getAttString('Name'),
        repositoryArn: cr.ref,
      }),
      imageTag: 'latest',
      architecture: this.architecture,
      os: this.os,
      logGroup,
      runnerVersion: this.runnerVersion,
    };
    return this.boundDockerImage;
  }

  private getDefaultBuildImage(): codebuild.IBuildImage {
    if (this.os.is(Os.LINUX_UBUNTU) || this.os.is(Os.LINUX_AMAZON_2)) { // TODO
      if (this.architecture.is(Architecture.X86_64)) {
        return codebuild.LinuxBuildImage.STANDARD_6_0;
      } else if (this.architecture.is(Architecture.ARM64)) {
        return codebuild.LinuxArmBuildImage.AMAZON_LINUX_2_STANDARD_2_0;
      }
    }
    if (this.os.is(Os.WINDOWS)) {
      throw new Error('CodeBuild cannot be used to build Windows Docker images https://github.com/docker-library/docker/issues/49');
    }

    throw new Error(`Unable to find CodeBuild image for ${this.os.name}/${this.architecture.name}`);
  }

  private getDockerfileGenerationCommands() {
    let commands = [];
    let dockerfile = `FROM ${this.baseImage}\nVOLUME /var/lib/docker\n`;

    for (let i = 0; i < this.components.length; i++) {
      const assetDescriptors = this.components[i].getAssets(this.os, this.architecture);
      for (let j = 0; j < assetDescriptors.length; j++) {
        if (this.os.is(Os.WINDOWS)) {
          throw new Error("Can't add asset as we can't build Windows Docker images on CodeBuild");
        }

        const asset = new s3_assets.Asset(this, `Component ${i} Asset ${j}`, {
          path: assetDescriptors[j].source,
        });

        if (asset.isFile) {
          commands.push(`aws s3 cp ${asset.s3ObjectUrl} asset${i}${j}`);
        } else if (asset.isZipArchive) {
          commands.push(`aws s3 cp ${asset.s3ObjectUrl} asset${i}${j}.zip`);
          commands.push(`unzip asset${i}${j}.zip -d "asset${i}${j}"`);
        } else {
          throw new Error(`Unknown asset type: ${asset}`);
        }

        dockerfile += `COPY asset${i}${j} ${assetDescriptors[j].target}\n`;

        this.assetsToGrant.push(asset);
      }

      const componentCommands = this.components[i].getCommands(this.os, this.architecture);
      const script = '#!/bin/bash\nset -exuo pipefail\n' + componentCommands.join('\n');
      commands.push(`cat > component${i}.sh <<'EOFGITHUBRUNNERSDOCKERFILE'\n${script}\nEOFGITHUBRUNNERSDOCKERFILE`);
      commands.push(`chmod +x component${i}.sh`);
      dockerfile += `COPY component${i}.sh /tmp\n`;
      dockerfile += `RUN /tmp/component${i}.sh\n`;

      dockerfile += this.components[i].getDockerCommands(this.os, this.architecture).join('\n') + '\n';
    }

    commands.push(`cat > Dockerfile <<'EOFGITHUBRUNNERSDOCKERFILE'\n${dockerfile}\nEOFGITHUBRUNNERSDOCKERFILE`);

    return commands;
  }

  private getBuildSpec(repository: ecr.Repository, logGroup: logs.LogGroup, runnerVersion: RunnerVersion): any {
    // TODO remove runnerVersion? it's already in components
    // don't forget to change BUILDSPEC_VERSION when the buildSpec changes, and you want to trigger a rebuild on deploy

    const thisStack = cdk.Stack.of(this);

    return {
      version: '0.2',
      env: {
        variables: {
          REPO_ARN: repository.repositoryArn,
          REPO_URI: repository.repositoryUri,
          STACK_ID: 'unspecified',
          REQUEST_ID: 'unspecified',
          LOGICAL_RESOURCE_ID: 'unspecified',
          RESPONSE_URL: 'unspecified',
          RUNNER_VERSION: runnerVersion.version,
        },
      },
      phases: {
        pre_build: {
          commands: [
            `aws ecr get-login-password --region "$AWS_DEFAULT_REGION" | docker login --username AWS --password-stdin ${thisStack.account}.dkr.ecr.${thisStack.region}.amazonaws.com`,
          ],
        },
        build: {
          commands: this.getDockerfileGenerationCommands().concat([
            'docker build . -t "$REPO_URI"',
            'docker push "$REPO_URI"',
          ]),
        },
        post_build: {
          commands: [
            'STATUS="SUCCESS"',
            'if [ $CODEBUILD_BUILD_SUCCEEDING -ne 1 ]; then STATUS="FAILED"; fi',
            'cat <<EOF > /tmp/payload.json\n' +
              '{\n' +
              '  "StackId": "$STACK_ID",\n' +
              '  "RequestId": "$REQUEST_ID",\n' +
              '  "LogicalResourceId": "$LOGICAL_RESOURCE_ID",\n' +
              '  "PhysicalResourceId": "$REPO_ARN",\n' +
              '  "Status": "$STATUS",\n' +
              `  "Reason": "See logs in ${logGroup.logGroupName}/$CODEBUILD_LOG_PATH (deploy again with \'cdk deploy -R\' or logRemovalPolicy=RemovalPolicy.RETAIN if they are already deleted)",\n` +
              `  "Data": {"Name": "${repository.repositoryName}"}\n` +
              '}\n' +
              'EOF',
            'if [ "$RESPONSE_URL" != "unspecified" ]; then jq . /tmp/payload.json; curl -fsSL -X PUT -H "Content-Type:" -d "@/tmp/payload.json" "$RESPONSE_URL"; fi',
          ],
        },
      },
    };
  }

  private customResource(project: codebuild.Project) {
    const crHandler = singletonLambda(BuildImageFunction, this, 'build-image', {
      description: 'Custom resource handler that triggers CodeBuild to build runner images, and cleans-up images on deletion',
      timeout: cdk.Duration.minutes(3),
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    const policy = new iam.Policy(this, 'CR Policy', {
      statements: [
        new iam.PolicyStatement({
          actions: ['codebuild:StartBuild'],
          resources: [project.projectArn],
        }),
        new iam.PolicyStatement({
          actions: ['ecr:BatchDeleteImage', 'ecr:ListImages'],
          resources: [this.repository.repositoryArn],
        }),
      ],
    });
    crHandler.role!.attachInlinePolicy(policy);

    const cr = new CustomResource(this, 'Builder', {
      serviceToken: crHandler.functionArn,
      resourceType: 'Custom::ImageBuilder',
      properties: {
        RepoName: this.repository.repositoryName,
        ProjectName: project.projectName,
        // We include a hash so the image is built immediately on changes, and we don't have to wait for its scheduled build.
        // This also helps make sure the changes are good. If they have a bug, the deployment will fail instead of just the scheduled build.
        BuildHash: this.hashBuildSettings(),
      },
    });

    // add dependencies to make sure resources are there when we need them
    cr.node.addDependency(project);
    cr.node.addDependency(policy);
    cr.node.addDependency(crHandler.role!);
    cr.node.addDependency(crHandler);

    return cr;
  }

  /**
   * Return hash of all settings that can affect the result image so we can trigger the build when it changes.
   * @private
   */
  private hashBuildSettings(): string {
    // main Dockerfile
    // TODO replace with components
    let components: string[] = [];
    for (const component of this.components) {
      components.push(component.getCommands(this.os, this.architecture).join('\n')); // TODO correct os/arch
    }
    components.push(this.buildImage.imageId);
    // let components: string[] = [this.dockerfile.assetHash];
    // all additional files
    // TODO assets
    // for (const [name, asset] of this.secondaryAssets.entries()) {
    //   components.push(name);
    //   components.push(asset.assetHash);
    // }
    // buildspec.yml version
    components.push(`v${CodeBuildRunnerImageBuilder.BUILDSPEC_VERSION}`);
    // runner version
    components.push(this.runnerVersion.version);
    // hash it
    const all = components.join('-');
    return crypto.createHash('md5').update(all).digest('hex');
  }

  private rebuildImageOnSchedule(project: codebuild.Project, rebuildInterval?: Duration) {
    rebuildInterval = rebuildInterval ?? Duration.days(7);
    if (rebuildInterval.toMilliseconds() != 0) {
      const scheduleRule = new events.Rule(this, 'Build Schedule', {
        description: `Rebuild runner image for ${this.repository.repositoryName}`,
        schedule: events.Schedule.rate(rebuildInterval),
      });
      scheduleRule.addTarget(new events_targets.CodeBuildProject(project));
    }
  }

  get connections(): ec2.Connections {
    return new ec2.Connections({
      securityGroups: this.securityGroups,
    });
  }
}

/**
 * @internal
 */
class AwsImageBuilderRunnerImageBuilder extends RunnerImageBuilder {
  private boundDockerImage?: RunnerImage;
  private boundAmi?: RunnerAmi;
  private readonly os: Os;
  private readonly architecture: Architecture;
  private readonly baseImage: string;
  private readonly runnerVersion: RunnerVersion;
  private readonly logRetention: RetentionDays;
  private readonly logRemovalPolicy: RemovalPolicy;
  private readonly vpc: ec2.IVpc;
  private readonly securityGroups: ec2.ISecurityGroup[];
  // private readonly buildImage: codebuild.IBuildImage;
  private readonly repository: ecr.Repository;
  private readonly subnetSelection: ec2.SubnetSelection | undefined;
  // private readonly timeout: cdk.Duration;
  // private readonly computeType: codebuild.ComputeType;
  private readonly rebuildInterval: cdk.Duration;
  private readonly boundComponents: ImageBuilderComponent[] = [];
  private readonly instanceType: ec2.InstanceType;
  private infrastructure: imagebuilder.CfnInfrastructureConfiguration | undefined;

  constructor(scope: Construct, id: string, props?: RunnerImageBuilderProps) {
    super(scope, id, props);

    this.os = props?.os ?? Os.LINUX_UBUNTU;
    this.architecture = props?.architecture ?? Architecture.X86_64;
    this.runnerVersion = props?.runnerVersion ?? RunnerVersion.latest();
    this.rebuildInterval = props?.rebuildInterval ?? Duration.days(7);
    this.logRetention = props?.logRetention ?? RetentionDays.ONE_MONTH;
    this.logRemovalPolicy = props?.logRemovalPolicy ?? RemovalPolicy.DESTROY;
    this.vpc = props?.vpc ?? ec2.Vpc.fromLookup(this, 'VPC', { isDefault: true });
    // TODO allow passing multiple security groups
    this.securityGroups = props?.securityGroups ?? [new ec2.SecurityGroup(this, 'SG', { vpc: this.vpc })];
    this.subnetSelection = props?.subnetSelection;
    this.baseImage = props?.baseDockerImage ?? this.defaultBaseDockerImage(this.os);
    this.instanceType = props?.awsImageBuilderOptions?.instanceType ?? ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.LARGE);

    // warn against isolated networks
    if (props?.subnetSelection?.subnetType == ec2.SubnetType.PRIVATE_ISOLATED) {
      Annotations.of(this).addWarning('Private isolated subnets cannot pull from public ECR and VPC endpoint is not supported yet. ' +
        'See https://github.com/aws/containers-roadmap/issues/1160');
    }

    // create repository that only keeps one tag
    this.repository = new ecr.Repository(this, 'Repository', {
      imageScanOnPush: true,
      imageTagMutability: TagMutability.MUTABLE,
      removalPolicy: RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          description: 'Remove untagged images that have been replaced by CodeBuild',
          tagStatus: TagStatus.UNTAGGED,
          maxImageAge: Duration.days(1),
        },
      ],
    });
  }

  private platform() {
    if (this.os.is(Os.WINDOWS)) {
      return 'Windows';
    }
    if (this.os.is(Os.LINUX_AMAZON_2) || this.os.is(Os.LINUX_UBUNTU)) {
      return 'Linux';
    }
    throw new Error(`OS ${this.os.name} is not supported by AWS Image Builder`);
  }

  /**
   * Called by IRunnerProvider to finalize settings and create the image builder.
   */
  bindDockerImage(): RunnerImage {
    if (this.boundDockerImage) {
      return this.boundDockerImage;
    }

    const dist = new imagebuilder.CfnDistributionConfiguration(this, 'Distribution', {
      name: uniqueImageBuilderName(this),
      // description: this.description,
      distributions: [
        {
          region: Stack.of(this).region,
          containerDistributionConfiguration: {
            ContainerTags: ['latest'],
            TargetRepository: {
              Service: 'ECR',
              RepositoryName: this.repository.repositoryName,
            },
          },
        },
      ],
    });

    let dockerfileTemplate = `FROM {{{ imagebuilder:parentImage }}}
ENV RUNNER_VERSION=___RUNNER_VERSION___
{{{ imagebuilder:environments }}}
{{{ imagebuilder:components }}}`;

    if (this.boundComponents.length == 0) {
      this.boundComponents.push(...this.components.map((c, i) => c._asAwsImageBuilderComponent(this, `Component ${i}`, this.os, this.architecture)));
    }

    for (const c of this.components) {
      const commands = c.getDockerCommands(this.os, this.architecture);
      if (commands.length > 0) {
        dockerfileTemplate += commands.join('\n') + '\n';
      }
    }

    const recipe = new ContainerRecipe(this, 'Container Recipe', {
      platform: this.platform(),
      components: this.boundComponents,
      targetRepository: this.repository,
      dockerfileTemplate: dockerfileTemplate.replace('___RUNNER_VERSION___', this.runnerVersion.version),
      parentImage: this.baseImage,
    });

    const log = this.createLog(recipe.name);
    const infra = this.createInfrastructure([
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      iam.ManagedPolicy.fromAwsManagedPolicyName('EC2InstanceProfileForImageBuilderECRContainerBuilds'),
    ]);
    const image = this.createImage(infra, dist, log, undefined, recipe.arn);
    this.createPipeline(infra, dist, log, undefined, recipe.arn);

    this.imageCleaner(image, recipe.name);

    this.boundDockerImage = {
      // There are simpler ways to get the ARN, but we want an image object that depends on the newly built image.
      // We want whoever is using this image to automatically wait for Image Builder to finish building before using the image.
      imageRepository: ecr.Repository.fromRepositoryName(
        this, 'Dependable Image',
        // we can't use image.attrName because it comes up with upper case
        cdk.Fn.split(':', cdk.Fn.split('/', image.attrImageUri, 2)[1], 2)[0],
      ),
      imageTag: 'latest',
      os: this.os,
      architecture: this.architecture,
      logGroup: log,
      runnerVersion: this.runnerVersion,
    };

    return this.boundDockerImage;
  }

  private imageCleaner(image: imagebuilder.CfnImage, recipeName: string) {
    const crHandler = singletonLambda(BuildImageFunction, this, 'build-image', {
      description: 'Custom resource handler that triggers CodeBuild to build runner images, and cleans-up images on deletion',
      timeout: cdk.Duration.minutes(3),
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    const policy = new iam.Policy(this, 'CR Policy', {
      statements: [
        new iam.PolicyStatement({
          actions: ['ecr:BatchDeleteImage', 'ecr:ListImages'],
          resources: [this.repository.repositoryArn],
        }),
        new iam.PolicyStatement({
          actions: ['imagebuilder:ListImages', 'imagebuilder:ListImageBuildVersions', 'imagebuilder:DeleteImage'],
          resources: ['*'], // Image Builder doesn't support scoping this :(
        }),
      ],
    });
    crHandler.role?.attachInlinePolicy(policy);

    const cr = new CustomResource(this, 'Deleter', {
      serviceToken: crHandler.functionArn,
      resourceType: 'Custom::ImageDeleter',
      properties: {
        RepoName: this.repository.repositoryName,
        ImageBuilderName: recipeName, // we don't use image.name because CloudFormation complains if it was deleted already
        DeleteOnly: true,
      },
    });

    // add dependencies to make sure resources are there when we need them
    cr.node.addDependency(image);
    cr.node.addDependency(policy);
    cr.node.addDependency(crHandler);

    return cr;
  }

  protected createLog(recipeName: string): logs.LogGroup {
    return new logs.LogGroup(this, 'Log', {
      logGroupName: `/aws/imagebuilder/${recipeName}`,
      retention: this.logRetention,
      removalPolicy: this.logRemovalPolicy,
    });
  }

  protected createInfrastructure(managedPolicies: iam.IManagedPolicy[]): imagebuilder.CfnInfrastructureConfiguration {
    if (this.infrastructure) {
      return this.infrastructure;
    }

    let role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: managedPolicies,
    });

    for (const component of this.boundComponents) {
      component.grantAssetsRead(role);
    }

    this.infrastructure = new imagebuilder.CfnInfrastructureConfiguration(this, 'Infrastructure', {
      name: uniqueImageBuilderName(this),
      // description: this.description,
      subnetId: this.vpc?.selectSubnets(this.subnetSelection).subnetIds[0],
      securityGroupIds: this.securityGroups?.map(sg => sg.securityGroupId),
      instanceTypes: [this.instanceType.toString()],
      instanceProfileName: new iam.CfnInstanceProfile(this, 'Instance Profile', {
        roles: [
          role.roleName,
        ],
      }).ref,
    });

    return this.infrastructure;
  }

  protected createImage(infra: imagebuilder.CfnInfrastructureConfiguration, dist: imagebuilder.CfnDistributionConfiguration, log: logs.LogGroup,
    imageRecipeArn?: string, containerRecipeArn?: string): imagebuilder.CfnImage {
    const image = new imagebuilder.CfnImage(this, 'Image', {
      infrastructureConfigurationArn: infra.attrArn,
      distributionConfigurationArn: dist.attrArn,
      imageRecipeArn,
      containerRecipeArn,
      imageTestsConfiguration: {
        imageTestsEnabled: false,
      },
    });
    image.node.addDependency(infra);
    image.node.addDependency(log);

    return image;
  }

  protected createPipeline(infra: imagebuilder.CfnInfrastructureConfiguration, dist: imagebuilder.CfnDistributionConfiguration, log: logs.LogGroup,
    imageRecipeArn?: string, containerRecipeArn?: string): imagebuilder.CfnImagePipeline {
    let scheduleOptions: imagebuilder.CfnImagePipeline.ScheduleProperty | undefined;
    if (this.rebuildInterval.toDays() > 0) {
      scheduleOptions = {
        scheduleExpression: events.Schedule.rate(this.rebuildInterval).expressionString,
        pipelineExecutionStartCondition: 'EXPRESSION_MATCH_ONLY',
      };
    }
    const pipeline = new imagebuilder.CfnImagePipeline(this, 'Pipeline', {
      name: uniqueImageBuilderName(this),
      // description: this.description,
      infrastructureConfigurationArn: infra.attrArn,
      distributionConfigurationArn: dist.attrArn,
      imageRecipeArn,
      containerRecipeArn,
      schedule: scheduleOptions,
      imageTestsConfiguration: {
        imageTestsEnabled: false,
      },
    });
    pipeline.node.addDependency(infra);
    pipeline.node.addDependency(log);

    return pipeline;
  }

  /**
   * The network connections associated with this resource.
   */
  public get connections(): ec2.Connections {
    return new ec2.Connections({ securityGroups: this.securityGroups });
  }

  bindAmi(): RunnerAmi {
    if (this.boundAmi) {
      return this.boundAmi;
    }

    const launchTemplate = new ec2.LaunchTemplate(this, 'Launch template');

    const stackName = cdk.Stack.of(this).stackName;
    const builderName = this.node.path;

    const dist = new imagebuilder.CfnDistributionConfiguration(this, 'Distribution', {
      name: uniqueImageBuilderName(this),
      // description: this.description,
      distributions: [
        {
          region: Stack.of(this).region,
          amiDistributionConfiguration: {
            Name: `${cdk.Names.uniqueResourceName(this, {
              maxLength: 100,
              separator: '-',
              allowedSpecialCharacters: '_-',
            })}-{{ imagebuilder:buildDate }}`,
            AmiTags: {
              'Name': this.node.id,
              'GitHubRunners:Stack': stackName,
              'GitHubRunners:Builder': builderName,
            },
          },
          launchTemplateConfigurations: [
            {
              launchTemplateId: launchTemplate.launchTemplateId,
            },
          ],
        },
      ],
    });

    const recipe = new AmiRecipe(this, 'Ami Recipe', {
      platform: this.platform(),
      components: this.bindComponents(),
      architecture: this.architecture,
    });

    const log = this.createLog(recipe.name);
    const infra = this.createInfrastructure([
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      iam.ManagedPolicy.fromAwsManagedPolicyName('EC2InstanceProfileForImageBuilder'),
    ]);
    this.createImage(infra, dist, log, recipe.arn, undefined);
    this.createPipeline(infra, dist, log, recipe.arn, undefined);

    this.boundAmi = {
      launchTemplate: launchTemplate,
      architecture: this.architecture,
      os: this.os,
      logGroup: log,
      runnerVersion: this.runnerVersion,
    };

    this.amiCleaner(launchTemplate, stackName, builderName);

    return this.boundAmi;
  }

  private amiCleaner(launchTemplate: ec2.LaunchTemplate, stackName: string, builderName: string) {
    const deleter = singletonLambda(DeleteAmiFunction, this, 'delete-ami', {
      description: 'Delete old GitHub Runner AMIs',
      initialPolicy: [
        new iam.PolicyStatement({
          actions: ['ec2:DescribeLaunchTemplateVersions', 'ec2:DescribeImages', 'ec2:DeregisterImage', 'ec2:DeleteSnapshot'],
          resources: ['*'],
        }),
      ],
      timeout: cdk.Duration.minutes(5),
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // delete old AMIs on schedule
    const eventRule = new events.Rule(this, 'Delete AMI Schedule', {
      schedule: events.Schedule.rate(cdk.Duration.days(1)),
      description: `Delete old AMIs for ${builderName}`,
    });
    eventRule.addTarget(new events_targets.LambdaFunction(deleter, {
      event: events.RuleTargetInput.fromObject({
        RequestType: 'Scheduled',
        LaunchTemplateId: launchTemplate.launchTemplateId,
        StackName: stackName,
        BuilderName: builderName,
      }),
    }));

    // delete all AMIs when this construct is removed
    new CustomResource(this, 'AMI Deleter', {
      serviceToken: deleter.functionArn,
      resourceType: 'Custom::AmiDeleter',
      properties: {
        StackName: stackName,
        BuilderName: builderName,
      },
    });
  }

  private bindComponents(): ImageBuilderComponent[] {
    if (this.boundComponents.length == 0) {
      this.boundComponents.push(...this.components.map((c, i) => c._asAwsImageBuilderComponent(this, `Component ${i}`, this.os, this.architecture)));
    }

    return this.boundComponents;
  }
}
