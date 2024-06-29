import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2, aws_iam as iam, aws_imagebuilder as imagebuilder, aws_logs as logs, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ImageBuilderBase } from './common';
import { LinuxUbuntuComponents } from './linux-components';
import { WindowsComponents } from './windows-components';
import { Architecture, Os, RunnerAmi, RunnerImage, RunnerVersion } from '../../../providers';
import { singletonLambda } from '../../../utils';
import { uniqueImageBuilderName } from '../../common';
import { AmiRecipe, defaultBaseAmi } from '../ami';
import { ImageBuilderComponent } from '../builder';
import { DeleteResourcesFunction } from '../delete-resources-function';

/**
 * Properties for {@link AmiBuilder} construct.
 */
export interface AmiBuilderProps {
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
   * Version of GitHub Runners to install.
   *
   * @default latest version available
   */
  readonly runnerVersion?: RunnerVersion;

  /**
   * Schedule the AMI to be rebuilt every given interval. Useful for keeping the AMI up-do-date with the latest GitHub runner version and latest OS updates.
   *
   * Set to zero to disable.
   *
   * @default Duration.days(7)
   */
  readonly rebuildInterval?: Duration;

  /**
   * VPC where builder instances will be launched.
   *
   * @default default account VPC
   */
  readonly vpc?: ec2.IVpc;

  /**
   * Security group to assign to launched builder instances.
   *
   * @default new security group
   *
   * @deprecated use {@link securityGroups}
   */
  readonly securityGroup?: ec2.ISecurityGroup;

  /**
   * Security groups to assign to launched builder instances.
   *
   * @default new security group
   */
  readonly securityGroups?: ec2.ISecurityGroup[];

  /**
   * Where to place the network interfaces within the VPC. Only the first matched subnet will be used.
   *
   * @default default VPC subnet
   */
  readonly subnetSelection?: ec2.SubnetSelection;

  /**
   * The instance type used to build the image.
   *
   * @default m6i.large
   */
  readonly instanceType?: ec2.InstanceType;

  /**
   * The number of days log events are kept in CloudWatch Logs. When updating
   * this property, unsetting it doesn't remove the log retention policy. To
   * remove the retention policy, set the value to `INFINITE`.
   *
   * @default logs.RetentionDays.ONE_MONTH
   */
  readonly logRetention?: logs.RetentionDays;

  /**
   * Removal policy for logs of image builds. If deployment fails on the custom resource, try setting this to `RemovalPolicy.RETAIN`. This way the logs can still be viewed, and you can see why the build failed.
   *
   * We try to not leave anything behind when removed. But sometimes a log staying behind is useful.
   *
   * @default RemovalPolicy.DESTROY
   */
  readonly logRemovalPolicy?: RemovalPolicy;

  /**
   * Install Docker inside the image, so it can be used by the runner.
   *
   * @default true
   */
  readonly installDocker?: boolean;
}

/**
 * An AMI builder that uses AWS Image Builder to build AMIs pre-baked with all the GitHub Actions runner requirements. Builders can be used with {@link Ec2RunnerProvider}.
 *
 * Each builder re-runs automatically at a set interval to make sure the AMIs contain the latest versions of everything.
 *
 * You can create an instance of this construct to customize the AMI used to spin-up runners. Some runner providers may require custom components. Check the runner provider documentation.
 *
 * For example, to set a specific runner version, rebuild the image every 2 weeks, and add a few packages for the EC2 provider, use:
 *
 * ```
 * const builder = new AmiBuilder(this, 'Builder', {
 *     runnerVersion: RunnerVersion.specific('2.293.0'),
 *     rebuildInterval: Duration.days(14),
 * });
 * builder.addComponent(new ImageBuilderComponent(scope, id, {
 *   platform: 'Linux',
 *   displayName: 'p7zip',
 *   description: 'Install some more packages',
 *   commands: [
 *     'apt-get install p7zip',
 *   ],
 * }));
 * new Ec2RunnerProvider(this, 'EC2 provider', {
 *     labels: ['custom-ec2'],
 *     amiBuilder: builder,
 * });
 * ```
 *
 * @deprecated use RunnerImageBuilder, e.g. with Ec2RunnerProvider.imageBuilder()
 */
export class AmiBuilder extends ImageBuilderBase {
  private boundAmi?: RunnerAmi;

  constructor(scope: Construct, id: string, props?: AmiBuilderProps) {
    super(scope, id, {
      os: props?.os,
      supportedOs: [Os.LINUX, Os.LINUX_UBUNTU, Os.LINUX_AMAZON_2, Os.WINDOWS],
      architecture: props?.architecture,
      supportedArchitectures: [Architecture.X86_64, Architecture.ARM64],
      instanceType: props?.instanceType,
      vpc: props?.vpc,
      securityGroups: props?.securityGroup ? [props.securityGroup] : props?.securityGroups,
      subnetSelection: props?.subnetSelection,
      logRemovalPolicy: props?.logRemovalPolicy,
      logRetention: props?.logRetention,
      runnerVersion: props?.runnerVersion,
      rebuildInterval: props?.rebuildInterval,
      imageTypeName: 'AMI',
    });

    // add all basic components
    if (this.os.is(Os.WINDOWS)) {
      this.addBaseWindowsComponents(props?.installDocker ?? true);
    } else if (this.os.is(Os.LINUX) || this.os.is(Os.LINUX_UBUNTU)) {
      this.addBaseLinuxComponents(props?.installDocker ?? true);
    } else {
      throw new Error(`Unsupported OS for AMI builder: ${this.os.name}`);
    }
  }

