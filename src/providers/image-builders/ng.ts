import * as crypto from 'crypto';
import * as cdk from 'aws-cdk-lib';
import {
  Annotations,
  aws_codebuild as codebuild,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_events as events,
  aws_events_targets as events_targets,
  aws_iam as iam,
  aws_logs as logs,
  CustomResource,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { ComputeType } from 'aws-cdk-lib/aws-codebuild';
import { TagMutability, TagStatus } from 'aws-cdk-lib/aws-ecr';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { ImageBuilderAsset } from './common';
import { BuildImageFunction } from '../../lambdas/build-image-function';
import { singletonLambda } from '../../utils';
import { Architecture, IImageBuilder, Os, RunnerImage, RunnerVersion } from '../common';

// TODO Docker specific things like VOLUME, ENV, etc.

export abstract class RunnerImageComponent {
  static custom(commands: string[], assets?: ImageBuilderAsset[]) {
    return new class extends RunnerImageComponent {
      getCommands(_os: Os, _architecture: Architecture) {
        return commands;
      }
      getAssets(_os: Os, _architecture: Architecture) {
        return assets ?? [];
      }
    }();
  }

  static requiredPackages() {
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
            'yum install -y jq tar gzip bzip2 which binutils zip unzip',
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

  static runnerUser() {
    return new class extends RunnerImageComponent {
      getCommands(os: Os, _architecture: Architecture): string[] {
        if (os.is(Os.LINUX_UBUNTU) || os.is(Os.LINUX_AMAZON_2)) {
          return [
            'addgroup runner',
            'adduser --system --disabled-password --home /home/runner --ingroup runner runner',
            'usermod -aG sudo runner',
            'echo "%sudo   ALL=(ALL:ALL) NOPASSWD: ALL" > /etc/sudoers.d/runner',
          ];
        } else if (os.is(Os.WINDOWS)) {
          // TODO
          return [];
        }

        throw new Error(`Unsupported OS for runner user: ${os.name}`);
      }
    };
  }

  static awsCli() {
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

  static githubCli() {
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
            '$ProgressPreference = \'SilentlyContinue\'',
            'Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_windows_amd64.msi" -OutFile gh.msi',
            'Start-Process msiexec.exe -Wait -ArgumentList \'/i gh.msi /qn\'',
            'del gh.msi',
          ];
        }

        throw new Error(`Unknown os/architecture combo for github cli: ${os.name}/${architecture.name}`);
      }
    }();
  }

  static git() {
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

  static githubRunner(runnerVersion: RunnerVersion) {
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

          return [
            versionCommand,
            `curl -fsSLO "https://github.com/actions/runner/releases/download/v\${RUNNER_VERSION}/actions-runner-linux-${archUrl}-\${RUNNER_VERSION}.tar.gz"`,
            `tar -C /home/runner -xzf "actions-runner-linux-${archUrl}-\${RUNNER_VERSION}.tar.gz"`,
            `rm actions-runner-linux-${archUrl}-\${RUNNER_VERSION}.tar.gz`,
            '/home/runner/bin/installdependencies.sh',
          ];
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

  static docker() {
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

  static dockerInDocker() {
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

  static extraCertificates(_path: string) {
    return new class extends RunnerImageComponent {
      getCommands(os: Os, architecture: Architecture) {
        if (os.is(Os.LINUX_UBUNTU) || os.is(Os.LINUX_AMAZON_2)) {
          return [
            'cp certs/certs.pem /usr/local/share/ca-certificates/github-enterprise-server.crt',
            'update-ca-certificates',
          ];
        } else if (os.is(Os.WINDOWS)) {
          return [
            'Import-Certificate -FilePath certs\\certs.pem -CertStoreLocation Cert:\\LocalMachine\\Root',
          ];
        }

        throw new Error(`Unknown os/architecture combo for extra certificates: ${os.name}/${architecture.name}`);
      }

      getAssets(_os: Os, _architecture: Architecture): ImageBuilderAsset[] {
        // TODO fix this to return path to asset so the user can put it in scope
        // return [
        //   {
        //     path: 'certs',
        //     asset: new s3_assets.Asset(scope, `${id} Asset`, { path }),
        //   },
        // ];
        return [];
      }
    }();
  }

  abstract getCommands(_os: Os, _architecture: Architecture): string[];
  getAssets(_os: Os, _architecture: Architecture): ImageBuilderAsset[] {
    return [];
  }
}

interface RunnerImageBuilderProps {
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
   * Path to Dockerfile to be built. It can be a path to a Dockerfile, a folder containing a Dockerfile, or a zip file containing a Dockerfile.
   */
  readonly dockerfilePath: string;

  /**
   * Version of GitHub Runners to install.
   *
   * @default latest version available
   */
  readonly runnerVersion?: RunnerVersion;

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
}

export class RunnerImageBuilder extends Construct implements IImageBuilder/*, IAmiBuilder*/ {
  private components: RunnerImageComponent[] = [];
  private preBuild: string[] = [];
  private postBuild: string[] = [];
  private boundImage?: RunnerImage;
  private readonly os: Os;
  private readonly architecture: Architecture;
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

  constructor(scope: Construct, id: string, props?: RunnerImageBuilderProps) {
    super(scope, id);

    this.os = props?.os ?? Os.LINUX_UBUNTU;
    this.architecture = props?.architecture ?? Architecture.X86_64;
    this.runnerVersion = props?.runnerVersion ?? RunnerVersion.latest();
    this.rebuildInterval = props?.rebuildInterval ?? Duration.days(7);
    this.logRetention = props?.logRetention ?? RetentionDays.ONE_MONTH;
    this.logRemovalPolicy = props?.logRemovalPolicy ?? RemovalPolicy.DESTROY;
    this.vpc = props?.vpc;
    this.securityGroups = props?.securityGroup ? [props.securityGroup] : undefined;
    this.subnetSelection = props?.subnetSelection;
    this.timeout = props?.timeout ?? Duration.hours(1);
    this.computeType = props?.computeType ?? ComputeType.SMALL;

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

    // choose build image
    this.buildImage = props?.buildImage ?? this.getBuildImage();

    // default component -- TODO let user pick these
    this.addComponent(RunnerImageComponent.requiredPackages());
    this.addComponent(RunnerImageComponent.runnerUser());
    this.addComponent(RunnerImageComponent.git());
    this.addComponent(RunnerImageComponent.githubCli());
    this.addComponent(RunnerImageComponent.awsCli());
    this.addComponent(RunnerImageComponent.dockerInDocker());
    this.addComponent(RunnerImageComponent.githubRunner(this.runnerVersion));
  }

  public addComponent(component: RunnerImageComponent) {
    this.components.push(component);
  }

  /**
   * Called by IRunnerProvider to finalize settings and create the image builder.
   */
  bind(): RunnerImage {
    if (this.boundImage) {
      return this.boundImage;
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

    // TODO
    // for (const [assetPath, asset] of this.secondaryAssets.entries()) {
    //   project.addSecondarySource(codebuild.Source.s3({
    //     identifier: assetPath,
    //     bucket: asset.bucket,
    //     path: asset.s3ObjectKey,
    //   }));
    // }

    this.boundImage = {
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
    return this.boundImage;
  }

  private getBuildImage(): codebuild.IBuildImage {
    if (this.os.is(Os.LINUX_UBUNTU) || this.os.is(Os.LINUX_AMAZON_2)) {
      if (this.architecture.is(Architecture.X86_64)) {
        return codebuild.LinuxBuildImage.STANDARD_5_0;
      } else if (this.architecture.is(Architecture.ARM64)) {
        return codebuild.LinuxArmBuildImage.AMAZON_LINUX_2_STANDARD_2_0;
      }
    }
    if (this.os.is(Os.WINDOWS)) {
      throw new Error('CodeBuild cannot be used to build Windows Docker images https://github.com/docker-library/docker/issues/49');
    }

    throw new Error(`Unable to find CodeBuild image for ${this.os.name}/${this.architecture.name}`);
  }

  private getBuildSpec(repository: ecr.Repository, logGroup: logs.LogGroup, runnerVersion: RunnerVersion): any {
    const dockerfile = 'FROM public.ecr.aws/lts/ubuntu:20.04\nCOPY build.sh /tmp/build.sh\nRUN chmod +x /tmp/build.sh && /tmp/build.sh\nVOLUME /var/lib/docker'; // TODO configurable image
    const script = '#!/bin/bash\nset -exuo pipefail\n' + this.components.map(c => c.getCommands(this.os, this.architecture)).flat().join('\n');

    // don't forget to change BUILDSPEC_VERSION when the buildSpec changes, and you want to trigger a rebuild on deploy
    // let buildArgs = '';
    // for (const [name, value] of this.buildArgs.entries()) {
    //   buildArgs += ` --build-arg "${name}"="${value}"`;
    // }
    // buildArgs += ` --build-arg RUNNER_VERSION="${runnerVersion ? runnerVersion.version : RunnerVersion.latest().version}"`;

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
          commands: this.preBuild.concat([
            'mkdir -p extra_certs',
            `aws ecr get-login-password --region "$AWS_DEFAULT_REGION" | docker login --username AWS --password-stdin ${thisStack.account}.dkr.ecr.${thisStack.region}.amazonaws.com`,
          ]),
        },
        build: {
          commands: [
            `cat > Dockerfile <<'EOFGITHUBRUNNERSDOCKERFILE'\n${dockerfile}\nEOFGITHUBRUNNERSDOCKERFILE`,
            `cat > build.sh <<'EOFGITHUBRUNNERSDOCKERFILE'\n${script}\nEOFGITHUBRUNNERSDOCKERFILE`,
            'cat Dockerfile build.sh', // TODO remove
            'docker build . -t "$REPO_URI"',
            'docker push "$REPO_URI"',
          ],
        },
        post_build: {
          commands: this.postBuild.concat([
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
          ]),
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
    crHandler.role?.attachInlinePolicy(policy);

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
      components.push(component.getCommands(Os.LINUX_UBUNTU, Architecture.X86_64).join('\n')); // TODO
    }
    // let components: string[] = [this.dockerfile.assetHash];
    // all additional files
    // TODO assets
    // for (const [name, asset] of this.secondaryAssets.entries()) {
    //   components.push(name);
    //   components.push(asset.assetHash);
    // }
    // buildspec.yml version
    // TODO -- components.push(`v${RunnerImageBuilder.BUILDSPEC_VERSION}`);
    // runner version
    components.push(this.runnerVersion.version);
    // user commands
    components = components.concat(this.preBuild);
    components = components.concat(this.postBuild);
    // TODO -- build args
    // for (const [name, value] of this.buildArgs.entries()) {
    //   components.push(name);
    //   components.push(value);
    // }
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
}
