import { aws_s3_assets as s3_assets } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Architecture, RunnerVersion } from '../../../providers';
import { ImageBuilderComponent } from '../index';

/**
 * Components for Ubuntu Linux that can be used with AWS Image Builder based builders. These cannot be used by {@link CodeBuildImageBuilder}.
 *
 * @deprecated Use `RunnerImageComponent` instead.
 */
export class LinuxUbuntuComponents {
  public static requiredPackages(scope: Construct, id: string, architecture: Architecture) {
    let archUrl;
    if (architecture.is(Architecture.X86_64)) {
      archUrl = 'amd64';
    } else if (architecture.is(Architecture.ARM64)) {
      archUrl = 'arm64';
    } else {
      throw new Error(`Unsupported architecture for required packages: ${architecture.name}`);
    }

    return new ImageBuilderComponent(scope, id, {
      platform: 'Linux',
      displayName: 'Required packages',
      description: 'Install packages required for GitHub Runner and upgrade all packages',
      commands: [
        'apt-get update',
        'DEBIAN_FRONTEND=noninteractive apt-get upgrade -y',
        'DEBIAN_FRONTEND=noninteractive apt-get install -y curl sudo jq bash zip unzip iptables software-properties-common ca-certificates',
        `curl -sfLo /tmp/amazon-cloudwatch-agent.deb https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/${archUrl}/latest/amazon-cloudwatch-agent.deb`,
        'dpkg -i -E /tmp/amazon-cloudwatch-agent.deb',
        'rm /tmp/amazon-cloudwatch-agent.deb',
      ],
    });
  }

  public static runnerUser(scope: Construct, id: string, _architecture: Architecture) {
    return new ImageBuilderComponent(scope, id, {
      platform: 'Linux',
      displayName: 'GitHub Runner user',
      description: 'Install latest version of AWS CLI',
      commands: [
        'addgroup runner',
        'adduser --system --disabled-password --home /home/runner --ingroup runner runner',
        'echo "%runner   ALL=(ALL:ALL) NOPASSWD: ALL" > /etc/sudoers.d/runner',
      ],
    });
  }

  public static awsCli(scope: Construct, id: string, architecture: Architecture) {
    let archUrl;
    if (architecture.is(Architecture.X86_64)) {
      archUrl = 'x86_64';
    } else if (architecture.is(Architecture.ARM64)) {
      archUrl = 'aarch64';
    } else {
      throw new Error(`Unsupported architecture for awscli: ${architecture.name}`);
    }

    return new ImageBuilderComponent(scope, id, {
      platform: 'Linux',
      displayName: 'AWS CLI',
      description: 'Install latest version of AWS CLI',
      commands: [
        `curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-${archUrl}.zip" -o awscliv2.zip`,
        'unzip -q awscliv2.zip',
        './aws/install',
        'rm -rf awscliv2.zip aws',
      ],
    });
  }

  public static githubCli(scope: Construct, id: string, _architecture: Architecture) {
    return new ImageBuilderComponent(scope, id, {
      platform: 'Linux',
      displayName: 'GitHub CLI',
      description: 'Install latest version of gh',
      commands: [
        'curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg',
        'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] ' +
        '  https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null',
        'apt-get update',
        'DEBIAN_FRONTEND=noninteractive apt-get install -y gh',
      ],
    });
  }

  public static git(scope: Construct, id: string, _architecture: Architecture) {
    return new ImageBuilderComponent(scope, id, {
      platform: 'Linux',
      displayName: 'Git',
      description: 'Install latest version of git',
      commands: [
        'add-apt-repository ppa:git-core/ppa',
        'apt-get update',
        'DEBIAN_FRONTEND=noninteractive apt-get install -y git',
      ],
    });
  }

  public static githubRunner(scope: Construct, id: string, runnerVersion: RunnerVersion, architecture: Architecture) {
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

    return new ImageBuilderComponent(scope, id, {
      platform: 'Linux',
      displayName: 'GitHub Actions Runner',
      description: 'Install latest version of GitHub Actions Runner',
      commands: [
        versionCommand,
        `curl -fsSLO "https://github.com/actions/runner/releases/download/v\${RUNNER_VERSION}/actions-runner-linux-${archUrl}-\${RUNNER_VERSION}.tar.gz"`,
        `tar xzf "actions-runner-linux-${archUrl}-\${RUNNER_VERSION}.tar.gz"`,
        `rm actions-runner-linux-${archUrl}-\${RUNNER_VERSION}.tar.gz`,
        './bin/installdependencies.sh',
        `echo -n ${runnerVersion.version} > RUNNER_VERSION`,
      ],
    });
  }

  public static docker(scope: Construct, id: string, _architecture: Architecture) {
    return new ImageBuilderComponent(scope, id, {
      platform: 'Linux',
      displayName: 'Docker',
      description: 'Install latest version of Docker',
      commands: [
        'curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker.gpg',
        'echo ' +
        '  "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ' +
        '  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null',
        'apt-get update',
        'DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin',
        'usermod -aG docker runner',
        'ln -s /usr/libexec/docker/cli-plugins/docker-compose /usr/bin/docker-compose',
      ],
    });
  }

  public static extraCertificates(scope: Construct, id: string, path: string) {
    return new ImageBuilderComponent(scope, id, {
      platform: 'Linux',
      displayName: 'Extra certificates',
      description: 'Install self-signed certificates to provide access to GitHub Enterprise Server',
      commands: [
        'cp certs/certs.pem /usr/local/share/ca-certificates/github-enterprise-server.crt',
        'update-ca-certificates',
      ],
      assets: [
        {
          path: 'certs',
          asset: new s3_assets.Asset(scope, `${id} Asset`, { path }),
        },
      ],
    });
  }
}
