import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2, aws_iam as iam, aws_logs as logs, Duration, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AwsImageBuilderRunnerImageBuilderProps } from './aws-image-builder';
import { CodeBuildRunnerImageBuilderProps } from './codebuild';
import { RunnerImageComponent } from './components';
import { Architecture, Os, RunnerAmi, RunnerImage, RunnerVersion } from '../providers';

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
   * @default OS.LINUX_UBUNTU
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
   * Pipeline and infrastructure description.
   */
  readonly imageTypeName: string;
}

/**
 * Asset to copy into a built image.
 */
export interface RunnerImageAsset {
  /**
   * Path on local system to copy into the image. Can be a file or a directory.
   */
  readonly source: string;

  /**
   * Target path in the built image.
   */
  readonly target: string;
}

export interface RunnerImageBuilderProps {
  /**
   * Image architecture.
   *
   * @default Architecture.X86_64
   */
  readonly architecture?: Architecture;

  /**
   * Image OS.
   *
   * @default OS.LINUX_UBUNTU
   */
  readonly os?: Os;

  /**
   * Base image from which Docker runner images will be built.
   *
   * When using private images from a different account or not on ECR, you may need to include additional setup commands with {@link dockerSetupCommands}.
   *
   * @default public.ecr.aws/lts/ubuntu:22.04 for Os.LINUX_UBUNTU, public.ecr.aws/amazonlinux/amazonlinux:2 for Os.LINUX_AMAZON_2, mcr.microsoft.com/windows/servercore:ltsc2019-amd64 for Os.WINDOWS
   */
  readonly baseDockerImage?: string;

  /**
   * Additional commands to run on the build host before starting the Docker runner image build.
   *
   * Use this to execute commands such as `docker login` or `aws ecr get-login-password` to pull private base images.
   *
   * @default []
   */
  readonly dockerSetupCommands?: string[];

  /**
   * Base AMI from which runner AMIs will be built.
   *
   * This can be an actual AMI or an AWS Image Builder ARN that points to the latest AMI. For example `arn:aws:imagebuilder:us-east-1:aws:image/ubuntu-server-22-lts-x86/x.x.x` would always use the latest version of Ubuntu 22.04 in each build. If you want a specific version, you can replace `x.x.x` with that version.
   *
   * @default latest Ubuntu 22.04 AMI for Os.LINUX_UBUNTU, latest Amazon Linux 2 AMI for Os.LINUX_AMAZON_2, latest Windows Server 2022 AMI for Os.WINDOWS
   */
  readonly baseAmi?: string;

  /**
   * Version of GitHub Runners to install.
   *
   * @default latest version available
   */
  readonly runnerVersion?: RunnerVersion;

  /**
   * Components to install on the image.
   *
   * @default none
   */
  readonly components?: RunnerImageComponent[];

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
   * Security Groups to assign to this instance.
   */
  readonly securityGroups?: ec2.ISecurityGroup[];

  /**
   * Where to place the network interfaces within the VPC.
   *
   * @default no subnet
   */
  readonly subnetSelection?: ec2.SubnetSelection;

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

  /**
   * @default CodeBuild for Linux Docker image, AWS Image Builder for Windows Docker image and any AMI
   */
  readonly builderType?: RunnerImageBuilderType;

  /**
   * Options specific to CodeBuild image builder. Only used when builderType is RunnerImageBuilderType.CODE_BUILD.
   */
  readonly codeBuildOptions?: CodeBuildRunnerImageBuilderProps;

  /**
   * Options specific to AWS Image Builder. Only used when builderType is RunnerImageBuilderType.AWS_IMAGE_BUILDER.
   */
  readonly awsImageBuilderOptions?: AwsImageBuilderRunnerImageBuilderProps;

  /**
   * Wait for image to finish building during deployment. It's usually best to leave this enabled to ensure everything is ready once deployment is done. However, it can be disabled to speed up deployment in case where you have a lot of image components that can take a long time to build.
   *
   * Disabling this option means a finished deployment is not ready to be used. You will have to wait for the image to finish building before the system can be used.
   *
   * Disabling this option may also mean any changes to settings or components can take up to a week (default rebuild interval) to take effect.
   *
   * @default true
   */
  readonly waitOnDeploy?: boolean;
}

export enum RunnerImageBuilderType {
  /**
   * Build runner images using AWS CodeBuild.
   *
   * Faster than AWS Image Builder, but can only be used to build Linux Docker images.
   */
  CODE_BUILD = 'CodeBuild',

  /**
   * Build runner images using AWS Image Builder.
   *
   * Slower than CodeBuild, but can be used to build any type of image including AMIs and Windows images.
   */
  AWS_IMAGE_BUILDER = 'AwsImageBuilder',
}

/**
 * Interface for constructs that build an image that can be used in {@link IRunnerProvider}.
 *
 * An image can be a Docker image or AMI.
 */
export interface IRunnerImageBuilder {
  /**
   * Build and return a Docker image with GitHub Runner installed in it.
   *
   * Anything that ends up with an ECR repository containing a Docker image that runs GitHub self-hosted runners can be used. A simple implementation could even point to an existing image and nothing else.
   *
   * It's important that the specified image tag be available at the time the repository is available. Providers usually assume the image is ready and will fail if it's not.
   *
   * The image can be further updated over time manually or using a schedule as long as it is always written to the same tag.
   */
  bindDockerImage(): RunnerImage;

  /**
   * Build and return an AMI with GitHub Runner installed in it.
   *
   * Anything that ends up with a launch template pointing to an AMI that runs GitHub self-hosted runners can be used. A simple implementation could even point to an existing AMI and nothing else.
   *
   * The AMI can be further updated over time manually or using a schedule as long as it is always written to the same launch template.
   */
  bindAmi(): RunnerAmi;
}

/**
 * Interface for constructs that build an image that can be used in {@link IRunnerProvider}. The image can be configured by adding or removing components. The image builder can be configured by adding grants or allowing connections.
 *
 * An image can be a Docker image or AMI.
 */
export interface IConfigurableRunnerImageBuilder extends IRunnerImageBuilder, ec2.IConnectable, iam.IGrantable {
  /**
   * Add a component to the image builder. The component will be added to the end of the list of components.
   *
   * @param component component to add
   */
  addComponent(component: RunnerImageComponent): void;

  /**
   * Remove a component from the image builder. Removal is done by component name. Multiple components with the same name will all be removed.
   *
   * @param component component to remove
   */
  removeComponent(component: RunnerImageComponent): void;
}

/**
 * @internal
 */
export abstract class RunnerImageBuilderBase extends Construct implements IConfigurableRunnerImageBuilder {
  protected components: RunnerImageComponent[] = [];

  protected constructor(scope: Construct, id: string, props?: RunnerImageBuilderProps) {
    super(scope, id);

    if (props?.components) {
      this.components.push(...props.components);
    }
  }

  abstract bindDockerImage(): RunnerImage;

  abstract bindAmi(): RunnerAmi;

  abstract get connections(): ec2.Connections;
  abstract get grantPrincipal(): iam.IPrincipal;

  public addComponent(component: RunnerImageComponent) {
    this.components.push(component);
  }

  public removeComponent(component: RunnerImageComponent) {
    this.components = this.components.filter(c => c.name !== component.name);
  }
}

