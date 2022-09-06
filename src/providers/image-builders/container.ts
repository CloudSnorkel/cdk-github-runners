import * as cdk from 'aws-cdk-lib';
import {
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_events as events,
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

export interface ImageBuilderComponentProperties {
  readonly platform: 'Linux' | 'Windows';
  readonly displayName: string;
  readonly description: string;
  readonly commands: string[];
}

export class ImageBuilderComponent extends ImageBuilderObjectBase {
  public readonly arn: string;

  constructor(scope: Construct, id: string, props: ImageBuilderComponentProperties) {
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

    this.arn = component.attrArn;
  }
}

interface ContainerRecipeProperties {
  readonly platform: 'Linux' | 'Windows';
  readonly components: ImageBuilderComponent[];
  readonly targetRepository: ecr.IRepository;
}

class ContainerRecipe extends ImageBuilderObjectBase {
  public readonly arn: string;
  public readonly name: string;

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
    this.name = recipe.attrName;
  }
}


// TODO certs

/**
 * TODO document
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
      ]
    } else {
      runnerCommands = [`$RUNNER_VERSION = '${this.runnerVersion.version}'`]
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

  addComponent(component: ImageBuilderComponent) {
    this.components.push(component);
  }

  bind(): RunnerImage {
    if (this.boundImage) {
      return this.boundImage;
    }

    const infra = this.infrastructure();

    const dist = new imagebuilder.CfnDistributionConfiguration(this, 'Distribution', {
      name: cdk.Names.uniqueResourceName(this, { maxLength: 126, separator: '-', allowedSpecialCharacters: '_-' }),
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
      platform:  this.platform,
      components: this.components,
      targetRepository: this.repository,
    });

    new logs.LogGroup(this, 'Log', {
      logGroupName: `/aws/imagebuilder/${recipe.name}`,
      retention: this.logRetention,
      removalPolicy: this.logRemovalPolicy,
    });

    const image = new imagebuilder.CfnImage(this, 'Image', {
      infrastructureConfigurationArn: infra.attrArn,
      distributionConfigurationArn: dist.attrArn,
      containerRecipeArn: recipe.arn,
    });

    let scheduleOptions: imagebuilder.CfnImagePipeline.ScheduleProperty | undefined;
    if (this.rebuildInterval.toDays() > 0) {
      scheduleOptions = {
        scheduleExpression: events.Schedule.rate(this.rebuildInterval).expressionString,
        pipelineExecutionStartCondition: 'EXPRESSION_MATCH_ONLY',
      }
    }
    new imagebuilder.CfnImagePipeline(this, 'Pipeline', {
      name: cdk.Names.uniqueResourceName(this, { maxLength: 100, separator: '-', allowedSpecialCharacters: '_-' }),
      description: this.description,
      containerRecipeArn: recipe.arn,
      infrastructureConfigurationArn: infra.attrArn,
      distributionConfigurationArn: dist.attrArn,
      schedule: scheduleOptions,
    });

    return {
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
    };
  }

  private infrastructure(): imagebuilder.CfnInfrastructureConfiguration {
    return new imagebuilder.CfnInfrastructureConfiguration(this, 'Infrastructure', {
      name: cdk.Names.uniqueResourceName(this, { maxLength: 126, separator: '-', allowedSpecialCharacters: '_-' }),
      description: this.description,
      subnetId: this.subnetId,
      securityGroupIds: this.securityGroupIds,
      instanceTypes: this.instanceTypes,
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
