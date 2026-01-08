import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ssm from 'aws-cdk-lib/aws-ssm';

/**
 * Interface for an EC2 Image Builder image.
 * This is a simplified version that only requires the image ARN.
 */
export interface IImage {
  /**
     * The ARN of the image
     */
  readonly imageArn: string;
}

/**
 * Properties for specifying a base image as an object.
 */
export interface BaseImageProps {
  /**
     * The AMI ID to use as a base image
     */
  readonly amiId?: string;

  /**
     * The EC2 Image Builder image ARN to use as a base image
     */
  readonly imageArn?: string;

  /**
     * The EC2 Image Builder image to use as a base image
     */
  readonly image?: IImage;

  /**
     * The marketplace product ID for an AMI product to use as the base image
     */
  readonly marketplaceProductId?: string;

  /**
     * The SSM parameter to use as the base image
     */
  readonly ssmParameter?: ssm.IParameter;

  /**
     * The SSM parameter name to use as the base image
     */
  readonly ssmParameterName?: string;

  /**
     * The direct string value of the base image (AMI ID, Image Builder ARN, SSM parameter, or Marketplace product ID)
     */
  readonly stringValue?: string;
}

/**
 * Type that can be used to specify a base image - either a string or an object with properties.
 */
export type BaseImageInput = string | BaseImageProps;

/**
 * Represents a base image that is used to start from in EC2 Image Builder image builds.
 *
 * This class is adapted from AWS CDK's BaseImage class to support both string and object inputs.
 */
export class BaseImage {
  /**
     * Create a BaseImage from a string or object input.
     *
     * @param input Either a string (AMI ID, Image Builder ARN, SSM parameter, or Marketplace product ID)
     *              or an object with properties specifying the base image
     */
  public static from(input: BaseImageInput): BaseImage {
    if (typeof input === 'string') {
      // Input is a string - use it directly
      return new BaseImage(input);
    } else {
      // Input is an object - detect which property is set
      if (input.amiId) {
        return BaseImage.fromAmiId(input.amiId);
      } else if (input.imageArn) {
        return BaseImage.fromString(input.imageArn);
      } else if (input.image) {
        return BaseImage.fromImage(input.image);
      } else if (input.marketplaceProductId) {
        return BaseImage.fromMarketplaceProductId(input.marketplaceProductId);
      } else if (input.ssmParameter) {
        return BaseImage.fromSsmParameter(input.ssmParameter);
      } else if (input.ssmParameterName) {
        return BaseImage.fromSsmParameterName(input.ssmParameterName);
      } else if (input.stringValue) {
        return BaseImage.fromString(input.stringValue);
      } else {
        throw new Error('BaseImageProps must have at least one property set');
      }
    }
  }

  /**
     * The AMI ID to use as a base image in an image recipe
     *
     * @param amiId The AMI ID to use as the base image
     */
  public static fromAmiId(amiId: string): BaseImage {
    return new BaseImage(amiId);
  }

  /**
     * The EC2 Image Builder image to use as a base image in an image recipe
     *
     * @param image The EC2 Image Builder image to use as a base image
     */
  public static fromImage(image: IImage): BaseImage {
    return new BaseImage(image.imageArn);
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
 * Properties for specifying a base container image as an object.
 */
export interface BaseContainerImageProps {
  /**
     * The DockerHub repository where the base image resides
     */
  readonly dockerHubRepository?: string;

  /**
     * The tag of the base image in the DockerHub repository
     */
  readonly dockerHubTag?: string;

  /**
     * The ECR repository where the base image resides
     */
  readonly ecrRepository?: ecr.IRepository;

  /**
     * The tag of the base image in the ECR repository
     */
  readonly ecrTag?: string;

  /**
     * The alias of the ECR public registry where the base image resides
     */
  readonly ecrPublicRegistryAlias?: string;

  /**
     * The name of the ECR public repository where the base image resides
     */
  readonly ecrPublicRepositoryName?: string;

  /**
     * The tag of the base image in the ECR public repository
     */
  readonly ecrPublicTag?: string;

  /**
     * The EC2 Image Builder image to use as a base image
     */
  readonly image?: IImage;

  /**
     * The direct string value of the base image (ECR/ECR public image URI, DockerHub image, or Image Builder ARN)
     */
  readonly stringValue?: string;
}

/**
 * Type that can be used to specify a base container image - either a string or an object with properties.
 */
export type BaseContainerImageInput = string | BaseContainerImageProps;

/**
 * Represents a base container image that is used to start from in EC2 Image Builder container builds.
 *
 * This class is adapted from AWS CDK's BaseContainerImage class to support both string and object inputs.
 */
export class BaseContainerImage {
  /**
     * Create a BaseContainerImage from a string or object input.
     *
     * @param input Either a string (ECR/ECR public image URI, DockerHub image, or Image Builder ARN)
     *              or an object with properties specifying the base image
     */
  public static from(input: BaseContainerImageInput): BaseContainerImage {
    if (typeof input === 'string') {
      // Input is a string - use it directly
      return new BaseContainerImage(input);
    } else {
      // Input is an object - detect which property is set
      if (input.dockerHubRepository && input.dockerHubTag) {
        return BaseContainerImage.fromDockerHub(input.dockerHubRepository, input.dockerHubTag);
      } else if (input.ecrRepository && input.ecrTag) {
        return BaseContainerImage.fromEcr(input.ecrRepository, input.ecrTag);
      } else if (input.ecrPublicRegistryAlias && input.ecrPublicRepositoryName && input.ecrPublicTag) {
        return BaseContainerImage.fromEcrPublic(input.ecrPublicRegistryAlias, input.ecrPublicRepositoryName, input.ecrPublicTag);
      } else if (input.image) {
        return BaseContainerImage.fromImage(input.image);
      } else if (input.stringValue) {
        return BaseContainerImage.fromString(input.stringValue);
      } else {
        throw new Error('BaseContainerImageProps must have at least one property set');
      }
    }
  }

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
     * The EC2 Image Builder image to use as a base image in a container recipe
     *
     * @param image The EC2 Image Builder image to use as a base image
     */
  public static fromImage(image: IImage): BaseContainerImage {
    return new BaseContainerImage(image.imageArn);
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
