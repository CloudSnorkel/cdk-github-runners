import * as crypto from 'crypto';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { aws_s3_assets as s3_assets } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { discoverCertificateFiles } from '../utils';
import { ImageBuilderComponent } from './aws-image-builder';
import { RunnerImageAsset } from './common';
import { Architecture, Os, RunnerVersion } from '../providers';

export interface RunnerImageComponentCustomProps {
  /**
   * Component name used for (1) image build logging and (2) identifier for {@link IConfigurableRunnerImageBuilder.removeComponent}.
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
 * Validates and normalizes a version string for use in download URLs.
 * Returns undefined if version is empty or "latest" (caller should use latest).
 * Throws if version contains any character other than alphanumeric, dots, dashes, or underscores.
 */
function validateVersion(version: string | undefined): string | undefined {
  if (version === undefined || version === null) return undefined;
  const trimmed = version.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'latest') return undefined;
  if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    throw new Error(
      `Invalid version "${version}": only alphanumeric characters, dots, dashes, and underscores are allowed.`,
    );
  }
  return trimmed;
}

/**
 * Git for Windows version format: "2.43.0.windows.1" → "2.43.0" (revision 1 omitted),
 * "2.43.0.windows.2" → "2.43.0.2" (revision 2+ appended). Versions without ".windows." are returned as-is.
 */
