import * as cdk from 'aws-cdk-lib';
import {
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
import { ImageBuilderBase, ImageBuilderComponent, ImageBuilderObjectBase, uniqueImageBuilderName } from './common';
import { LinuxUbuntuComponents } from './linux-components';
import { WindowsComponents } from './windows-components';

const dockerfileTemplate = `FROM {{{ imagebuilder:parentImage }}}
ENV RUNNER_VERSION=___RUNNER_VERSION___
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
   * Parent image for the new Docker Image. You can use either Image Builder image ARN or public registry image.
   *
   * @default 'mcr.microsoft.com/windows/servercore:ltsc2019-amd64'
   */
  readonly parentImage?: string;

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
   * ECR repository where resulting container image will be uploaded.
   */
  readonly targetRepository: ecr.IRepository;

  /**
   * Dockerfile template where all the components will be added.
   *
   * Must contain at least the following placeholders:
   *
   * ```
   * FROM {{{ imagebuilder:parentImage }}}
   * {{{ imagebuilder:environments }}}
   * {{{ imagebuilder:components }}}
   * ```
   */
  readonly dockerfileTemplate: string;

  /**
   * Parent image for the new Docker Image.
   *
   * @default 'mcr.microsoft.com/windows/servercore:ltsc2019-amd64'
   */
  readonly parentImage?: string;
}

/**
 * Image builder recipe for a Docker container image.
 */
class ContainerRecipe extends ImageBuilderObjectBase {
  public readonly arn: string;
  public readonly name: string;

  constructor(scope: Construct, id: string, props: ContainerRecipeProperties) {
    super(scope, id);

    const name = uniqueImageBuilderName(this);

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
        dockerfileTemplate,
      }),
      parentImage: props.parentImage ?? 'mcr.microsoft.com/windows/servercore:ltsc2019-amd64',
      components,
      containerType: 'DOCKER',
      targetRepository: {
        service: 'ECR',
        repositoryName: props.targetRepository.repositoryName,
      },
      dockerfileTemplateData: props.dockerfileTemplate,
    });

    this.arn = recipe.attrArn;
    this.name = name;
  }
}

/**
 * An image builder that uses AWS Image Builder to build Docker images pre-baked with all the GitHub Actions runner requirements. Builders can be used with runner providers.
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
 *     label: 'custom-codebuild',
 *     imageBuilder: builder,
 * });
 * ```
 */
export class ContainerImageBuilder extends ImageBuilderBase implements IImageBuilder {
  readonly repository: ecr.IRepository;
  private readonly parentImage: string | undefined;
  private boundImage?: RunnerImage;

  constructor(scope: Construct, id: string, props?: ContainerImageBuilderProps) {
    super(scope, id, {
      os: props?.os,
      supportedOs: [Os.WINDOWS],
      architecture: props?.architecture,
      supportedArchitectures: [Architecture.X86_64],
      instanceType: props?.instanceType,
      vpc: props?.vpc,
      securityGroups: props?.securityGroup ? [props.securityGroup] : props?.securityGroups,
      subnetSelection: props?.subnetSelection,
      logRemovalPolicy: props?.logRemovalPolicy,
      logRetention: props?.logRetention,
      runnerVersion: props?.runnerVersion,
      rebuildInterval: props?.rebuildInterval,
      imageTypeName: 'image',
    });

    this.parentImage = props?.parentImage;

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
    this.addComponent(WindowsComponents.awsCli(this, 'AWS CLI'));
    this.addComponent(WindowsComponents.githubCli(this, 'GitHub CLI'));
    this.addComponent(WindowsComponents.git(this, 'git'));
    this.addComponent(WindowsComponents.githubRunner(this, 'GitHub Actions Runner', this.runnerVersion));
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
    if (this.platform == 'Linux') {
      this.prependComponent(LinuxUbuntuComponents.extraCertificates(this, 'Extra Certs', path));
    } else if (this.platform == 'Windows') {
      this.prependComponent(WindowsComponents.extraCertificates(this, 'Extra Certs', path));
    } else {
      throw new Error(`Unknown platform: ${this.platform}`);
    }
  }

  /**
   * Called by IRunnerProvider to finalize settings and create the image builder.
   */
  bind(): RunnerImage {
    if (this.boundImage) {
      return this.boundImage;
    }

    const dist = new imagebuilder.CfnDistributionConfiguration(this, 'Distribution', {
      name: uniqueImageBuilderName(this),
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
      dockerfileTemplate: dockerfileTemplate.replace('___RUNNER_VERSION___', this.runnerVersion.version),
      parentImage: this.parentImage,
    });

    const log = this.createLog(recipe.name);
    const infra = this.createInfrastructure([
      iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      iam.ManagedPolicy.fromAwsManagedPolicyName('EC2InstanceProfileForImageBuilderECRContainerBuilds'),
    ]);
    const image = this.createImage(infra, dist, log, undefined, recipe.arn);
    this.createPipeline(infra, dist, log, undefined, recipe.arn);

    this.imageCleaner(image, recipe.name);

    this.boundImage = {
      // There are simpler ways to get the ARN, but we want an image object that depends on the newly built image.
      // We want whoever is using this image to automatically wait for Image Builder to finish building before using the image.
      imageRepository: ecr.Repository.fromRepositoryName(
        this, 'Dependable Image',
        // we can't use image.attrName because it comes up with upper case
        cdk.Fn.split(':', cdk.Fn.split('/', image.attrImageUri, 2)[1], 2)[0],
      ),
      imageTag: 'latest',
      os: this.os,
      architecture: this.architecture,
      logGroup: log,
      runnerVersion: this.runnerVersion,
    };

    return this.boundImage;
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
