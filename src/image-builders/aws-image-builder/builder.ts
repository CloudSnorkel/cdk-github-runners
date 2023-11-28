import * as cdk from 'aws-cdk-lib';
import {
  Annotations,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_events as events,
  aws_iam as iam,
  aws_imagebuilder as imagebuilder,
  aws_logs as logs,
  aws_s3_assets as s3_assets,
  aws_sns as sns,
  aws_sns_subscriptions as subs,
  CustomResource,
  Duration,
  RemovalPolicy,
  Stack,
} from 'aws-cdk-lib';
import { TagMutability } from 'aws-cdk-lib/aws-ecr';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct, IConstruct } from 'constructs';
import { AmiRecipe, defaultBaseAmi } from './ami';
import { ImageBuilderObjectBase } from './common';
import { ContainerRecipe, defaultBaseDockerImage } from './container';
import { DeleteAmiFunction } from './delete-ami-function';
import { FilterFailedBuildsFunction } from './filter-failed-builds-function';
import { Architecture, Os, RunnerAmi, RunnerImage, RunnerVersion } from '../../providers';
import { singletonLambda } from '../../utils';
import { BuildImageFunction } from '../build-image-function';
import { RunnerImageBuilderBase, RunnerImageBuilderProps, uniqueImageBuilderName } from '../common';

export interface AwsImageBuilderRunnerImageBuilderProps {
  /**
   * The instance type used to build the image.
   *
   * @default m5.large
   */
  readonly instanceType?: ec2.InstanceType;
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