function formatGitForWindowsVersion(version: string): string {
  if (!version.includes('.windows.')) return version;
  const parts = version.split('.windows.');
  if (parts.length !== 2 || !parts[1]) return version;
  const base = parts[0];
  const revision = parseInt(parts[1], 10);
  if (isNaN(revision)) return version;
  return revision > 1 ? `${base}.${revision}` : base;
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

      getCommands(os: Os, _architecture: Architecture): string[] {
        if (os.isIn(Os._ALL_LINUX_UBUNTU_VERSIONS)) {
          return [
            'apt-get update',
            'DEBIAN_FRONTEND=noninteractive apt-get upgrade -y',
            'DEBIAN_FRONTEND=noninteractive apt-get install -y curl sudo jq bash zip unzip iptables software-properties-common ca-certificates',
          ];
        } else if (os.is(Os.LINUX_AMAZON_2)) {
          return [
            'yum update -y',
            'yum install -y jq tar gzip bzip2 which binutils zip unzip sudo shadow-utils',
          ];
        } else if (os.is(Os.LINUX_AMAZON_2023)) {
          return [
            'dnf upgrade -y',
            'dnf install -y jq tar gzip bzip2 which binutils zip unzip sudo shadow-utils findutils',
          ];
        } else if (os.is(Os.WINDOWS)) {
          return [];
        }

        throw new Error(`Unsupported OS for required packages: ${os.name}`);
      }
    };
  }

  /**
   * A component to install CloudWatch Agent for the runner so we can send logs.
   */
  static cloudWatchAgent(): RunnerImageComponent {
    return new class extends RunnerImageComponent {
      name = 'CloudWatchAgent';

      getCommands(os: Os, architecture: Architecture): string[] {
        if (os.isIn(Os._ALL_LINUX_UBUNTU_VERSIONS)) {
          let archUrl;
          if (architecture.is(Architecture.X86_64)) {
            archUrl = 'amd64';
          } else if (architecture.is(Architecture.ARM64)) {
            archUrl = 'arm64';
          } else {
            throw new Error(`Unsupported architecture for required packages: ${architecture.name}`);
          }

          return [
            `curl -sfLo /tmp/amazon-cloudwatch-agent.deb https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/${archUrl}/latest/amazon-cloudwatch-agent.deb`,
            'dpkg -i -E /tmp/amazon-cloudwatch-agent.deb',
            'rm /tmp/amazon-cloudwatch-agent.deb',
          ];
        } else if (os.is(Os.LINUX_AMAZON_2)) {
          return [
            'yum install -y amazon-cloudwatch-agent',
          ];
        } else if (os.is(Os.LINUX_AMAZON_2023)) {
          return [
            'dnf install -y amazon-cloudwatch-agent',
          ];
        } else if (os.is(Os.WINDOWS)) {
          return [
            '$p = Start-Process msiexec.exe -PassThru -Wait -ArgumentList \'/i https://s3.amazonaws.com/amazoncloudwatch-agent/windows/amd64/latest/amazon-cloudwatch-agent.msi /qn\'',
            'if ($p.ExitCode -ne 0) { throw "Exit code is $p.ExitCode" }',
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
        if (os.isIn(Os._ALL_LINUX_UBUNTU_VERSIONS)) {
          return [
            'addgroup runner',
            'adduser --system --disabled-password --home /home/runner --ingroup runner runner',
            'echo "%runner   ALL=(ALL:ALL) NOPASSWD: ALL" > /etc/sudoers.d/runner',
          ];
        } else if (os.isIn(Os._ALL_LINUX_AMAZON_VERSIONS)) {
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
   *
   * @param version Software version to install (e.g. '2.15.0'). Default: latest.
   */
  static awsCli(version?: string): RunnerImageComponent {
    const useVersion = validateVersion(version);
    return new class extends RunnerImageComponent {
      name = 'AwsCli';

      getCommands(os: Os, architecture: Architecture) {
        if (os.isIn(Os._ALL_LINUX_UBUNTU_VERSIONS) || os.isIn(Os._ALL_LINUX_AMAZON_VERSIONS)) {
          let archUrl: string;
          if (architecture.is(Architecture.X86_64)) {
            archUrl = 'x86_64';
          } else if (architecture.is(Architecture.ARM64)) {
            archUrl = 'aarch64';
          } else {
            throw new Error(`Unsupported architecture for awscli: ${architecture.name}`);
          }

          const zipName = useVersion
            ? `awscli-exe-linux-${archUrl}-${useVersion}.zip`
            : `awscli-exe-linux-${archUrl}.zip`;
          return [
            `curl -fsSL "https://awscli.amazonaws.com/${zipName}" -o awscliv2.zip`,
            'unzip -q awscliv2.zip',
            './aws/install',
            'rm -rf awscliv2.zip aws',
          ];
        } else if (os.is(Os.WINDOWS)) {
          const msiUrl = useVersion
            ? `https://awscli.amazonaws.com/AWSCLIV2-${useVersion}.msi`
            : 'https://awscli.amazonaws.com/AWSCLIV2.msi';
          return [
            `$p = Start-Process msiexec.exe -PassThru -Wait -ArgumentList '/i ${msiUrl} /qn'`,
            'if ($p.ExitCode -ne 0) { throw "Exit code is $p.ExitCode" }',
          ];
        }

        throw new Error(`Unknown os/architecture combo for awscli: ${os.name}/${architecture.name}`);
      }
    }();
  }

  /**
   * A component to install the GitHub CLI.
   *
   * @param version Software version to install (e.g. '2.40.0'). Default: latest. Only used on Windows (x64/windows_amd64); on Linux the package manager is used.
   */
  static githubCli(version?: string): RunnerImageComponent {
    const useVersion = validateVersion(version);
    return new class extends RunnerImageComponent {
      name = 'GithubCli';

      getCommands(os: Os, architecture: Architecture) {
        if (useVersion && !os.is(Os.WINDOWS)) {
          throw new Error(
            'RunnerImageComponent.githubCli(version): version is only used on Windows. On Linux the package manager (apt/yum/dnf) is used. Omit the version for Linux images.',
          );
        }
        if (os.isIn(Os._ALL_LINUX_UBUNTU_VERSIONS)) {
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
        } else if (os.is(Os.LINUX_AMAZON_2023)) {
          return [
            'curl -fsSSL https://cli.github.com/packages/rpm/gh-cli.repo -o /etc/yum.repos.d/gh-cli.repo',
            'dnf install -y gh',
          ];
        } else if (os.is(Os.WINDOWS)) {
          if (useVersion) {
            return [
              `Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/cli/cli/releases/download/v${useVersion}/gh_${useVersion}_windows_amd64.msi" -OutFile gh.msi`,
              '$p = Start-Process msiexec.exe -PassThru -Wait -ArgumentList \'/i gh.msi /qn\'',
              'if ($p.ExitCode -ne 0) { throw "Exit code is $p.ExitCode" }',
              'del gh.msi',
            ];
          }
          return [
            'cmd /c curl -w "%{redirect_url}" -fsS https://github.com/cli/cli/releases/latest > $Env:TEMP\\latest-gh',
            '$LatestUrl = Get-Content $Env:TEMP\\latest-gh',
            '$GH_VERSION = ($LatestUrl -Split \'/\')[-1].substring(1)',
            'Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_windows_amd64.msi" -OutFile gh.msi',
            '$p = Start-Process msiexec.exe -PassThru -Wait -ArgumentList \'/i gh.msi /qn\'',
            'if ($p.ExitCode -ne 0) { throw "Exit code is $p.ExitCode" }',
            'del gh.msi',
          ];
        }

        throw new Error(`Unknown os/architecture combo for github cli: ${os.name}/${architecture.name}`);
      }
    }();
  }

  /**
   * A component to install Git.
   *
   * @param version Software version to install (e.g. '2.43.0.windows.1'). Default: latest. Only used on Windows; on Linux the package manager is used.
   */
  static git(version?: string): RunnerImageComponent {
    const useVersion = validateVersion(version);
    return new class extends RunnerImageComponent {
      name = 'Git';

      getCommands(os: Os, architecture: Architecture) {
        if (useVersion && !os.is(Os.WINDOWS)) {
          throw new Error(
            'RunnerImageComponent.git(version): version is only used on Windows. On Linux the package manager (apt/yum/dnf) is used. Omit the version for Linux images.',
          );
        }
        if (os.isIn(Os._ALL_LINUX_UBUNTU_VERSIONS)) {
          return [
            'add-apt-repository ppa:git-core/ppa',
            'apt-get update',
            'DEBIAN_FRONTEND=noninteractive apt-get install -y git',
          ];
        } else if (os.is(Os.LINUX_AMAZON_2)) {
          return [
            'yum install -y git',
          ];
        } else if (os.is(Os.LINUX_AMAZON_2023)) {
          return [
            'dnf install -y git',
          ];
        } else if (os.is(Os.WINDOWS)) {
          if (useVersion) {
            const versionShort = formatGitForWindowsVersion(useVersion);
            return [
              `Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/git-for-windows/git/releases/download/v${useVersion}/Git-${versionShort}-64-bit.exe" -OutFile git-setup.exe`,
              '$p = Start-Process git-setup.exe -PassThru -Wait -ArgumentList \'/VERYSILENT\'',
              'if ($p.ExitCode -ne 0) { throw "Exit code is $p.ExitCode" }',
              'del git-setup.exe',
            ];
          }
          return [
            'cmd /c curl -w "%{redirect_url}" -fsS https://github.com/git-for-windows/git/releases/latest > $Env:TEMP\\latest-git',
            '$LatestUrl = Get-Content $Env:TEMP\\latest-git',
            '$GIT_VERSION = ($LatestUrl -Split \'/\')[-1].substring(1)',
            '$GIT_VERSION_SHORT = ($GIT_VERSION -Split \'.windows.\')[0]',
            '$GIT_REVISION = ($GIT_VERSION -Split \'.windows.\')[1]',
            'If ($GIT_REVISION -gt 1) {$GIT_VERSION_SHORT = "$GIT_VERSION_SHORT.$GIT_REVISION"}',
            'Invoke-WebRequest -UseBasicParsing -Uri https://github.com/git-for-windows/git/releases/download/v${GIT_VERSION}/Git-${GIT_VERSION_SHORT}-64-bit.exe -OutFile git-setup.exe',
            '$p = Start-Process git-setup.exe -PassThru -Wait -ArgumentList \'/VERYSILENT\'',
            'if ($p.ExitCode -ne 0) { throw "Exit code is $p.ExitCode" }',
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
        if (os.isIn(Os._ALL_LINUX_UBUNTU_VERSIONS) || os.isIn(Os._ALL_LINUX_AMAZON_VERSIONS)) {
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

          if (os.isIn(Os._ALL_LINUX_UBUNTU_VERSIONS)) {
            commands.push('/home/runner/bin/installdependencies.sh');
          } else if (os.is(Os.LINUX_AMAZON_2)) {
            commands.push('yum install -y openssl-libs krb5-libs zlib libicu60');
          } else if (os.is(Os.LINUX_AMAZON_2023)) {
            commands.push('dnf install -y openssl-libs krb5-libs zlib libicu-67.1');
          }

          commands.push('mkdir -p /opt/hostedtoolcache', 'chown runner /opt/hostedtoolcache');

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

          runnerCommands = runnerCommands.concat([
            // create directories
            'mkdir C:\\hostedtoolcache\\windows',
            'mkdir C:\\tools',
            // download zstd and extract to C:\tools
            'cmd /c curl -w "%{redirect_url}" -fsS https://github.com/facebook/zstd/releases/latest > $Env:TEMP\\latest-zstd',
            '$LatestUrl = Get-Content $Env:TEMP\\latest-zstd',
            '$ZSTD_VERSION = ($LatestUrl -Split \'/\')[-1].substring(1)',
            'Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/facebook/zstd/releases/download/v$ZSTD_VERSION/zstd-v$ZSTD_VERSION-win64.zip" -OutFile zstd.zip',
            'Expand-Archive zstd.zip -DestinationPath C:\\tools',
            'Move-Item -Path C:\\tools\\zstd-v$ZSTD_VERSION-win64\\zstd.exe C:\\tools',
            'Remove-Item -LiteralPath "C:\\tools\\zstd-v$ZSTD_VERSION-win64" -Force -Recurse',
            'del zstd.zip',
            // add C:\tools to PATH
            '$persistedPaths = [Environment]::GetEnvironmentVariable(\'Path\', [EnvironmentVariableTarget]::Machine)',
            '[Environment]::SetEnvironmentVariable("PATH", $persistedPaths + ";C:\\tools", [EnvironmentVariableTarget]::Machine)',
          ]);

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
   * A component to install Docker.
   *
   * On Windows this sets up dockerd for Windows containers without Docker Desktop. If you need Linux containers on Windows, you'll need to install Docker Desktop which doesn't seem to play well with servers (PRs welcome).
   *
   * @param version Software version to install (e.g. '29.1.5'). Default: latest. Only used on Windows; on Linux (Ubuntu, Amazon Linux 2 and Amazon Linux 2023) the package version format is not reliably predictable so latest is always used.
   */
  static docker(version?: string): RunnerImageComponent {
    const useVersion = validateVersion(version);
    return new class extends RunnerImageComponent {
      name = 'Docker';

      getCommands(os: Os, architecture: Architecture) {
        if (os.isIn(Os._ALL_LINUX_UBUNTU_VERSIONS)) {
          if (useVersion) {
            throw new Error(
              'RunnerImageComponent.docker(version): version is only used on Windows. On Ubuntu the apt package version format is not reliably predictable; use latest (omit version) for Ubuntu images.',
            );
          }
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
          if (useVersion) {
            throw new Error(
              'RunnerImageComponent.docker(version): version is only used on Windows. On Amazon Linux the package version is not predictable; use latest (omit version) for Amazon Linux images.',
            );
          }
          return [
            'amazon-linux-extras install docker',
            'usermod -a -G docker runner',
            'curl -sfLo /usr/bin/docker-compose https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s | tr \'[:upper:]\' \'[:lower:]\')-$(uname -m)',
            'chmod +x /usr/bin/docker-compose',
            'ln -s /usr/bin/docker-compose /usr/libexec/docker/cli-plugins/docker-compose',
          ];
        } else if (os.is(Os.LINUX_AMAZON_2023)) {
          if (useVersion) {
            throw new Error(
              'RunnerImageComponent.docker(version): version is only used on Windows. On Amazon Linux the package version is not predictable; use latest (omit version) for Amazon Linux images.',
            );
          }
          return [
            'dnf install -y docker',
            'usermod -a -G docker runner',
            'curl -sfLo /usr/bin/docker-compose https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s | tr \'[:upper:]\' \'[:lower:]\')-$(uname -m)',
            'chmod +x /usr/bin/docker-compose',
            'ln -s /usr/bin/docker-compose /usr/libexec/docker/cli-plugins/docker-compose',
          ];
        } else if (os.is(Os.WINDOWS)) {
          const downloadCommands = useVersion ? [
            `Invoke-WebRequest -UseBasicParsing -Uri "https://download.docker.com/win/static/stable/x86_64/docker-${useVersion}.zip" -OutFile docker.zip`,
          ] : [
            '$BaseUrl = "https://download.docker.com/win/static/stable/x86_64/"',
            '$html = Invoke-WebRequest -UseBasicParsing -Uri $BaseUrl',
            '$files = $html.Links.href | Where-Object { $_ -match \'^docker-[0-9\\.]+\\.zip$\' }',
            'if (-not $files) { Write-Error "No docker-*.zip files found." ; exit 1 }',
            '$latest = $files | Sort-Object { try { [Version]($_ -replace \'^docker-|\\.zip$\') } catch { [Version]"0.0.0" } } -Descending | Select-Object -First 1',
            'Invoke-WebRequest -UseBasicParsing -Uri $BaseUrl$latest -OutFile docker.zip',
          ];
          return [
            // download static binaries
            ...downloadCommands,
            // extract to C:\Program Files\Docker
            'Expand-Archive docker.zip -DestinationPath "$Env:ProgramFiles"',
            'del docker.zip',
            // add to path
            '$persistedPaths = [Environment]::GetEnvironmentVariable(\'Path\', [EnvironmentVariableTarget]::Machine)',
            '[Environment]::SetEnvironmentVariable("PATH", $persistedPaths + ";$Env:ProgramFiles\\Docker", [EnvironmentVariableTarget]::Machine)',
            '$env:PATH = $env:PATH + ";$Env:ProgramFiles\\Docker"',
            // register docker service
            'dockerd --register-service',
            'if ($LASTEXITCODE -ne 0) { throw "Exit code is $LASTEXITCODE" }',
            // enable containers feature
            'Enable-WindowsOptionalFeature -Online -FeatureName containers -All -NoRestart',
            // install docker-compose
            'cmd /c curl -w "%{redirect_url}" -fsS https://github.com/docker/compose/releases/latest > $Env:TEMP\\latest-docker-compose',
            '$LatestUrl = Get-Content $Env:TEMP\\latest-docker-compose',
            '$LatestDockerCompose = ($LatestUrl -Split \'/\')[-1]',
            'Invoke-WebRequest -UseBasicParsing -Uri  "https://github.com/docker/compose/releases/download/${LatestDockerCompose}/docker-compose-Windows-x86_64.exe" -OutFile $Env:ProgramFiles\\Docker\\docker-compose.exe',
            'New-Item -ItemType directory -Path "$Env:ProgramFiles\\Docker\\cli-plugins"',
            'Copy-Item -Path "$Env:ProgramFiles\\Docker\\docker-compose.exe" -Destination "$Env:ProgramFiles\\Docker\\cli-plugins\\docker-compose.exe"',
          ];
        }

        throw new Error(`Unknown os/architecture combo for docker: ${os.name}/${architecture.name}`);
      }

      shouldReboot(os: Os, _architecture: Architecture): boolean {
        return os.is(Os.WINDOWS);
      }
    }();
  }

  /**
   * A component to install Docker-in-Docker.
   *
   * @deprecated use `docker()`
   * @param version Software version to install (e.g. '29.1.5'). Default: latest.
   */
  static dockerInDocker(version?: string): RunnerImageComponent {
    return RunnerImageComponent.docker(version);
  }

  /**
   * A component to add a trusted certificate authority. This can be used to support GitHub Enterprise Server with self-signed certificate.
   *
   * @param source path to certificate file in PEM format, or a directory containing certificate files (.pem or .crt)
   * @param name unique certificate name to be used on runner file system
   */
  static extraCertificates(source: string, name: string): RunnerImageComponent {
    // Sanitize the name to only contain alphanumeric characters, dashes and underscores
    const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '-');

    // Discover certificate files (supports both file and directory)
    const certificateFiles = discoverCertificateFiles(source);

    return new class extends RunnerImageComponent {
      name = `Extra-Certificates-${sanitizedName}`;

      getCommands(os: Os, architecture: Architecture) {
        if (os.isIn(Os._ALL_LINUX_UBUNTU_VERSIONS)) {
          return [
            'update-ca-certificates',
          ];
        } else if (os.isIn(Os._ALL_LINUX_AMAZON_VERSIONS)) {
          return [
            'update-ca-trust',
          ];
        } else if (os.is(Os.WINDOWS)) {
          const commands: string[] = [];
          for (let i = 0; i < certificateFiles.length; i++) {
            const certName = `${sanitizedName}-${i}`;
            commands.push(
              `Import-Certificate -FilePath C:\\${certName}.crt -CertStoreLocation Cert:\\LocalMachine\\Root`,
              `Remove-Item C:\\${certName}.crt`,
            );
          }
          return commands;
        }

        throw new Error(`Unknown os/architecture combo for extra certificates: ${os.name}/${architecture.name}`);
      }

      getAssets(os: Os, _architecture: Architecture): RunnerImageAsset[] {
        const assets: RunnerImageAsset[] = [];

        let targetDir: string;
        if (os.isIn(Os._ALL_LINUX_UBUNTU_VERSIONS)) {
          targetDir = '/usr/local/share/ca-certificates/';
        } else if (os.isIn(Os._ALL_LINUX_AMAZON_VERSIONS)) {
          targetDir = '/etc/pki/ca-trust/source/anchors/';
        } else if (os.is(Os.WINDOWS)) {
          targetDir = 'C:\\';
        } else {
          throw new Error(`Unsupported OS for extra certificates: ${os.name}`);
        }

        for (let i = 0; i < certificateFiles.length; i++) {
          const certName = `${sanitizedName}-${i}`;
          assets.push({
            source: certificateFiles[i],
            target: `${targetDir}${certName}.crt`,
          });
        }

        return assets;
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
        if (!os.isIn(Os._ALL_LINUX_VERSIONS)) {
          throw new Error(`Unsupported OS for Lambda entrypoint: ${os.name}`);
        }

        return [];
      }

      getAssets(_os: Os, _architecture: Architecture): RunnerImageAsset[] {
        return [
          {
            source: path.join(__dirname, '..', '..', 'assets', 'providers', 'lambda-bootstrap.sh'),
            target: '/bootstrap.sh',
          },
          {
            source: path.join(__dirname, '..', '..', 'assets', 'providers', 'lambda-runner.sh'),
            target: '/runner.sh',
          },
        ];
      }

      getDockerCommands(_os: Os, _architecture: Architecture): string[] {
        return [
          'LABEL DISABLE_SOCI=1', // hacky way to disable soci v2 indexing on lambda as lambda will fail to start with an index
          'ENTRYPOINT ["bash", "/bootstrap.sh"]',
        ];
      }
    };
  }

  /**
   * A component to add environment variables for jobs the runner executes.
   *
   * These variables only affect the jobs ran by the runner. They are not global. They do not affect other components.
   *
   * It is not recommended to use this component to pass secrets. Instead, use GitHub Secrets or AWS Secrets Manager.
   *
   * Must be used after the {@link githubRunner} component.
   */
  static environmentVariables(vars: Record<string, string>): RunnerImageComponent {
    Object.entries(vars).forEach(e => {
      if (e[0].includes('\n') || e[1].includes('\n')) {
        throw new Error(`Environment variable cannot contain newlines: ${e}`);
      }
    });

    return new class extends RunnerImageComponent {
      name = 'EnvironmentVariables';

      getCommands(os: Os, _architecture: Architecture) {
        if (os.isIn(Os._ALL_LINUX_VERSIONS)) {
          return Object.entries(vars).map(e => `echo '${e[0]}=${e[1].replace(/'/g, "'\"'\"'")}' >> /home/runner/.env`);
        } else if (os.is(Os.WINDOWS)) {
          return Object.entries(vars).map(e => `Add-Content -Path C:\\actions\\.env -Value '${e[0]}=${e[1].replace(/'/g, "''")}'`);
        } else {
          throw new Error(`Unsupported OS for environment variables component: ${os.name}`);
        }
      }
    };
  }

  /**
   * Component name.
   *
   * Used to identify component in image build logs, and for {@link IConfigurableRunnerImageBuilder.removeComponent}
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
   * Returns true if the image builder should be rebooted after this component is installed.
   */
  shouldReboot(_os: Os, _architecture: Architecture): boolean {
    return false;
  }

  /**
   * Convert component to an AWS Image Builder component.
   *
   * Components are cached and reused when the same component is requested with the same
   * OS and architecture, reducing stack template size and number of resources.
   *
   * @internal
   */
  _asAwsImageBuilderComponent(scope: Construct, os: Os, architecture: Architecture) {
    let platform: 'Linux' | 'Windows';
    if (os.isIn(Os._ALL_LINUX_UBUNTU_VERSIONS) || os.isIn(Os._ALL_LINUX_AMAZON_VERSIONS)) {
      platform = 'Linux';
    } else if (os.is(Os.WINDOWS)) {
      platform = 'Windows';
    } else {
      throw new Error(`Unknown os/architecture combo for image builder component: ${os.name}/${architecture.name}`);
    }

    // Get component properties to create a cache key
    const commands = this.getCommands(os, architecture);
    const assets = this.getAssets(os, architecture);
    const reboot = this.shouldReboot(os, architecture);

    // Create a cache key based on component identity and properties
    const stack = cdk.Stack.of(scope);
    const cacheKey = this._getCacheKey(os, architecture, commands, assets, reboot);

    // Create a consistent ID based on the cache key to ensure the same component
    // always gets the same ID, regardless of the passed-in id parameter
    // The cache key is already a hash, so we can use it directly
    // Prefix with GHRInternal/ to avoid conflicts with user-defined constructs
    const consistentId = `GHRInternal/Component-${this.name}-${os.name}-${architecture.name}-${cacheKey.substring(0, 10)}`.replace(/[^a-zA-Z0-9-/]/g, '-');

    // Use the construct tree as the cache - check if component already exists in the stack
    const existing = stack.node.tryFindChild(consistentId);
    if (existing) {
      // Component already exists in this stack, reuse it
      return existing as ImageBuilderComponent;
    }

    // Create new component in the stack scope so it can be shared across all scopes in the same stack
    const component = new ImageBuilderComponent(stack, consistentId, {
      platform: platform,
      commands: commands,
      assets: assets.map((asset, index) => {
        return {
          asset: new s3_assets.Asset(stack, `GHRInternal/${consistentId}/Asset${index}`, { path: asset.source }),
          path: asset.target,
        };
      }),
      displayName: `${this.name} (${os.name}/${architecture.name})`,
      description: `${this.name} component for ${os.name}/${architecture.name}`,
      reboot: reboot,
    });

    return component;
  }

  /**
   * Generate a cache key for component reuse.
   * Components with the same name, OS, architecture, commands, assets, and reboot flag will share the same key.
   * Returns a hash of all component properties to ensure uniqueness.
   *
   * @internal
   */
  private _getCacheKey(os: Os, architecture: Architecture, commands: string[], assets: RunnerImageAsset[], reboot: boolean): string {
    // Create a hash of the component properties
    const assetKeys = assets.map(a => `${a.source}:${a.target}`).sort().join('|');
    const keyData = `${this.name}:${os.name}:${architecture.name}:${commands.join('\n')}:${assetKeys}:${reboot}`;
    return crypto.createHash('md5').update(keyData).digest('hex');
  }
}

