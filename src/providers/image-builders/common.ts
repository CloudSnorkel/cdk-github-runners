import * as cdk from 'aws-cdk-lib';
import {
  aws_ec2 as ec2,
  aws_events as events,
  aws_iam as iam,
  aws_imagebuilder as imagebuilder,
  aws_logs as logs,
  aws_s3_assets as s3_assets,
  CustomResource,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { IRunnerImageBuilder } from './ng';
import { AwsImageBuilderVersionerFunction } from '../../lambdas/aws-image-builder-versioner-function';
import { singletonLambda } from '../../utils';
import { Architecture, Os, RunnerAmi, RunnerImage, RunnerVersion } from '../common';

/**
 * @internal
 */
export function uniqueImageBuilderName(scope: Construct): string {
  return cdk.Names.uniqueResourceName(scope, {
    maxLength: 126,
    separator: '-',
    allowedSpecialCharacters: '_-',
  });
}

/**
 * @internal
 */
export abstract class ImageBuilderObjectBase extends cdk.Resource {
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

  private versionFunction(): AwsImageBuilderVersionerFunction {
    return singletonLambda(AwsImageBuilderVersionerFunction, this, 'aws-image-builder-versioner', {
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
      logRetention: logs.RetentionDays.ONE_MONTH,
      timeout: cdk.Duration.minutes(5),
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
 *
 * @deprecated Use `RunnerImageComponent` instead.
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
            commands: this.prefixCommandsWithErrorHandling(props.platform, extractCommands),
          },
        });
      }
    }

    if (props.commands.length > 0) {
      steps.push({
        name: 'Run',
        action: props.platform === 'Linux' ? 'ExecuteBash' : 'ExecutePowerShell',
        inputs: {
          commands: this.prefixCommandsWithErrorHandling(props.platform, props.commands),
        },
      });
    }

    const data = {
      name: props.displayName,
      schemaVersion: '1.0',
      phases: [
        {
          name: 'build',
          steps,
        },
      ],
    };

    const name = uniqueImageBuilderName(this);
    const component = new imagebuilder.CfnComponent(this, 'Component', {
      name: name,
      description: props.description,
      platform: props.platform,
      version: this.version('Component', name, {
        platform: props.platform,
        data,
        description: props.description,
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

  prefixCommandsWithErrorHandling(platform: 'Windows' | 'Linux', commands: string[]) {
    if (platform == 'Windows') {
      return [
        '$ErrorActionPreference = \'Stop\'',
        '$ProgressPreference = \'SilentlyContinue\'',
      ].concat(commands);
    } else {
      return [
        'set -ex',
      ].concat(commands);
    }
  }
}

/**
 * @internal
 */
export interface ImageBuilderBaseProps {
  /**
   * Image architecture.
   *
   * @default Architecture.X86_64
   */
  readonly architecture?: Architecture;

  /**
   * List of supported architectures to be checked against {@link architecture}.
   */
  readonly supportedArchitectures: Architecture[];

  /**
   * Image OS.
   *
   * @default OS.LINUX
   */
  readonly os?: Os;

  /**
   * List of supported OS to be checked against {@link os}.
   */
  readonly supportedOs: Os[];

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
   * Security groups to assign to launched builder instances.
   *
   * @default new security group
   */
  readonly securityGroups?: ec2.ISecurityGroup[];

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

  /**
   * Pipeline and infrastructure description.
   */
  readonly imageTypeName: string;
}

/**
 * @internal
 */
export abstract class ImageBuilderBase extends Construct implements IRunnerImageBuilder {
  protected readonly architecture: Architecture;
  protected readonly os: Os;
  protected readonly platform: 'Windows' | 'Linux';

  protected readonly description: string;

  protected readonly runnerVersion: RunnerVersion;

  protected components: ImageBuilderComponent[] = [];

  private readonly vpc: ec2.IVpc;
  private readonly subnetId: string | undefined;
  private readonly securityGroups: ec2.ISecurityGroup[];
  private readonly instanceType: ec2.InstanceType;

  private readonly rebuildInterval: Duration;
  private readonly logRetention: logs.RetentionDays;
  private readonly logRemovalPolicy: cdk.RemovalPolicy;

  protected constructor(scope: Construct, id: string, props: ImageBuilderBaseProps) {
    super(scope, id);

    // arch
    this.architecture = props?.architecture ?? Architecture.X86_64;
    if (!this.architecture.isIn(props.supportedArchitectures)) {
      throw new Error(`Unsupported architecture: ${this.architecture.name}. Consider CodeBuild for faster image builds.`);
    }

    // os
    this.os = props?.os ?? Os.LINUX;
    if (!this.os.isIn(props.supportedOs)) {
      throw new Error(`Unsupported OS: ${this.os.name}.`);
    }

    // platform
    if (this.os.is(Os.WINDOWS)) {
      this.platform = 'Windows';
    } else if (this.os.is(Os.LINUX)) {
      this.platform = 'Linux';
    } else {
      throw new Error(`Unsupported OS: ${this.os.name}.`);
    }

    // builder options
    this.rebuildInterval = props?.rebuildInterval ?? Duration.days(7);

    // vpc settings
    if (props?.vpc) {
      this.vpc = props.vpc;
      this.subnetId = props.vpc.selectSubnets(props.subnetSelection).subnetIds[0];
    } else {
      this.vpc = ec2.Vpc.fromLookup(this, 'Default VPC', { isDefault: true });
    }

    if (props?.securityGroups) {
      this.securityGroups = props.securityGroups;
    } else {
      this.securityGroups = [new ec2.SecurityGroup(this, 'SG', { vpc: this.vpc })];
    }

    // instance type
    this.instanceType = props?.instanceType ?? ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.LARGE);
    if (!this.architecture.instanceTypeMatch(this.instanceType)) {
      throw new Error(`Builder architecture (${this.architecture.name}) doesn't match selected instance type (${this.instanceType} / ${this.instanceType.architecture})`);
    }

    // log settings
    this.logRetention = props?.logRetention ?? logs.RetentionDays.ONE_MONTH;
    this.logRemovalPolicy = props?.logRemovalPolicy ?? RemovalPolicy.DESTROY;

    // runner version
    this.runnerVersion = props?.runnerVersion ?? RunnerVersion.latest();

    // description
    this.description = `Build ${props.imageTypeName} for GitHub Actions runner ${this.node.path} (${this.os.name}/${this.architecture.name})`;
  }

  protected createLog(recipeName: string): logs.LogGroup {
    return new logs.LogGroup(this, 'Log', {
      logGroupName: `/aws/imagebuilder/${recipeName}`,
      retention: this.logRetention,
      removalPolicy: this.logRemovalPolicy,
    });
  }

  protected createInfrastructure(managedPolicies: iam.IManagedPolicy[]): imagebuilder.CfnInfrastructureConfiguration {
    let role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: managedPolicies,
    });

    for (const component of this.components) {
      component.grantAssetsRead(role);
    }

    return new imagebuilder.CfnInfrastructureConfiguration(this, 'Infrastructure', {
      name: uniqueImageBuilderName(this),
      description: this.description,
      subnetId: this.subnetId,
      securityGroupIds: this.securityGroups.map(sg => sg.securityGroupId),
      instanceTypes: [this.instanceType.toString()],
      instanceProfileName: new iam.CfnInstanceProfile(this, 'Instance Profile', {
        roles: [
          role.roleName,
        ],
      }).ref,
    });
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
      description: this.description,
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

  abstract bindDockerImage(): RunnerImage;
  abstract bindAmi(): RunnerAmi;
}
