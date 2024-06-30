import { aws_ecr as ecr, aws_imagebuilder as imagebuilder } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ImageBuilderComponent } from './builder';
import { ImageBuilderObjectBase } from './common';
import { Os } from '../../providers';
import { uniqueImageBuilderName } from '../common';

/**
 * Properties for ContainerRecipe construct.
 *
 * @internal
 */
export interface ContainerRecipeProperties {
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
   */
  readonly parentImage: string;

  /**
   * Tags to apply to the recipe and image.
   */
  readonly tags: { [key: string]: string };
}

/**
 * Image builder recipe for a Docker container image.
 *
 * @internal
 */
export class ContainerRecipe extends ImageBuilderObjectBase {
  public readonly arn: string;
  public readonly name: string;
  public readonly version: string;

  constructor(scope: Construct, id: string, props: ContainerRecipeProperties) {
    super(scope, id);

    let components = props.components.map(component => {
      return {
        componentArn: component.arn,
      };
    });

    this.name = uniqueImageBuilderName(this);
    this.version = this.generateVersion('ContainerRecipe', this.name, {
      platform: props.platform,
      components,
      dockerfileTemplate: props.dockerfileTemplate,
      tags: props.tags,
    });

    const recipe = new imagebuilder.CfnContainerRecipe(this, 'Recipe', {
      name: this.name,
      version: this.version,
      parentImage: props.parentImage,
      platformOverride: props.platform == 'Linux' ? 'Linux' : undefined,
      components,
      containerType: 'DOCKER',
      targetRepository: {
        service: 'ECR',
        repositoryName: props.targetRepository.repositoryName,
      },
      dockerfileTemplateData: props.dockerfileTemplate,
      tags: props.tags,
    });

    this.arn = recipe.attrArn;
  }
}

/**
 * Default base Docker image for given OS.
 *
 * @internal
 */
export function defaultBaseDockerImage(os: Os) {
  if (os.is(Os.WINDOWS)) {
    return 'mcr.microsoft.com/windows/servercore:ltsc2019-amd64';
  } else if (os.is(Os.LINUX_UBUNTU)) {
    return 'public.ecr.aws/lts/ubuntu:22.04';
  } else if (os.is(Os.LINUX_AMAZON_2)) {
    return 'public.ecr.aws/amazonlinux/amazonlinux:2';
  } else if (os.is(Os.LINUX_AMAZON_2023)) {
    return 'public.ecr.aws/amazonlinux/amazonlinux:2023';
  } else {
    throw new Error(`OS ${os.name} not supported for Docker runner image`);
  }
}

