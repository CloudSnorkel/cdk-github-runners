import * as cdk from 'aws-cdk-lib';
import {
  aws_codebuild as codebuild,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_iam as iam,
  aws_imagebuilder as imagebuilder,
  aws_logs as logs,
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

interface ComponentProperties {
  platform: 'Linux' | 'Windows';
  displayName: string;
  description: string;
  commands: string[];
}

class Component extends ImageBuilderObjectBase {
  public readonly arn: string;

  constructor(scope: Construct, id: string, props: ComponentProperties) {
    super(scope, id);

    const name = cdk.Names.uniqueResourceName(this, { maxLength: 126, separator: '-', allowedSpecialCharacters: '_-' });
    const data = {
      name: props.displayName,
      description: props.description,
      schemaVersion: '1.0',
      phases: [
        {
          name: 'build',
          steps: [
            {
              name: 'Run',
              action: props.platform === 'Linux' ? 'ExecuteBash' : 'ExecutePowerShell',
              inputs: {
                commands: props.commands,
              },
            },
          ],
        },
      ],
    };

    const component = new imagebuilder.CfnComponent(this, 'Component', {
      name: name,
      platform: props.platform,
      version: this.version('Component', name, {
        platform: props.platform,
        data,
      }),
      data: JSON.stringify(data),
    });

    this.arn = component.attrArn; /*this.getResourceArnAttribute(component.attrArn, {
      service: 'imagebuilder',
      resource: 'component',
      resourceName: `${this.physicalName}/`,
      arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
    });*/
  }
}

interface ContainerRecipeProperties {
  platform: 'Linux' | 'Windows';
  components: Component[];
  targetRepository: ecr.IRepository;
}

class ContainerRecipe extends ImageBuilderObjectBase {
  public readonly arn: string;

  constructor(scope: Construct, id: string, props: ContainerRecipeProperties) {
    super(scope, id);

    const name = cdk.Names.uniqueResourceName(this, { maxLength: 126, separator: '-', allowedSpecialCharacters: '_-' });

    let components = props.components.map(component => {
      return {
        componentArn: component.arn,
      };
    });

    const recipe = new imagebuilder.CfnContainerRecipe(this, 'Recipe', {
      name: name,
      version: this.version('ContainerRecipe', name, {
        // TODO parentImage, containerType and target repo? probably everything
        platform: props.platform,
        components,
      }),
      // TODO based on platform
      // TODO mcr.microsoft.com/windows/servercore:ltsc2019
      parentImage: 'arn:aws:imagebuilder:us-east-1:aws:image/windows-server-2019-x86-core-ltsc2019-amd64/2020.12.8',
      //parentImage: 'mcr.microsoft.com/windows/servercore:ltsc2019',
      // platformOverride: 'Windows', /* don't use when parentImage is from imagebuilder */
      components,
      containerType: 'DOCKER',
      targetRepository: {
        service: 'ECR',
        repositoryName: props.targetRepository.repositoryName,
      },
      // dockerfileTemplateUri: dockerfile.s3ObjectUrl, // TODO S3Deployment
      dockerfileTemplateData: dockerfileTemplate,
    });

    this.arn = recipe.attrArn; /*this.getResourceArnAttribute(component.attrArn, {
      service: 'imagebuilder',
      resource: 'component',
      resourceName: `${this.physicalName}/`,
      arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
    });*/
  }
}

export class ContainerImageBuilder extends Construct implements IImageBuilder {
  readonly architecture: Architecture;
  readonly os: Os;

  readonly repository: ecr.IRepository;
  readonly imageTag: string = 'latest';
  // private image: imagebuilder.CfnImage;

  constructor(scope: Construct, id: string, props?: ContainerImageBuilderProps) {
    super(scope, id);

    // set platform
    this.architecture = props?.architecture ?? Architecture.X86_64;
    this.os = props?.os ?? Os.LINUX;

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

    // TODO const uid: string = Names.uniqueId(myConstruct);

    // const parentImageAr = Stack.of(this).formatArn({
    //   service: 'imagebuilder',
    //   resource: 'aws:image',
    //   resourceName: 'ubuntu-server-18-lts-x86/2020.8.10',
    // });

    // `arn:aws:imagebuilder:${Stack.of(this).region}:aws:image/ubuntu-server-18-lts-x86/2020.8.10`

    // const dockerfile = new s3_assets.Asset(this, 'Dockerfile', {
    //   path: props?.dockerfilePath ?? '',
    // });

    // const recipeName = Names.uniqueId();

    const infra = this.infrastructure();

    const dist = new imagebuilder.CfnDistributionConfiguration(this, 'dist', {
      name: 'dist',
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

    // this.image = new imagebuilder.CfnImage(this, 'image-build', {
    //   infrastructureConfigurationArn: infra.attrArn,
    //   distributionConfigurationArn: dist.attrArn,
    //   containerRecipeArn: recipe.attrArn,
    // });

    const aws = new Component(this, 'AWS CLI', {
      platform: 'Windows',
      displayName: 'AWS CLI',
      description: 'Install latest version of AWS CLI',
      commands: [
        '$ErrorActionPreference = \'Stop\'',
        'Start-Process msiexec.exe -Wait -ArgumentList \'/i https://awscli.amazonaws.com/AWSCLIV2.msi /qn\'',
      ],
    });

    const gh = new Component(this, 'GitHub CLI', {
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
    });

    const git = new Component(this, 'git', {
      platform: 'Windows',
      displayName: 'Git',
      description: 'Install latest version of git', // TODO actual latest
      commands: [
        '$ErrorActionPreference = \'Stop\'',
        '$ProgressPreference = \'SilentlyContinue\'',
        'Invoke-WebRequest -UseBasicParsing -Uri https://github.com/git-for-windows/git/releases/download/v2.37.1.windows.1/Git-2.37.1-64-bit.exe -OutFile git-setup.exe',
        'Start-Process git-setup.exe -Wait -ArgumentList \'/VERYSILENT\'',
        'del git-setup.exe',
      ],
    });

    const runner = new Component(this, 'GitHub Actions Runner', {
      platform: 'Windows',
      displayName: 'GitHub Actions Runner',
      description: 'Install latest version of GitHub Actions Runner',
      commands: [
        '$ErrorActionPreference = \'Stop\'',
        'cmd /c curl -w "%{redirect_url}" -fsS https://github.com/actions/runner/releases/latest > $Env:TEMP\\latest-gha',
        '$LatestUrl = Get-Content $Env:TEMP\\latest-gha',
        '$RUNNER_VERSION = ($LatestUrl -Split \'/\')[-1].substring(1)', // TODO RUNNER_VERSION from env?
        '$ProgressPreference = \'SilentlyContinue\'',
        'Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-win-x64-${RUNNER_VERSION}.zip" -OutFile actions.zip',
        'Expand-Archive actions.zip -DestinationPath C:\\actions',
        'del actions.zip',
      ],
    });

    const recipe = new ContainerRecipe(this, 'Container Recipe', {
      platform: 'Windows',
      components: [aws, gh, git, runner],
      targetRepository: this.repository,
    });

    new imagebuilder.CfnImagePipeline(this, 'pipeline', {
      name: 'pipeline',
      containerRecipeArn: recipe.arn,
      infrastructureConfigurationArn: infra.attrArn,
      distributionConfigurationArn: dist.attrArn,
      // TODO does it build a new one on deploy?
      // schedule: {
      //   scheduleExpression: 'rate(7 days)',
      //   pipelineExecutionStartCondition: 'EXPRESSION_MATCH_ONLY',
      // },
    });
  }

  bind(): RunnerImage {
    return {
      imageRepository: this.repository,
      imageDigest: '', // this.image.attrImageUri, // TODO
      imageTag: 'latest', // TODO
      os: this.os,
      architecture: this.architecture,
    };
  }

  private infrastructure(): imagebuilder.CfnInfrastructureConfiguration {
    let uniquePrefix = cdk.Names.uniqueResourceName(this, { maxLength: 100, separator: '-', allowedSpecialCharacters: '_-' });
    return new imagebuilder.CfnInfrastructureConfiguration(this, 'Infrastructure', {
      name: `${uniquePrefix}-infrastructure`,
      instanceProfileName: new iam.CfnInstanceProfile(this, 'Instance Profile', {
        roles: [
          new iam.Role(this, 'Role', {
            assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
            managedPolicies: [
              iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
              iam.ManagedPolicy.fromAwsManagedPolicyName('EC2InstanceProfileForImageBuilderECRContainerBuilds'),
            ],
          }).roleName,
        ],
      }).ref,
    });
  }
}
