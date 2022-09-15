import * as cdk from 'aws-cdk-lib';
import {
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_events as events,
  aws_iam as iam,
  aws_imagebuilder as imagebuilder,
  aws_logs as logs,
  aws_s3_assets as s3_assets,
  CustomResource,
  Duration,
  RemovalPolicy,
  Stack,
} from 'aws-cdk-lib';
import { TagMutability, TagStatus } from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';
import { BundledNodejsFunction } from '../../utils';
import { Architecture, IImageBuilder, Os, RunnerImage, RunnerVersion } from '../common';

const dockerfileTemplate = `FROM {{{ imagebuilder:parentImage }}}
{{{ imagebuilder:environments }}}
{{{ imagebuilder:components }}}`;

/**
 * Properties for ContainerImageBuilder construct.
 */
export interface ContainerImageBuilderProps {
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
   * Schedule the image to be rebuilt every given interval. Useful for keeping the image up-do-date with the latest GitHub runner version and latest OS updates.
   *
   * Set to zero to disable.
   *
   * @default Duration.days(7)
   */
  readonly rebuildInterval?: Duration;

  /**
   * VPC to launch the runners in.
   *
   * @default default account VPC
   */
  readonly vpc?: ec2.IVpc;

  /**
   * Security Group to assign to this instance.
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
   * Removal policy for logs of image builds. If deployment fails on the custom resource, try setting this to `RemovalPolicy.RETAIN`. This way the CodeBuild logs can still be viewed, and you can see why the build failed.
   *
   * We try to not leave anything behind when removed. But sometimes a log staying behind is useful.
   *
   * @default RemovalPolicy.DESTROY
   */
  readonly logRemovalPolicy?: RemovalPolicy;
}

function uniqueName(scope: Construct): string {
  return cdk.Names.uniqueResourceName(scope, { maxLength: 126, separator: '-', allowedSpecialCharacters: '_-' });
}

abstract class ImageBuilderObjectBase extends cdk.Resource {
  protected constructor(scope: Construct, id: string) {
    super(scope, id);
  }

  protected version(type: 'Component' | 'ImageRecipe' | 'ContainerRecipe', name: string, data: any): string {
    return new CustomResource(this, 'Version', {
      serviceToken: this.versionFunction().functionArn,
      resourceType: `Custom::ImageBuilder-${type}-Version`,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // no point in deleting as it doesn't even create anything
      properties: {
        ObjectType: type,
        ObjectName: name,
        VersionedData: data, // get a new version every time something changes, like Image Builder wants
      },
    }).ref;
  }

  private versionFunction(): BundledNodejsFunction {
    return BundledNodejsFunction.singleton(this, 'aws-image-builder-versioner', {
      description: 'Custom resource handler that bumps up Image Builder versions',
      initialPolicy: [
        new iam.PolicyStatement({
          actions: [
            'imagebuilder:ListComponents',
            'imagebuilder:ListContainerRecipes',
            'imagebuilder:ListImageRecipes',
          ],
          resources: ['*'],
        }),
      ],
    });
  }
}

/**
 * An asset including file or directory to place inside the built image.
 */
export interface ImageBuilderAsset {
  /**
   * Path to place asset in the image.
   */
  readonly path: string;

  /**
   * Asset to place in the image.
   */
  readonly asset: s3_assets.Asset;
}

/**
 * Properties for ImageBuilderComponent construct.
 */
export interface ImageBuilderComponentProperties {
  /**
   * Component platform. Must match the builder platform.
   */
  readonly platform: 'Linux' | 'Windows';

  /**
   * Component display name.
   */
  readonly displayName: string;

  /**
   * Component description.
   */
  readonly description: string;

  /**
   * Shell commands to run when adding this component to the image.
   *
   * On Linux, these are bash commands. On Windows, there are PowerShell commands.
   */
  readonly commands: string[];

  /**
   * Optional assets to add to the built image.
   */
  readonly assets?: ImageBuilderAsset[];
}

