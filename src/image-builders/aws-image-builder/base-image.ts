import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

/**
 * Type that can be used to specify a base image - either a string (deprecated) or a BaseImage object.
 *
 * To create a BaseImage object, use the static factory methods like BaseImage.fromAmiId().
 *
 * @deprecated String support will be removed in a future version. Use BaseImage static factory methods instead.
 */
export type BaseImageInput = string | BaseImage;

/**
 * Represents a base image that is used to start from in EC2 Image Builder image builds.
 *
 * This class is adapted from AWS CDK's BaseImage class to support both string and object inputs.
 */
export class BaseImage {
  /**
   * The AMI ID to use as a base image in an image recipe
   *
   * @param amiId The AMI ID to use as the base image
   */
  public static fromAmiId(amiId: string): BaseImage {
    return new BaseImage(amiId);
  }

  /**
   * An AWS-provided EC2 Image Builder image to use as a base image in an image recipe.
   *
   * This constructs an Image Builder ARN for AWS-provided images like `ubuntu-server-22-lts-x86/x.x.x`.
   *
   * @param scope The construct scope (used to determine the stack and region)
   * @param resourceName The Image Builder resource name pattern (e.g., `ubuntu-server-22-lts-x86` or `ubuntu-server-22-lts-${arch}`)
   * @param version The version pattern (defaults to `x.x.x` to use the latest version)
   */
  public static fromImageBuilder(scope: Construct, resourceName: string, version: string = 'x.x.x'): BaseImage {
    const stack = cdk.Stack.of(scope);
    return new BaseImage(stack.formatArn({
      service: 'imagebuilder',
      resource: 'image',
      account: 'aws',
      resourceName: `${resourceName}/${version}`,
    }));
  }

  /**
   * The marketplace product ID for an AMI product to use as the base image in an image recipe
   *
   * @param productId The Marketplace AMI product ID to use as the base image
   */
  public static fromMarketplaceProductId(productId: string): BaseImage {
    return new BaseImage(productId);
  }

  /**
   * The SSM parameter to use as the base image in an image recipe
   *
   * @param parameter The SSM parameter to use as the base image
   */
  public static fromSsmParameter(parameter: ssm.IParameter): BaseImage {
    return new BaseImage(`ssm:${parameter.parameterArn}`);
  }

  /**
   * The parameter name for the SSM parameter to use as the base image in an image recipe
   *
   * @param parameterName The name of the SSM parameter to use as the base image
   */
  public static fromSsmParameterName(parameterName: string): BaseImage {
    return new BaseImage(`ssm:${parameterName}`);
  }

  /**
   * The direct string value of the base image to use in an image recipe. This can be an EC2 Image Builder image ARN,
   * an SSM parameter, an AWS Marketplace product ID, or an AMI ID.
   *
   * @param baseImageString The base image as a direct string value
   */
  public static fromString(baseImageString: string): BaseImage {
    return new BaseImage(baseImageString);
  }

  /**
   * The rendered base image to use
   */
  public readonly image: string;

  protected constructor(image: string) {
    this.image = image;
  }
}

/**
 * Type that can be used to specify a base container image - either a string (deprecated) or a BaseContainerImage object.
 *
 * To create a BaseContainerImage object, use the static factory methods like BaseContainerImage.fromEcr().
 *
 * @deprecated String support will be removed in a future version. Use BaseContainerImage static factory methods instead.
 */
export type BaseContainerImageInput = string | BaseContainerImage;

/**
 * Represents a base container image that is used to start from in EC2 Image Builder container builds.
 *
 * This class is adapted from AWS CDK's BaseContainerImage class to support both string and object inputs.
 */
export class BaseContainerImage {
  /**
   * The DockerHub image to use as the base image in a container recipe
   *
   * @param repository The DockerHub repository where the base image resides in
   * @param tag The tag of the base image in the DockerHub repository
   */
  public static fromDockerHub(repository: string, tag: string): BaseContainerImage {
    return new BaseContainerImage(`${repository}:${tag}`);
  }

  /**
   * The ECR container image to use as the base image in a container recipe
   *
   * @param repository The ECR repository where the base image resides in
   * @param tag The tag of the base image in the ECR repository
   */
  public static fromEcr(repository: ecr.IRepository, tag: string): BaseContainerImage {
    return new BaseContainerImage(repository.repositoryUriForTag(tag), repository);
  }

  /**
   * The ECR public container image to use as the base image in a container recipe
   *
   * @param registryAlias The alias of the ECR public registry where the base image resides in
   * @param repositoryName The name of the ECR public repository, where the base image resides in
   * @param tag The tag of the base image in the ECR public repository
   */
  public static fromEcrPublic(registryAlias: string, repositoryName: string, tag: string): BaseContainerImage {
    return new BaseContainerImage(`public.ecr.aws/${registryAlias}/${repositoryName}:${tag}`);
  }

  /**
   * The string value of the base image to use in a container recipe. This can be an EC2 Image Builder image ARN,
   * an ECR or ECR public image, or a container URI sourced from a third-party container registry such as DockerHub.
   *
   * @param baseContainerImageString The base image as a direct string value
   */
  public static fromString(baseContainerImageString: string): BaseContainerImage {
    return new BaseContainerImage(baseContainerImageString);
  }

  /**
   * The rendered base image to use
   */
  public readonly image: string;

  /**
   * The ECR repository if this image was created from an ECR repository.
   * This allows automatic permission granting for CodeBuild.
   */
  public readonly ecrRepository?: ecr.IRepository;

  protected constructor(image: string, ecrRepository?: ecr.IRepository) {
    this.image = image;
    this.ecrRepository = ecrRepository;
  }
}
