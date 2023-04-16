import * as path from 'path';
import { aws_s3_assets as s3_assets } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ImageBuilderComponent } from './aws-image-builder';
import { RunnerImageAsset } from './common';
import { Architecture, Os, RunnerVersion } from '../providers/common';

export interface RunnerImageComponentCustomProps {
  /**
   * Component name used for (1) image build logging and (2) identifier for {@link ImageRunnerBuilder.removeComponent}.
   *
   * Name must only contain alphanumeric characters and dashes.
   */
  readonly name?: string;

  /**
   * Commands to run in the built image.
   */
  readonly commands?: string[];

  /**
   * Assets to copy into the built image.
   */
  readonly assets?: RunnerImageAsset[];

  /**
   * Docker commands to run in the built image.
   *
   * For example: `['ENV foo=bar', 'RUN echo $foo']`
   *
   * These commands are ignored when building AMIs.
   */
  readonly dockerCommands?: string[];
}

/**
 * Components are used to build runner images. They can run commands in the image, copy files into the image, and run some Docker commands.
 */
export abstract class RunnerImageComponent {
  /**
   * Define a custom component that can run commands in the image, copy files into the image, and run some Docker commands.
   *
   * The order of operations is (1) assets (2) commands (3) docker commands.
   *
   * Use this to customize the image for the runner.
   *
   * **WARNING:** Docker commands are not guaranteed to be included before the next component
   */
  static custom(props: RunnerImageComponentCustomProps): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      get name() {
        if (props.name && !props.name.match(/[a-zA-Z0-9\-]/)) {
          throw new Error(`Invalid component name: ${props.name}. Name must only contain alphanumeric characters and dashes.`);
        }
        return `Custom-${props.name ?? 'Undefined'}`;
      }

      getCommands(_os: Os, _architecture: Architecture) {
        return props.commands ?? [];
      }
      getAssets(_os: Os, _architecture: Architecture) {
        return props.assets ?? [];
      }

      getDockerCommands(_os: Os, _architecture: Architecture) {
        return props.dockerCommands ?? [];
      }
    }();
  }

  /**
   * A component to install the required packages for the runner.
   */
  static requiredPackages(): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      name = 'RequiredPackages';

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

  /**
   * A component to prepare the required runner user.
   */
  static runnerUser(): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      name = 'RunnerUser';

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

  /**
   * A component to install the AWS CLI.
   */
  static awsCli(): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      name = 'AwsCli';

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

  /**
   * A component to install the GitHub CLI.
   */
  static githubCli(): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      name = 'GithubCli';

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

  /**
   * A component to install the GitHub CLI.
   */
  static git(): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      name = 'Git';

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

  /**
   * A component to install the GitHub Actions Runner. This is the actual executable that connects to GitHub to ask for jobs and then execute them.
   *
   * @param runnerVersion The version of the runner to install. Usually you would set this to latest.
   */
  static githubRunner(runnerVersion: RunnerVersion): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      name = 'GithubRunner';

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
            `echo -n ${runnerVersion.version} > /home/runner/RUNNER_VERSION`,
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
            `echo ${runnerVersion.version} | Out-File -Encoding ASCII -NoNewline C:\\actions\\RUNNER_VERSION`,
          ]);
        }

        throw new Error(`Unknown os/architecture combo for github runner: ${os.name}/${architecture.name}`);
      }

      getDockerCommands(_os: Os, _architecture: Architecture): string[] {
        return [
          `ENV RUNNER_VERSION=${runnerVersion.version}`,
        ];
      }
    }();
  }

  /**
   * A component to install Docker. On Windows this installs Docker Desktop.
   */
  static docker(): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      name = 'Docker';

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
            'Start-Process "docker-setup.exe" -Wait -ArgumentList "install --quiet --accept-license"',
            'del docker-setup.exe',
            'if (-Not(Test-Path -Path "$Env:ProgramFiles\\Docker")) { echo "Docker installation failed" ; exit 1 }',
          ];
        }

        throw new Error(`Unknown os/architecture combo for docker: ${os.name}/${architecture.name}`);
      }
    }();
  }

  /**
   * A component to install Docker-in-Docker.
   */
  static dockerInDocker(): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      name = 'Docker-in-Docker';

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
            os.is(Os.LINUX_UBUNTU) ? 'DEBIAN_FRONTEND=noninteractive apt-get install -y socat' : 'yum install -y socat', // for ECS
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
   * A component to add a trusted certificate authority. This can be used to support GitHub Enterprise Server with self-signed certificate.
   *
   * @param source path to certificate file in PEM format
   * @param name unique certificate name to be used on runner file system
   */
  static extraCertificates(source: string, name: string): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      name = `Extra-Certificates-${name}`;

      getCommands(os: Os, architecture: Architecture) {
        if (!name.match(/^[a-zA-Z0-9_-]+$/)) {
          throw new Error(`Invalid certificate name: ${name}. Name must only contain alphanumeric characters, dashes and underscores.`);
        }

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
            { source, target: `C:\\${name}.crt` },
          ];
        }

        throw new Error(`Unsupported OS for extra certificates: ${os.name}`);
      }
    }();
  }

  /**
   * A component to set up the required Lambda entrypoint for Lambda runners.
   */
  static lambdaEntrypoint(): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      name = 'Lambda-Entrypoint';

      getCommands(os: Os, _architecture: Architecture) {
        if (!os.is(Os.LINUX_AMAZON_2) && !os.is(Os.LINUX_UBUNTU)) {
          throw new Error(`Unsupported OS for Lambda entrypoint: ${os.name}`);
        }

        return [];
      }

      getAssets(_os: Os, _architecture: Architecture): RunnerImageAsset[] {
        return [
          {
            source: path.join(__dirname, '..', 'providers', 'docker-images', 'lambda', 'linux-x64', 'runner.js'),
            target: '${LAMBDA_TASK_ROOT}/runner.js',
          },
          {
            source: path.join(__dirname, '..', 'providers', 'docker-images', 'lambda', 'linux-x64', 'runner.sh'),
            target: '${LAMBDA_TASK_ROOT}/runner.sh',
          },
        ];
      }

      getDockerCommands(_os: Os, _architecture: Architecture): string[] {
        return [
          'WORKDIR ${LAMBDA_TASK_ROOT}',
          'CMD ["runner.handler"]',
        ];
      }
    };
  }

  /**
   * Component name.
   *
   * Used to identify component in image build logs, and for {@link RunnerImageBuilder.removeComponent}
   */
  abstract readonly name: string;

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