/**
 * Components are a set of commands to run and optional files to add to an image. Components are the building blocks of images built by Image Builder.
 *
 * Example:
 *
 * ```
 * new ImageBuilderComponent(this, 'AWS CLI', {
 *   platform: 'Windows',
 *   displayName: 'AWS CLI',
 *   description: 'Install latest version of AWS CLI',
 *   commands: [
 *     '$ErrorActionPreference = \'Stop\'',
 *     'Start-Process msiexec.exe -Wait -ArgumentList \'/i https://awscli.amazonaws.com/AWSCLIV2.msi /qn\'',
 *   ],
 * }
 * ```
 */
export class ImageBuilderComponent extends ImageBuilderObjectBase {
  /**
   * Component ARN.
   */
  public readonly arn: string;

  /**
   * Supported platform for the component.
   */
  public readonly platform: 'Windows' | 'Linux';

  private readonly assets: s3_assets.Asset[] = [];

  constructor(scope: Construct, id: string, props: ImageBuilderComponentProperties) {
    super(scope, id);

    this.platform = props.platform;

    let steps: any[] = [];

    if (props.assets) {
      let inputs: any[] = [];
      let extractCommands: string[] = [];
      for (const asset of props.assets) {
        this.assets.push(asset.asset);

        if (asset.asset.isFile) {
          inputs.push({
            source: asset.asset.s3ObjectUrl,
            destination: asset.path,
          });
        } else if (asset.asset.isZipArchive) {
          inputs.push({
            source: asset.asset.s3ObjectUrl,
            destination: `${asset.path}.zip`,
          });
          if (props.platform === 'Windows') {
            extractCommands.push('$ErrorActionPreference = \'Stop\'');
            extractCommands.push(`Expand-Archive "${asset.path}.zip" -DestinationPath "${asset.path}"`);
            extractCommands.push(`del "${asset.path}.zip"`);
          } else {
            extractCommands.push(`unzip "${asset.path}.zip" -d "${asset.path}"`);
            extractCommands.push(`rm "${asset.path}.zip"`);
          }
        } else {
          throw new Error(`Unknown asset type: ${asset.asset}`);
        }
      }

      steps.push({
        name: 'Download',
        action: 'S3Download',
        inputs,
      });

      if (extractCommands.length > 0) {
        steps.push({
          name: 'Extract',
          action: props.platform === 'Linux' ? 'ExecuteBash' : 'ExecutePowerShell',
          inputs: {
            commands: extractCommands,
          },
        });
      }
    }

    steps.push({
      name: 'Run',
      action: props.platform === 'Linux' ? 'ExecuteBash' : 'ExecutePowerShell',
      inputs: {
        commands: props.commands,
      },
    });

    const data = {
      name: props.displayName,
      description: props.description,
      schemaVersion: '1.0',
      phases: [
        {
          name: 'build',
          steps,
        },
      ],
    };

    const name = uniqueName(this);
    const component = new imagebuilder.CfnComponent(this, 'Component', {
      name: name,
      platform: props.platform,
      version: this.version('Component', name, {
        platform: props.platform,
        data,
      }),
      data: JSON.stringify(data),
    });

    this.arn = component.attrArn;
  }

  /**
   * Grants read permissions to the principal on the assets buckets.
   *
   * @param grantee
   */
  grantAssetsRead(grantee: iam.IGrantable) {
    for (const asset of this.assets) {
      asset.grantRead(grantee);
    }
  }
}

/**
 * Properties for ContainerRecipe construct.
 */
interface ContainerRecipeProperties {
  /**
   * Target platform. Must match builder platform.
   */
  readonly platform: 'Linux' | 'Windows';

  /**
   * Components to add to target container image.
   */
  readonly components: ImageBuilderComponent[];

  /**
   * ECR repository where resulting conatiner image will be uploaded.
   */
  readonly targetRepository: ecr.IRepository;
}

/**
 * Image builder recipe for a Docker container image.
 */
class ContainerRecipe extends ImageBuilderObjectBase {
  public readonly arn: string;
  public readonly name: string;

