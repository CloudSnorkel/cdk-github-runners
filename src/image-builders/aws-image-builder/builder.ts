import * as cdk from 'aws-cdk-lib';
import {
  Annotations,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_events as events,
  aws_iam as iam,
  aws_imagebuilder as imagebuilder,
  aws_lambda as lambda,
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
import { DeleteResourcesFunction } from './delete-resources-function';
import { DeleteResourcesProps } from './delete-resources.lambda';
import { FilterFailedBuildsFunction } from './filter-failed-builds-function';
import { generateBuildWorkflowWithDockerSetupCommands } from './workflow';
import { Architecture, Os, RunnerAmi, RunnerImage, RunnerVersion } from '../../providers';
import { singletonLogGroup, singletonLambda, SingletonLogType } from '../../utils';
import { BuildImageFunction } from '../build-image-function';
import { RunnerImageBuilderBase, RunnerImageBuilderProps, uniqueImageBuilderName } from '../common';

export interface AwsImageBuilderRunnerImageBuilderProps {
  /**
   * The instance type used to build the image.
   *
   * @default m6i.large
   */
  readonly instanceType?: ec2.InstanceType;

  /**
   * Size of volume available for builder instances. This modifies the boot volume size and doesn't add any additional volumes.
   *
   * Use this if you're building images with big components and need more space.
   *
   * @default default size for AMI (usually 30GB for Linux and 50GB for Windows)
   */
  readonly storageSize?: cdk.Size;

  /**
   * Options for fast launch.
   *
   * This is only supported for Windows AMIs.
   *
   * @default disabled
   */
  readonly fastLaunchOptions?: FastLaunchOptions;
}

/**
 * Options for fast launch.
 */
export interface FastLaunchOptions {
  /**
   * Enable fast launch for AMIs generated by this builder. It creates a snapshot of the root volume and uses it to launch new instances faster.
   *
   * This is only supported for Windows AMIs.
   *
   * @note this feature comes with additional resource costs. See the documentation for more details. https://docs.aws.amazon.com/AWSEC2/latest/WindowsGuide/win-fast-launch-manage-costs.html
   * @note enabling fast launch on an existing builder will not enable it for existing AMIs. It will only affect new AMIs. If you want immediate effect, trigger a new image build. Alternatively, you can create a new builder with fast launch enabled and use it for new AMIs.
   *
   * @default false
   */
  readonly enabled?: boolean;

  /**
   * The maximum number of parallel instances that are launched for creating resources.
   *
   * Must be at least 6.
   *
   * @default 6
   */
  readonly maxParallelLaunches?: number;

  /**
   * The number of pre-provisioned snapshots to keep on hand for a fast-launch enabled Windows AMI.
   *
   * @default 1
   */
  readonly targetResourceCount?: number;
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
  private readonly fastLaunchOptions?: FastLaunchOptions;
  private readonly storageSize?: cdk.Size;
  private readonly waitOnDeploy: boolean;
  private readonly dockerSetupCommands: string[];
  private readonly tags: { [key: string]: string };

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
    this.instanceType = props?.awsImageBuilderOptions?.instanceType ?? ec2.InstanceType.of(ec2.InstanceClass.M6I, ec2.InstanceSize.LARGE);
    this.fastLaunchOptions = props?.awsImageBuilderOptions?.fastLaunchOptions;
    this.storageSize = props?.awsImageBuilderOptions?.storageSize;
    this.waitOnDeploy = props?.waitOnDeploy ?? true;
    this.dockerSetupCommands = props?.dockerSetupCommands ?? [];

    // tags for finding resources
    this.tags = {
      'GitHubRunners:Stack': cdk.Stack.of(this).stackName,
      'GitHubRunners:Builder': this.node.path,
    };

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
    if (this.os.isIn(Os._ALL_LINUX_VERSIONS)) {
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
      emptyOnDelete: true,
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
      tags: this.tags,
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
      tags: this.tags,
    });

    const log = this.createLog('Docker Log', recipe.name);
    const infra = this.createInfrastructure([
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      iam.ManagedPolicy.fromAwsManagedPolicyName('EC2InstanceProfileForImageBuilderECRContainerBuilds'),
    ]);

    if (this.waitOnDeploy) {
      this.createImage(infra, dist, log, undefined, recipe.arn);
    }
    this.dockerImageCleaner(recipe, repository);

    this.createPipeline(infra, dist, log, undefined, recipe.arn);

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

  private dockerImageCleaner(recipe: ContainerRecipe, repository: ecr.IRepository) {
    // this is here to provide safe upgrade from old cdk-github-runners versions
    // this lambda was used by a custom resource to delete all images builds on cleanup
    // if we remove the custom resource and the lambda, the old images will be deleted on update
    // keeping the lambda but removing the permissions will make sure that deletion will fail
    const oldDeleter = singletonLambda(BuildImageFunction, this, 'build-image', {
      description: 'Custom resource handler that triggers CodeBuild to build runner images',
      timeout: cdk.Duration.minutes(3),
      logGroup: singletonLogGroup(this, SingletonLogType.RUNNER_IMAGE_BUILD),
      loggingFormat: lambda.LoggingFormat.JSON,
    });
    oldDeleter.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      actions: ['imagebuilder:DeleteImage'],
      resources: ['*'],
    }));

    // delete old version on update and on stack deletion
    this.imageCleaner('Container', recipe.name.toLowerCase(), recipe.version);

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
            semanticVersion: recipe.version,
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
      tags: this.tags,
    });
    image.node.addDependency(infra);
    image.node.addDependency(log);

    // do not delete the image as it will be deleted by imageCleaner().
    // if we delete it here, imageCleaner() won't be able to find the image.
    // if imageCleaner() can't find the image, it won't be able to delete the linked AMI/Docker image.
    // use RETAIN_ON_UPDATE_OR_DELETE, so everything is cleaned only on rollback.
    image.applyRemovalPolicy(RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE);

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
    // set schedule
    let scheduleOptions: imagebuilder.CfnImagePipeline.ScheduleProperty | undefined;
    if (this.rebuildInterval.toDays() > 0) {
      scheduleOptions = {
        scheduleExpression: events.Schedule.rate(this.rebuildInterval).expressionString,
        pipelineExecutionStartCondition: 'EXPRESSION_MATCH_ONLY',
      };
    }

    // generate workflows, if needed
    let workflows: imagebuilder.CfnImagePipeline.WorkflowConfigurationProperty[] | undefined;
    let executionRole: iam.IRole | undefined;
    if (this.dockerSetupCommands.length > 0) {
      workflows = [{
        workflowArn: generateBuildWorkflowWithDockerSetupCommands(this, 'Build', this.dockerSetupCommands).arn,
      }];
      executionRole = iam.Role.fromRoleArn(this, 'Image Builder Role', cdk.Stack.of(this).formatArn({
        service: 'iam',
        region: '',
        resource: 'role',
        resourceName: 'aws-service-role/imagebuilder.amazonaws.com/AWSServiceRoleForImageBuilder',
      }));
    }

    // generate pipeline
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
      workflows: workflows,
      executionRole: executionRole?.roleArn,
      tags: this.tags,
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

    const launchTemplateConfigs: imagebuilder.CfnDistributionConfiguration.LaunchTemplateConfigurationProperty[] = [{
      launchTemplateId: launchTemplate.launchTemplateId,
      setDefaultVersion: true,
    }];
    const fastLaunchConfigs: imagebuilder.CfnDistributionConfiguration.FastLaunchConfigurationProperty[] = [];

    if (this.fastLaunchOptions?.enabled ?? false) {
      if (!this.os.is(Os.WINDOWS)) {
        throw new Error('Fast launch is only supported for Windows');
      }

      // create a separate launch template for fast launch so:
      //  - settings don't affect the runners
      //  - enabling fast launch on an existing builder works (without a new launch template, EC2 Image Builder will use the first version of the launch template, which doesn't have instance or VPC config)
      //  - setting vpc + subnet on the main launch template will cause RunInstances to fail
      //  - EC2 Image Builder seems to get confused with which launch template version to base any new version on, so a new template is always best
      const fastLaunchTemplate = new ec2.CfnLaunchTemplate(this, 'Fast Launch Template', {
        launchTemplateData: {
          metadataOptions: {
            httpTokens: 'required',
          },
          instanceType: this.instanceType.toString(),
          networkInterfaces: [{
            subnetId: this.vpc?.selectSubnets(this.subnetSelection).subnetIds[0],
            deviceIndex: 0,
            groups: this.securityGroups.map(sg => sg.securityGroupId),
          }],
          tagSpecifications: [
            {
              resourceType: 'instance',
              tags: [{
                key: 'Name',
                value: `${this.node.path}/Fast Launch Instance`,
              }],
            },
            {
              resourceType: 'volume',
              tags: [{
                key: 'Name',
                value: `${this.node.path}/Fast Launch Instance`,
              }],
            },
          ],
        },
        tagSpecifications: [{
          resourceType: 'launch-template',
          tags: [{
            key: 'Name',
            value: `${this.node.path}/Fast Launch Template`,
          }],
        }],
      });

      launchTemplateConfigs.push({
        launchTemplateId: fastLaunchTemplate.attrLaunchTemplateId,
        setDefaultVersion: true,
      });
      fastLaunchConfigs.push({
        enabled: true,
        launchTemplate: {
          launchTemplateId: fastLaunchTemplate.attrLaunchTemplateId,
        },
        maxParallelLaunches: this.fastLaunchOptions?.maxParallelLaunches ?? 6,
        snapshotConfiguration: {
          targetResourceCount: this.fastLaunchOptions?.targetResourceCount ?? 1,
        },
      });
    }

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
          launchTemplateConfigurations: launchTemplateConfigs,
          fastLaunchConfigurations: fastLaunchConfigs.length > 0 ? fastLaunchConfigs : undefined,
        },
      ],
      tags: this.tags,
    });

    const recipe = new AmiRecipe(this, 'Ami Recipe', {
      platform: this.platform(),
      components: this.bindComponents(),
      architecture: this.architecture,
      baseAmi: this.baseAmi,
      storageSize: this.storageSize,
      tags: this.tags,
    });

    const log = this.createLog('Ami Log', recipe.name);
    const infra = this.createInfrastructure([
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      iam.ManagedPolicy.fromAwsManagedPolicyName('EC2InstanceProfileForImageBuilder'),
    ]);
    if (this.waitOnDeploy) {
      this.createImage(infra, dist, log, recipe.arn, undefined);
    }
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
    // this is here to provide safe upgrade from old cdk-github-runners versions
    // this lambda was used by a custom resource to delete all amis when the builder was removed
    // if we remove the custom resource, role and lambda, all amis will be deleted on update
    // keeping the just role but removing the permissions along with the custom resource will make sure that deletion will fail
    const stack = cdk.Stack.of(this);
    if (stack.node.tryFindChild('delete-ami-dcc036c8-876b-451e-a2c1-552f9e06e9e1') == undefined) {
      const role = new iam.Role(stack, 'delete-ami-dcc036c8-876b-451e-a2c1-552f9e06e9e1', {
        description: 'Empty role to prevent deletion of AMIs on cdk-github-runners upgrade',
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        inlinePolicies: {
          deny: new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                actions: ['ec2:DeregisterImage', 'ec2:DeleteSnapshot'],
                resources: ['*'],
                effect: iam.Effect.DENY,
              }),
            ],
          }),
        },
      });
      const l1role: iam.CfnRole = role.node.defaultChild as iam.CfnRole;
      l1role.overrideLogicalId('deleteamidcc036c8876b451ea2c1552f9e06e9e1ServiceRole1CC58A6F');
    }

    // delete old version on update and on stack deletion
    this.imageCleaner('Image', recipe.name.toLowerCase(), recipe.version);

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

  private imageCleaner(type: 'Container' | 'Image', recipeName: string, version: string) {
    const cleanerFunction = singletonLambda(DeleteResourcesFunction, this, 'aws-image-builder-delete-resources', {
      description: 'Custom resource handler that deletes resources of old versions of EC2 Image Builder images',
      initialPolicy: [
        new iam.PolicyStatement({
          actions: [
            'imagebuilder:ListImageBuildVersions',
            'imagebuilder:DeleteImage',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: ['ec2:DescribeImages'],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          actions: ['ec2:DeregisterImage', 'ec2:DeleteSnapshot'],
          resources: ['*'],
          conditions: {
            StringEquals: {
              'aws:ResourceTag/GitHubRunners:Stack': cdk.Stack.of(this).stackName,
            },
          },
        }),
        new iam.PolicyStatement({
          actions: ['ecr:BatchDeleteImage'],
          resources: ['*'],
        }),
      ],
      logGroup: singletonLogGroup(this, SingletonLogType.RUNNER_IMAGE_BUILD),
      loggingFormat: lambda.LoggingFormat.JSON,
      timeout: cdk.Duration.minutes(10),
    });

    new CustomResource(this, `${type} Cleaner`, {
      serviceToken: cleanerFunction.functionArn,
      resourceType: 'Custom::ImageBuilder-Delete-Resources',
      properties: <DeleteResourcesProps>{
        ImageVersionArn: cdk.Stack.of(this).formatArn({
          service: 'imagebuilder',
          resource: 'image',
          resourceName: `${recipeName}/${version}`,
          arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
        }),
      },
    });
  }
}

/**
 * @internal
 */
export class AwsImageBuilderFailedBuildNotifier implements cdk.IAspect {
  public static createFilteringTopic(scope: Construct, targetTopic: sns.Topic): sns.ITopic {
    const topic = new sns.Topic(scope, 'Image Builder Builds');
    const filter = new FilterFailedBuildsFunction(scope, 'Image Builder Builds Filter', {
      logGroup: singletonLogGroup(scope, SingletonLogType.RUNNER_IMAGE_BUILD),
      loggingFormat: lambda.LoggingFormat.JSON,
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
      const infraNode = builder.node.tryFindChild('Infrastructure');
      if (infraNode) {
        const infra = infraNode as imagebuilder.CfnInfrastructureConfiguration;
        infra.snsTopicArn = this.topic.topicArn;
      } else {
        cdk.Annotations.of(builder).addWarning('Unused builder cannot get notifications of failed builds');
      }
    }
  }
}