  /**
   * Require a reboot after installing this component.
   *
   * @default false
   */
  readonly reboot?: boolean;
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
 *     '$p = Start-Process msiexec.exe -PassThru -Wait -ArgumentList \'/i https://awscli.amazonaws.com/AWSCLIV2.msi /qn\'',
 *     'if ($p.ExitCode -ne 0) { throw "Exit code is $p.ExitCode" }',
 *   ],
 * }
 * ```
 *
 * @deprecated Use `RunnerImageComponent` instead as this be internal soon.
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

    if (props.reboot ?? false) {
      steps.push({
        name: 'Reboot',
        action: 'Reboot',
        inputs: {},
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
      version: this.generateVersion('Component', name, {
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
        'Set-PSDebug -Trace 1',
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
export class AwsImageBuilderRunnerImageBuilder extends RunnerImageBuilderBase {
  private boundDockerImage?: RunnerImage;
  private boundAmi?: RunnerAmi;
  private readonly os: Os;
  private readonly architecture: Architecture;
  private readonly baseImage: string;
  private readonly baseAmi: string;
  private readonly logRetention: RetentionDays;
  private readonly logRemovalPolicy: RemovalPolicy;
  private readonly vpc: ec2.IVpc;
  private readonly securityGroups: ec2.ISecurityGroup[];
  private readonly subnetSelection: ec2.SubnetSelection | undefined;
  private readonly rebuildInterval: cdk.Duration;
  private readonly boundComponents: ImageBuilderComponent[] = [];
  private readonly instanceType: ec2.InstanceType;
  private infrastructure: imagebuilder.CfnInfrastructureConfiguration | undefined;
  private readonly role: iam.Role;

  constructor(scope: Construct, id: string, props?: RunnerImageBuilderProps) {
    super(scope, id, props);

    if (props?.codeBuildOptions) {
      Annotations.of(this).addWarning('codeBuildOptions are ignored when using AWS Image Builder to build runner images.');
    }

    this.os = props?.os ?? Os.LINUX_UBUNTU;
    this.architecture = props?.architecture ?? Architecture.X86_64;
    this.rebuildInterval = props?.rebuildInterval ?? Duration.days(7);
    this.logRetention = props?.logRetention ?? RetentionDays.ONE_MONTH;
    this.logRemovalPolicy = props?.logRemovalPolicy ?? RemovalPolicy.DESTROY;
    this.vpc = props?.vpc ?? ec2.Vpc.fromLookup(this, 'VPC', { isDefault: true });
    this.securityGroups = props?.securityGroups ?? [new ec2.SecurityGroup(this, 'SG', { vpc: this.vpc })];
    this.subnetSelection = props?.subnetSelection;
    this.baseImage = props?.baseDockerImage ?? defaultBaseDockerImage(this.os);
    this.baseAmi = props?.baseAmi ?? defaultBaseAmi(this, this.os, this.architecture);
    this.instanceType = props?.awsImageBuilderOptions?.instanceType ?? ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.LARGE);

    // confirm instance type
    if (!this.architecture.instanceTypeMatch(this.instanceType)) {
      throw new Error(`Builder architecture (${this.architecture.name}) doesn't match selected instance type (${this.instanceType} / ${this.instanceType.architecture})`);
    }

    // warn against isolated networks
    if (props?.subnetSelection?.subnetType == ec2.SubnetType.PRIVATE_ISOLATED) {
      Annotations.of(this).addWarning('Private isolated subnets cannot pull from public ECR and VPC endpoint is not supported yet. ' +
        'See https://github.com/aws/containers-roadmap/issues/1160');
    }

    // role to be used by AWS Image Builder
    this.role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });
  }

  private platform() {
    if (this.os.is(Os.WINDOWS)) {
      return 'Windows';
    }
    if (this.os.is(Os.LINUX_AMAZON_2) || this.os.is(Os.LINUX_UBUNTU)) {
      return 'Linux';
    }
    throw new Error(`OS ${this.os.name} is not supported by AWS Image Builder`);
  }

  /**
   * Called by IRunnerProvider to finalize settings and create the image builder.
   */
  bindDockerImage(): RunnerImage {
    if (this.boundDockerImage) {
      return this.boundDockerImage;
    }

    // create repository that only keeps one tag
    const repository = new ecr.Repository(this, 'Repository', {
      imageScanOnPush: true,
      imageTagMutability: TagMutability.MUTABLE,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteImages: true,
    });

    const dist = new imagebuilder.CfnDistributionConfiguration(this, 'Docker Distribution', {
      name: uniqueImageBuilderName(this),
      // description: this.description,
      distributions: [
        {
          region: Stack.of(this).region,
          containerDistributionConfiguration: {
            ContainerTags: ['latest'],
            TargetRepository: {
              Service: 'ECR',
              RepositoryName: repository.repositoryName,
            },
          },
        },
      ],
    });

    let dockerfileTemplate = `FROM {{{ imagebuilder:parentImage }}}
{{{ imagebuilder:environments }}}
{{{ imagebuilder:components }}}`;

    for (const c of this.components) {
      const commands = c.getDockerCommands(this.os, this.architecture);
      if (commands.length > 0) {
        dockerfileTemplate += '\n' + commands.join('\n') + '\n';
      }
    }

    const recipe = new ContainerRecipe(this, 'Container Recipe', {
      platform: this.platform(),
      components: this.bindComponents(),
      targetRepository: repository,
      dockerfileTemplate: dockerfileTemplate,
      parentImage: this.baseImage,
    });

    const log = this.createLog('Docker Log', recipe.name);
    const infra = this.createInfrastructure([
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      iam.ManagedPolicy.fromAwsManagedPolicyName('EC2InstanceProfileForImageBuilderECRContainerBuilds'),
    ]);
    const image = this.createImage(infra, dist, log, undefined, recipe.arn);
    this.createPipeline(infra, dist, log, undefined, recipe.arn);

    this.dockerImageCleaner(recipe, image, repository);

    this.boundDockerImage = {
      imageRepository: repository,
      imageTag: 'latest',
      os: this.os,
      architecture: this.architecture,
      logGroup: log,
      runnerVersion: RunnerVersion.specific('unknown'),
      // no dependable as CloudFormation will fail to get image ARN once the image is deleted (we delete old images daily)
    };

    return this.boundDockerImage;
  }

  private dockerImageCleaner(recipe: ContainerRecipe, image: imagebuilder.CfnImage, repository: ecr.IRepository) {
    // delete all left over dockers images on
    const crHandler = singletonLambda(BuildImageFunction, this, 'build-image', {
      description: 'Custom resource handler that triggers CodeBuild to build runner images, and cleans-up images on deletion',
      timeout: cdk.Duration.minutes(3),
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    const policy = new iam.Policy(this, 'CR Policy', {
      statements: [
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
        RepoName: repository.repositoryName,
        ImageBuilderName: recipe.name, // we don't use image.name because CloudFormation complains if it was deleted already
        // TODO pass version too and then when a new version is deployed, it will delete the old one (careful with upgrades)
        DeleteOnly: true,
      },
    });

    // add dependencies to make sure resources are there when we need them
    cr.node.addDependency(image);
    cr.node.addDependency(policy);
    cr.node.addDependency(crHandler);

    // delete old docker images + IB resources daily
    new imagebuilder.CfnLifecyclePolicy(this, 'Lifecycle Policy Docker', {
      name: uniqueImageBuilderName(this),
      description: `Delete old GitHub Runner Docker images for ${this.node.path}`,
      executionRole: new iam.Role(this, 'Lifecycle Policy Docker Role', {
        assumedBy: new iam.ServicePrincipal('imagebuilder.amazonaws.com'),
        inlinePolicies: {
          ib: new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                actions: ['tag:GetResources', 'imagebuilder:DeleteImage'],
                resources: ['*'], // Image Builder doesn't support scoping this :(
              }),
            ],
          }),
          ecr: new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                actions: ['ecr:BatchGetImage', 'ecr:BatchDeleteImage'],
                resources: [repository.repositoryArn],
              }),
            ],
          }),
        },
      }).roleArn,
      policyDetails: [{
        action: {
          type: 'DELETE',
          includeResources: {
            containers: true,
          },
        },
        filter: {
          type: 'COUNT',
          value: 2,
        },
      }],
      resourceType: 'CONTAINER_IMAGE',
      resourceSelection: {
        recipes: [
          {
            name: recipe.name,
            semanticVersion: recipe.version, // docs say it's optional, but it's not
          },
        ],
      },
    });
  }

  protected createLog(id: string, recipeName: string): logs.LogGroup {
    return new logs.LogGroup(this, id, {
      logGroupName: `/aws/imagebuilder/${recipeName}`,
      retention: this.logRetention,
      removalPolicy: this.logRemovalPolicy,
    });
  }

  protected createInfrastructure(managedPolicies: iam.IManagedPolicy[]): imagebuilder.CfnInfrastructureConfiguration {
    if (this.infrastructure) {
      return this.infrastructure;
    }

    for (const managedPolicy of managedPolicies) {
      this.role.addManagedPolicy(managedPolicy);
    }

    for (const component of this.boundComponents) {
      component.grantAssetsRead(this.role);
    }

    this.infrastructure = new imagebuilder.CfnInfrastructureConfiguration(this, 'Infrastructure', {
      name: uniqueImageBuilderName(this),
      // description: this.description,
      subnetId: this.vpc?.selectSubnets(this.subnetSelection).subnetIds[0],
      securityGroupIds: this.securityGroups?.map(sg => sg.securityGroupId),
      instanceTypes: [this.instanceType.toString()],
      instanceMetadataOptions: {
        httpTokens: 'required',
        // Container builds require a minimum of two hops.
        httpPutResponseHopLimit: 2,
      },
      instanceProfileName: new iam.CfnInstanceProfile(this, 'Instance Profile', {
        roles: [
          this.role.roleName,
        ],
      }).ref,
    });

    return this.infrastructure;
  }

  protected createImage(infra: imagebuilder.CfnInfrastructureConfiguration, dist: imagebuilder.CfnDistributionConfiguration, log: logs.LogGroup,
    imageRecipeArn?: string, containerRecipeArn?: string): imagebuilder.CfnImage {
    const image = new imagebuilder.CfnImage(this, this.amiOrContainerId('Image', imageRecipeArn, containerRecipeArn), {
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

  private amiOrContainerId(baseId: string, imageRecipeArn?: string, containerRecipeArn?: string) {
    if (imageRecipeArn) {
      return `AMI ${baseId}`;
    }
    if (containerRecipeArn) {
      return `Docker ${baseId}`;
    }
    throw new Error('Either imageRecipeArn or containerRecipeArn must be defined');
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
    const pipeline = new imagebuilder.CfnImagePipeline(this, this.amiOrContainerId('Pipeline', imageRecipeArn, containerRecipeArn), {
      name: uniqueImageBuilderName(this),
      // description: this.description,
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

  public get grantPrincipal(): iam.IPrincipal {
    return this.role;
  }

  bindAmi(): RunnerAmi {
    if (this.boundAmi) {
      return this.boundAmi;
    }

    const launchTemplate = new ec2.LaunchTemplate(this, 'Launch template', {
      requireImdsv2: true,
    });

    const stackName = cdk.Stack.of(this).stackName;
    const builderName = this.node.path;

    const dist = new imagebuilder.CfnDistributionConfiguration(this, 'AMI Distribution', {
      name: uniqueImageBuilderName(this),
      // description: this.description,
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
      platform: this.platform(),
      components: this.bindComponents(),
      architecture: this.architecture,
      baseAmi: this.baseAmi,
    });

    const log = this.createLog('Ami Log', recipe.name);
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
      runnerVersion: RunnerVersion.specific('unknown'),
    };

    this.amiCleaner(recipe, stackName, builderName);

    return this.boundAmi;
  }

  private amiCleaner(recipe: AmiRecipe, stackName: string, builderName: string) {
    const deleter = singletonLambda(DeleteAmiFunction, this, 'delete-ami', {
      description: 'Delete old GitHub Runner AMIs',
      initialPolicy: [
        new iam.PolicyStatement({
          actions: ['ec2:DescribeImages'],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: ['ec2:DeregisterImage', 'ec2:DeleteSnapshot'],
          resources: ['*'],
          conditions: {
            StringEquals: {
              'aws:ResourceTag/GitHubRunners:Stack': stackName,
              'aws:ResourceTag/GitHubRunners:Builder': builderName,
            },
          },
        }),
      ],
      timeout: cdk.Duration.minutes(5),
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // delete all AMIs when this construct is removed
    new CustomResource(this, 'AMI Deleter', {
      serviceToken: deleter.functionArn,
      resourceType: 'Custom::AmiDeleter',
      properties: {
        StackName: stackName,
        BuilderName: builderName,
      },
    });

    // delete old AMIs + IB resources daily
    new imagebuilder.CfnLifecyclePolicy(this, 'Lifecycle Policy AMI', {
      name: uniqueImageBuilderName(this),
      description: `Delete old GitHub Runner AMIs for ${this.node.path}`,
      executionRole: new iam.Role(this, 'Lifecycle Policy AMI Role', {
        assumedBy: new iam.ServicePrincipal('imagebuilder.amazonaws.com'),
        inlinePolicies: {
          ib: new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                actions: ['tag:GetResources', 'imagebuilder:DeleteImage'],
                resources: ['*'], // Image Builder doesn't support scoping this :(
              }),
            ],
          }),
          ami: new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                actions: ['ec2:DescribeImages', 'ec2:DescribeImageAttribute'],
                resources: ['*'],
              }),
              new iam.PolicyStatement({
                actions: ['ec2:DeregisterImage', 'ec2:DeleteSnapshot'],
                resources: ['*'],
                conditions: {
                  StringEquals: {
                    'aws:ResourceTag/GitHubRunners:Stack': stackName,
                    'aws:ResourceTag/GitHubRunners:Builder': builderName,
                  },
                },
              }),
            ],
          }),
        },
      }).roleArn,
      policyDetails: [{
        action: {
          type: 'DELETE',
          includeResources: {
            amis: true,
            snapshots: true,
          },
        },
        filter: {
          type: 'COUNT',
          value: 2,
        },
      }],
      resourceType: 'AMI_IMAGE',
      resourceSelection: {
        recipes: [
          {
            name: recipe.name,
            semanticVersion: recipe.version, // docs say it's optional, but it's not
          },
        ],
      },
    });
  }

  private bindComponents(): ImageBuilderComponent[] {
    if (this.boundComponents.length == 0) {
      this.boundComponents.push(...this.components.map((c, i) => c._asAwsImageBuilderComponent(this, `Component ${i} ${c.name}`, this.os, this.architecture)));
    }

    return this.boundComponents;
  }
}

/**
 * @internal
 */
export class AwsImageBuilderFailedBuildNotifier implements cdk.IAspect {
  public static createFilteringTopic(scope: Construct, targetTopic: sns.Topic) {
    const topic = new sns.Topic(scope, 'Image Builder Builds');
    const filter = new FilterFailedBuildsFunction(scope, 'Image Builder Builds Filter', {
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        TARGET_TOPIC_ARN: targetTopic.topicArn,
      },
    });

    topic.addSubscription(new subs.LambdaSubscription(filter));
    targetTopic.grantPublish(filter);

    return topic;
  }

  constructor(private topic: sns.ITopic) {
  }

  public visit(node: IConstruct): void {
    if (node instanceof AwsImageBuilderRunnerImageBuilder) {
      const builder = node as AwsImageBuilderRunnerImageBuilder;
      const infra = builder.node.findChild('Infrastructure') as imagebuilder.CfnInfrastructureConfiguration;
      infra.snsTopicArn = this.topic.topicArn;
    }
  }
}
