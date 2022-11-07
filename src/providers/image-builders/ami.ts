import * as cdk from 'aws-cdk-lib';
import {
  aws_ec2 as ec2,
  aws_events as events,
  aws_iam as iam,
  aws_imagebuilder as imagebuilder,
  aws_logs as logs,
  aws_s3_assets as s3_assets,
  Duration,
  RemovalPolicy,
  Stack,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Architecture, IAmiBuilder, Os, RunnerAmi, RunnerVersion } from '../common';
import { ImageBuilderComponent, ImageBuilderObjectBase, uniqueImageBuilderName } from './common';
import { LinuxUbuntuComponents } from './linux-components';
import { WindowsComponents } from './windows-components';

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
   * Security Group to assign to launched builder instances.
   *
   * @default default account security group
   */
  readonly securityGroup?: ec2.ISecurityGroup;

  /**
   * Where to place the network interfaces within the VPC.
   *
   * @default default VPC subnet
   */
  readonly subnetSelection?: ec2.SubnetSelection;

  /**
   * The instance type used to build the image.
   *
   * @default m5.large
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
}

/**
 * Properties for AmiRecipe construct.
 */
interface AmiRecipeProperties {
  /**
   * Target platform. Must match builder platform.
   */
  readonly platform: 'Linux' | 'Windows';

  /**
   * Target architecture. Must match builder platform.
   */
  readonly architecture: Architecture;

  /**
   * Components to add to target container image.
   */
  readonly components: ImageBuilderComponent[];
}

/**
 * Image builder recipe for Amazon Machine Image (AMI).
 */
class AmiRecipe extends ImageBuilderObjectBase {
  public readonly arn: string;
  public readonly name: string;

  constructor(scope: Construct, id: string, props: AmiRecipeProperties) {
    super(scope, id);

    const name = uniqueImageBuilderName(this);

    let components = props.components.map(component => {
      return {
        componentArn: component.arn,
      };
    });

    let parentAmi;
    let workingDirectory;
    if (props.platform == 'Linux') {
      let archUrl;
      if (props.architecture.is(Architecture.X86_64)) {
        archUrl = 'amd64';
      } else if (props.architecture.is(Architecture.ARM64)) {
        archUrl = 'arm64';
      } else {
        throw new Error(`Unsupported architecture for parent AMI: ${props.architecture.name}`);
      }
      parentAmi = ec2.MachineImage.fromSsmParameter(
        `/aws/service/canonical/ubuntu/server/focal/stable/current/${archUrl}/hvm/ebs-gp2/ami-id`,
        {
          os: ec2.OperatingSystemType.LINUX,
        },
      ).getImage(this).imageId;
      workingDirectory = '/home/runner';
    } else if (props.platform == 'Windows') {
      parentAmi = ec2.MachineImage.latestWindows(ec2.WindowsVersion.WINDOWS_SERVER_2022_ENGLISH_FULL_CONTAINERSLATEST).getImage(this).imageId;
      workingDirectory = 'C:/'; // must exist or Image Builder fails and must not be empty or git will stall installing from the default windows\system32
    } else {
      throw new Error(`Unsupported AMI recipe platform: ${props.platform}`);
    }

    const recipe = new imagebuilder.CfnImageRecipe(this, 'Recipe', {
      name: name,
      version: this.version('ImageRecipe', name, {
        platform: props.platform,
        components,
      }),
      parentImage: parentAmi,
      components,
      workingDirectory,
    });

    this.arn = recipe.attrArn;
    this.name = name;
  }
}

/**
 * An AMI builder that uses AWS Image Builder to build AMIs pre-baked with all the GitHub Actions runner requirements. Builders can be used with {@link Ec2Runner}.
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
 *     'set -ex',
 *     'apt-get install p7zip',
 *   ],
 * }));
 * new Ec2Runner(this, 'EC2 provider', {
 *     label: 'custom-ec2',
 *     amiBuilder: builder,
 * });
 * ```
 */