  private addBaseWindowsComponents(installDocker: boolean) {
    this.addComponent(WindowsComponents.cloudwatchAgent(this, 'CloudWatch agent'));
    this.addComponent(WindowsComponents.awsCli(this, 'AWS CLI'));
    this.addComponent(WindowsComponents.githubCli(this, 'GitHub CLI'));
    this.addComponent(WindowsComponents.git(this, 'git'));
    this.addComponent(WindowsComponents.githubRunner(this, 'GitHub Actions Runner', this.runnerVersion));
    if (installDocker) {
      this.addComponent(WindowsComponents.docker(this, 'Docker'));
    }
  }

  private addBaseLinuxComponents(installDocker: boolean) {
    this.addComponent(LinuxUbuntuComponents.requiredPackages(this, 'Upgrade packages and install basics', this.architecture));
    this.addComponent(LinuxUbuntuComponents.runnerUser(this, 'User', this.architecture));
    this.addComponent(LinuxUbuntuComponents.awsCli(this, 'AWS CLI', this.architecture));
    this.addComponent(LinuxUbuntuComponents.githubCli(this, 'GitHub CLI', this.architecture));
    this.addComponent(LinuxUbuntuComponents.git(this, 'git', this.architecture));
    this.addComponent(LinuxUbuntuComponents.githubRunner(this, 'GitHub Actions Runner', this.runnerVersion, this.architecture));
    if (installDocker) {
      this.addComponent(LinuxUbuntuComponents.docker(this, 'Docker', this.architecture));
    }
  }

  /**
   * Add a component to be installed before any other components. Useful for required system settings like certificates or proxy settings.
   * @param component
   */
  prependComponent(component: ImageBuilderComponent) {
    if (this.boundAmi) {
      throw new Error('AMI is already bound. Use this method before passing the builder to a runner provider.');
    }
    if (component.platform != this.platform) {
      throw new Error('Component platform doesn\'t match builder platform');
    }
    this.components = [component].concat(this.components);
  }

  /**
   * Add a component to be installed.
   * @param component
   */
  addComponent(component: ImageBuilderComponent) {
    if (this.boundAmi) {
      throw new Error('AMI is already bound. Use this method before passing the builder to a runner provider.');
    }
    if (component.platform != this.platform) {
      throw new Error('Component platform doesn\'t match builder platform');
    }
    this.components.push(component);
  }

  /**
   * Add extra trusted certificates. This helps deal with self-signed certificates for GitHub Enterprise Server.
   *
   * @param path path to directory containing a file called certs.pem containing all the required certificates
   */
  public addExtraCertificates(path: string) {
    if (this.platform == 'Linux') {
      this.prependComponent(LinuxUbuntuComponents.extraCertificates(this, 'Extra Certs', path));
    } else if (this.platform == 'Windows') {
      this.prependComponent(WindowsComponents.extraCertificates(this, 'Extra Certs', path));
    } else {
      throw new Error(`Unknown platform: ${this.platform}`);
    }
  }

  /**
   * Called by IRunnerProvider to finalize settings and create the AMI builder.
   */
  bindAmi(): RunnerAmi {
    if (this.boundAmi) {
      return this.boundAmi;
    }

    const launchTemplate = new ec2.LaunchTemplate(this, 'Launch template', {
      requireImdsv2: true,
    });

    const stackName = cdk.Stack.of(this).stackName;
    const builderName = this.node.path;

    const dist = new imagebuilder.CfnDistributionConfiguration(this, 'Distribution', {
      name: uniqueImageBuilderName(this),
      description: this.description,
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
      platform: this.platform,
      components: this.components,
      architecture: this.architecture,
      baseAmi: defaultBaseAmi(this, this.os, this.architecture),
      tags: {
        'GitHubRunners:Stack': stackName,
        'GitHubRunners:Builder': builderName,
      },
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

    this.imageCleaner();

    return this.boundAmi;
  }

  private imageCleaner() {
    // the lambda no longer implements the schedule feature
    // this hasn't worked since https://github.com/CloudSnorkel/cdk-github-runners/pull/476
    cdk.Annotations.of(this).addWarning('The AMI cleaner for this deprecated class has been broken since v0.12.0 (PR #476) and will not delete any AMIs. Please manually delete old AMIs and upgrade to e.g. Ec2RunnerProvider.imageBuilder() instead of AmiBuilder.');

    // we keep the lambda itself around, in case the user doesn't have any other instances of it
    // if there are no other instances of it, the custom resource will be deleted with the original lambda source code which may delete the AMIs on its way out
    singletonLambda(DeleteResourcesFunction, this, 'delete-ami', {
      description: 'Delete old GitHub Runner AMIs (defunct)',
      timeout: cdk.Duration.minutes(5),
      logRetention: logs.RetentionDays.ONE_MONTH,
    });
  }

  bindDockerImage(): RunnerImage {
    throw new Error('AmiBuilder cannot be used to build Docker images');
  }
}