  constructor(scope: Construct, id: string, props: ContainerRecipeProperties) {
    super(scope, id);

    const name = uniqueName(this);

    let components = props.components.map(component => {
      return {
        componentArn: component.arn,
      };
    });

    const recipe = new imagebuilder.CfnContainerRecipe(this, 'Recipe', {
      name: name,
      version: this.version('ContainerRecipe', name, {
        platform: props.platform,
        components,
      }),
      // TODO mcr.microsoft.com/windows/servercore:ltsc2019
      parentImage: 'arn:aws:imagebuilder:us-east-1:aws:image/windows-server-2019-x86-core-ltsc2019-amd64/2020.12.8',
      components,
      containerType: 'DOCKER',
      targetRepository: {
        service: 'ECR',
        repositoryName: props.targetRepository.repositoryName,
      },
      dockerfileTemplateData: dockerfileTemplate,
    });

    this.arn = recipe.attrArn;
    this.name = name;
  }
}

/**
 * An image builder that uses Image Builder to build Docker images pre-baked with all the GitHub Actions runner requirements. Builders can be used with runner providers.
 *
 * The CodeBuild builder is better and faster. Only use this one if you have no choice. For example, if you need Windows containers.
 *
 * Each builder re-runs automatically at a set interval to make sure the images contain the latest versions of everything.
 *
 * You can create an instance of this construct to customize the image used to spin-up runners. Some runner providers may require custom components. Check the runner provider documentation. The default components work with CodeBuild and Fargate.
 *
 * For example, to set a specific runner version, rebuild the image every 2 weeks, and add a few packages for the Fargate provider, use:
 *
 * ```
 * const builder = new ContainerImageBuilder(this, 'Builder', {
 *     runnerVersion: RunnerVersion.specific('2.293.0'),
 *     rebuildInterval: Duration.days(14),
 * });
 * new CodeBuildRunner(this, 'CodeBuild provider', {
 *     label: 'windows-codebuild',
 *     imageBuilder: builder,
 * });
 * ```
 */
export class ContainerImageBuilder extends Construct implements IImageBuilder {
  readonly architecture: Architecture;
  readonly os: Os;
  readonly platform: 'Windows' | 'Linux';

  readonly description: string;

  readonly runnerVersion: RunnerVersion;

  readonly repository: ecr.IRepository;
  private components: ImageBuilderComponent[] = [];
  private boundImage?: RunnerImage;

  readonly subnetId: string | undefined;
  readonly securityGroupIds: string[] | undefined;
  readonly instanceTypes: string[];
  readonly rebuildInterval: Duration;
  readonly logRetention: logs.RetentionDays;
  readonly logRemovalPolicy: cdk.RemovalPolicy;