export class AmiBuilder extends Construct implements IAmiBuilder {
  private readonly architecture: Architecture;
  private readonly os: Os;
  private readonly platform: 'Windows' | 'Linux';

  private readonly description: string;

  private readonly runnerVersion: RunnerVersion;

  private components: ImageBuilderComponent[] = [];
  private boundAmi?: RunnerAmi;

  private readonly subnetId: string | undefined;
  private readonly securityGroupIds: string[] | undefined;
  private readonly instanceType: ec2.InstanceType;
  private readonly rebuildInterval: Duration;
  private readonly logRetention: logs.RetentionDays;
  private readonly logRemovalPolicy: cdk.RemovalPolicy;

  constructor(scope: Construct, id: string, props?: AmiBuilderProps) {
    super(scope, id);

    // set platform
    this.architecture = props?.architecture ?? Architecture.X86_64;
    if (!this.architecture.is(Architecture.X86_64) && !this.architecture.is(Architecture.ARM64)) {
      throw new Error(`Unsupported architecture: ${this.architecture.name}. Consider CodeBuild for faster image builds.`);
    }

    this.os = props?.os ?? Os.LINUX;
    if (this.os.is(Os.WINDOWS)) {
      this.platform = 'Windows';
    } else if (this.os.is(Os.LINUX)) {
      this.platform = 'Linux';
    } else {
      throw new Error(`Unsupported OS: ${this.os.name}.`);
    }

    // set builder options
    this.rebuildInterval = props?.rebuildInterval ?? Duration.days(7);
    if (props?.vpc && props?.subnetSelection) {
      this.subnetId = props.vpc.selectSubnets(props.subnetSelection).subnetIds[0];
    }

    if (props?.securityGroup) {
      this.securityGroupIds = [props.securityGroup.securityGroupId];
    }

    this.instanceType = props?.instanceType ?? ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.LARGE);
    if (!this.architecture.instanceTypeMatch(this.instanceType)) {
      throw new Error(`Builder architecture (${this.architecture.name}) doesn't match selected instance type (${this.instanceType} / ${this.instanceType.architecture})`);
    }

    this.description = `Build AMI for GitHub Actions runner ${this.node.path} (${this.os.name}/${this.architecture.name})`;

    this.logRetention = props?.logRetention ?? logs.RetentionDays.ONE_MONTH;
    this.logRemovalPolicy = props?.logRemovalPolicy ?? RemovalPolicy.DESTROY;

    // runner version
    this.runnerVersion = props?.runnerVersion ?? RunnerVersion.latest();

    // add all basic components
    if (this.os.is(Os.WINDOWS)) {
      this.addBaseWindowsComponents();
    } else if (this.os.is(Os.LINUX)) {
      this.addBaseLinuxComponents();
    }
  }

  private addBaseWindowsComponents() {
    this.addComponent(WindowsComponents.cloudwatchAgent(this, 'CloudWatch agent'));
    this.addComponent(WindowsComponents.awsCli(this, 'AWS CLI'));
    this.addComponent(WindowsComponents.githubCli(this, 'GitHub CLI'));
    this.addComponent(WindowsComponents.git(this, 'git'));
    this.addComponent(WindowsComponents.githubRunner(this, 'GitHub Actions Runner', this.runnerVersion));
    this.addComponent(WindowsComponents.docker(this, 'Docker'));
  }

  private addBaseLinuxComponents() {
    this.addComponent(LinuxUbuntuComponents.requiredPackages(this, 'Upgrade packages and install basics', this.architecture));
    this.addComponent(LinuxUbuntuComponents.runnerUser(this, 'User', this.architecture));
    this.addComponent(LinuxUbuntuComponents.awsCli(this, 'AWS CLI', this.architecture));
    this.addComponent(LinuxUbuntuComponents.githubCli(this, 'GitHub CLI', this.architecture));
    this.addComponent(LinuxUbuntuComponents.git(this, 'git', this.architecture));
    this.addComponent(LinuxUbuntuComponents.githubRunner(this, 'GitHub Actions Runner', this.runnerVersion, this.architecture));
    this.addComponent(LinuxUbuntuComponents.docker(this, 'Docker', this.architecture));
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
   * All first party Dockerfiles support this. Others may not.
   *
   * @param path path to directory containing a file called certs.pem containing all the required certificates
   */
  public addExtraCertificates(path: string) {
    this.prependComponent(new ImageBuilderComponent(this, 'Extra Certs', {
      platform: this.platform,
      displayName: 'GitHub Actions Runner',
      description: 'Install latest version of GitHub Actions Runner',
      commands: [
        '$ErrorActionPreference = \'Stop\'',
        'Import-Certificate -FilePath certs\\certs.pem -CertStoreLocation Cert:\\LocalMachine\\Root',
      ],
      assets: [
        {
          path: 'certs',
          asset: new s3_assets.Asset(this, 'Extra Certs Asset', { path }),
        },
      ],
    }));
  }

  /**
   * Called by IRunnerProvider to finalize settings and create the AMIR builder.
   */
  bind(): RunnerAmi {
    if (this.boundAmi) {
      return this.boundAmi;
    }

    const infra = this.infrastructure();

    const launchTemplate = new ec2.LaunchTemplate(this, 'Launch template');

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
              'Name': this.node.path,
              'GitHubRunners:Builder': this.node.path,
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
    });

    const log = new logs.LogGroup(this, 'Log', {
      logGroupName: `/aws/imagebuilder/${recipe.name}`,
      retention: this.logRetention,
      removalPolicy: this.logRemovalPolicy,
    });

    const image = new imagebuilder.CfnImage(this, 'Image', {
      infrastructureConfigurationArn: infra.attrArn,
      distributionConfigurationArn: dist.attrArn,
      imageRecipeArn: recipe.arn,
      imageTestsConfiguration: {
        imageTestsEnabled: false,
      },
    });
    image.node.addDependency(infra);
    image.node.addDependency(log);

    // TODO this.imageCleaner(image, recipe.name);

    let scheduleOptions: imagebuilder.CfnImagePipeline.ScheduleProperty | undefined;
    if (this.rebuildInterval.toDays() > 0) {
      scheduleOptions = {
        scheduleExpression: events.Schedule.rate(this.rebuildInterval).expressionString,
        pipelineExecutionStartCondition: 'EXPRESSION_MATCH_ONLY',
      };
    }
    const pipeline = new imagebuilder.CfnImagePipeline(this, 'Pipeline', {
      name: uniqueImageBuilderName(this),
      description: this.description,
      imageRecipeArn: recipe.arn,
      infrastructureConfigurationArn: infra.attrArn,
      distributionConfigurationArn: dist.attrArn,
      schedule: scheduleOptions,
      imageTestsConfiguration: {
        imageTestsEnabled: false,
      },
    });
    pipeline.node.addDependency(infra);
    pipeline.node.addDependency(log);

    this.boundAmi = {
      launchTemplate: launchTemplate,
      architecture: this.architecture,
      os: this.os,
      logGroup: log,
      runnerVersion: this.runnerVersion,
    };

    return this.boundAmi;
  }

  private infrastructure(): imagebuilder.CfnInfrastructureConfiguration {
    let role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('EC2InstanceProfileForImageBuilder'),
      ],
    });

    for (const component of this.components) {
      component.grantAssetsRead(role);
    }

    return new imagebuilder.CfnInfrastructureConfiguration(this, 'Infrastructure', {
      name: uniqueImageBuilderName(this),
      description: this.description,
      subnetId: this.subnetId,
      securityGroupIds: this.securityGroupIds,
      instanceTypes: [this.instanceType.toString()],
      instanceProfileName: new iam.CfnInstanceProfile(this, 'Instance Profile', {
        roles: [
          role.roleName,
        ],
      }).ref,
    });
  }
}