  constructor(scope: Construct, id: string, props?: ContainerImageBuilderProps) {
    super(scope, id);

    // set platform
    this.architecture = props?.architecture ?? Architecture.X86_64;
    if (!this.architecture.is(Architecture.X86_64)) {
      throw new Error(`Unsupported architecture: ${this.architecture}. Consider CodeBuild for faster image builds.`);
    }

    this.os = props?.os ?? Os.LINUX;
    if (this.os.is(Os.WINDOWS)) {
      this.platform = 'Windows';
    } else {
      throw new Error(`Unsupported OS: ${this.os}. Consider CodeBuild for faster image builds.`);
    }

    // set builder options
    this.rebuildInterval = props?.rebuildInterval ?? Duration.days(7);
    if (props?.vpc && props?.subnetSelection) {
      this.subnetId = props.vpc.selectSubnets(props.subnetSelection).subnetIds[0];
    }

    if (props?.securityGroup) {
      this.securityGroupIds = [props.securityGroup.securityGroupId];
    }

    this.instanceTypes = [props?.instanceType?.toString() ?? 'm5.large'];

    this.description = `Build image for GitHub Actions runner ${this.node.path} (${this.os.name}/${this.architecture.name})`;

    this.logRetention = props?.logRetention ?? logs.RetentionDays.ONE_MONTH;
    this.logRemovalPolicy = props?.logRemovalPolicy ?? RemovalPolicy.DESTROY;

    // runner version
    this.runnerVersion = props?.runnerVersion ?? RunnerVersion.latest();

    // create repository that only keeps one tag
    this.repository = new ecr.Repository(this, 'Repository', {
      imageScanOnPush: true,
      imageTagMutability: TagMutability.MUTABLE,
      removalPolicy: RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          description: 'Remove all but the latest image',
          tagStatus: TagStatus.ANY,
          maxImageCount: 1,
        },
      ],
    });

    // add all basic components
    this.addBaseWindowsComponents();
  }

  private addBaseWindowsComponents() {
    this.addComponent(new ImageBuilderComponent(this, 'AWS CLI', {
      platform: 'Windows',
      displayName: 'AWS CLI',
      description: 'Install latest version of AWS CLI',
      commands: [
        '$ErrorActionPreference = \'Stop\'',
        'Start-Process msiexec.exe -Wait -ArgumentList \'/i https://awscli.amazonaws.com/AWSCLIV2.msi /qn\'',
      ],
    }));

    this.addComponent(new ImageBuilderComponent(this, 'GitHub CLI', {
      platform: 'Windows',
      displayName: 'GitHub CLI',
      description: 'Install latest version of gh',
      commands: [
        '$ErrorActionPreference = \'Stop\'',
        'cmd /c curl -w "%{redirect_url}" -fsS https://github.com/cli/cli/releases/latest > $Env:TEMP\\latest-gh',
        '$LatestUrl = Get-Content $Env:TEMP\\latest-gh',
        '$GH_VERSION = ($LatestUrl -Split \'/\')[-1].substring(1)',
        '$ProgressPreference = \'SilentlyContinue\'',
        'Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_windows_amd64.msi" -OutFile gh.msi',
        'Start-Process msiexec.exe -Wait -ArgumentList \'/i gh.msi /qn\'',
        'del gh.msi',
      ],
    }));

    this.addComponent(new ImageBuilderComponent(this, 'git', {
      platform: 'Windows',
      displayName: 'Git',
      description: 'Install latest version of git',
      commands: [
        '$ErrorActionPreference = \'Stop\'',
        '$ProgressPreference = \'SilentlyContinue\'',
        'cmd /c curl -w "%{redirect_url}" -fsS https://github.com/git-for-windows/git/releases/latest > $Env:TEMP\\latest-git',
        '$LatestUrl = Get-Content $Env:TEMP\\latest-git',
        '$GIT_VERSION = ($LatestUrl -Split \'/\')[-1].substring(1)',
        '$GIT_VERSION_SHORT = ($GIT_VERSION -Split \'.windows.\')[0]',
        'Invoke-WebRequest -UseBasicParsing -Uri https://github.com/git-for-windows/git/releases/download/v${GIT_VERSION}/Git-${GIT_VERSION_SHORT}-64-bit.exe -OutFile git-setup.exe',
        'Start-Process git-setup.exe -Wait -ArgumentList \'/VERYSILENT\'',
        'del git-setup.exe',
      ],
    }));

    let runnerCommands: string[];
    if (this.runnerVersion.version == RunnerVersion.latest().version) {
      runnerCommands = [
        'cmd /c curl -w "%{redirect_url}" -fsS https://github.com/actions/runner/releases/latest > $Env:TEMP\\latest-gha',
        '$LatestUrl = Get-Content $Env:TEMP\\latest-gha',
        '$RUNNER_VERSION = ($LatestUrl -Split \'/\')[-1].substring(1)',
      ];
    } else {
      runnerCommands = [`$RUNNER_VERSION = '${this.runnerVersion.version}'`];
    }

    this.addComponent(new ImageBuilderComponent(this, 'GitHub Actions Runner', {
      platform: 'Windows',
      displayName: 'GitHub Actions Runner',
      description: 'Install latest version of GitHub Actions Runner',
      commands: [
        '$ErrorActionPreference = \'Stop\'',
        '$ProgressPreference = \'SilentlyContinue\'',
      ].concat(runnerCommands, [
        'Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-win-x64-${RUNNER_VERSION}.zip" -OutFile actions.zip',
        'Expand-Archive actions.zip -DestinationPath C:\\actions',
        'del actions.zip',
      ]),
    }));
  }

  /**
   * Add a component to be installed before any other components. Useful for required system settings like certificates or proxy settings.
   * @param component
   */
  prependComponent(component: ImageBuilderComponent) {
    if (this.boundImage) {
      throw new Error('Image is already bound. Use this method before passing the builder to a runner provider.');
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
    if (this.boundImage) {
      throw new Error('Image is already bound. Use this method before passing the builder to a runner provider.');
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
   * Called by IRunnerProvider to finalize settings and create the image builder.
   */
  bind(): RunnerImage {
    if (this.boundImage) {
      return this.boundImage;
    }

    const infra = this.infrastructure();

    const dist = new imagebuilder.CfnDistributionConfiguration(this, 'Distribution', {
      name: uniqueName(this),
      description: this.description,
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

    const recipe = new ContainerRecipe(this, 'Container Recipe', {
      platform: this.platform,
      components: this.components,
      targetRepository: this.repository,
    });

    const log = new logs.LogGroup(this, 'Log', {
      logGroupName: `/aws/imagebuilder/${recipe.name}`,
      retention: this.logRetention,
      removalPolicy: this.logRemovalPolicy,
    });

    const image = new imagebuilder.CfnImage(this, 'Image', {
      infrastructureConfigurationArn: infra.attrArn,
      distributionConfigurationArn: dist.attrArn,
      containerRecipeArn: recipe.arn,
    });
    image.node.addDependency(log);

    this.imageCleaner(image, recipe.name);

    let scheduleOptions: imagebuilder.CfnImagePipeline.ScheduleProperty | undefined;
    if (this.rebuildInterval.toDays() > 0) {
      scheduleOptions = {
        scheduleExpression: events.Schedule.rate(this.rebuildInterval).expressionString,
        pipelineExecutionStartCondition: 'EXPRESSION_MATCH_ONLY',
      };
    }
    const pipeline = new imagebuilder.CfnImagePipeline(this, 'Pipeline', {
      name: uniqueName(this),
      description: this.description,
      containerRecipeArn: recipe.arn,
      infrastructureConfigurationArn: infra.attrArn,
      distributionConfigurationArn: dist.attrArn,
      schedule: scheduleOptions,
    });
    pipeline.node.addDependency(log);

    this.boundImage = {
      // There are simpler ways to get the ARN, but we want an image object that depends on the newly built image.
      // We want whoever is using this image to automatically wait for Image Builder to finish building before using the image.
      imageRepository: ecr.Repository.fromRepositoryName(
        this, 'Dependable Image',
        // we can't use image.attrName because it comes up with upper case
        cdk.Fn.split(':', cdk.Fn.split('/', image.attrImageUri, 2)[1], 2)[0],
      ),
      imageTag: cdk.Fn.split(':', image.attrImageUri, 2)[1],
      os: this.os,
      architecture: this.architecture,
      logGroup: log,
    };

    return this.boundImage;
  }

  private infrastructure(): imagebuilder.CfnInfrastructureConfiguration {
    let role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('EC2InstanceProfileForImageBuilderECRContainerBuilds'),
      ],
    });

    for (const component of this.components) {
      component.grantAssetsRead(role);
    }

    return new imagebuilder.CfnInfrastructureConfiguration(this, 'Infrastructure', {
      name: uniqueName(this),
      description: this.description,
      subnetId: this.subnetId,
      securityGroupIds: this.securityGroupIds,
      instanceTypes: this.instanceTypes,
      instanceProfileName: new iam.CfnInstanceProfile(this, 'Instance Profile', {
        roles: [
          role.roleName,
        ],
      }).ref,
    });
  }

  private imageCleaner(image: imagebuilder.CfnImage, recipeName: string) {
    const crHandler = BundledNodejsFunction.singleton(this, 'build-image', {
      description: 'Custom resource handler that triggers CodeBuild to build runner images, and cleans-up images on deletion',
      timeout: cdk.Duration.minutes(3),
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
}
