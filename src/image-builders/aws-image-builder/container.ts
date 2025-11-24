import * as imagebuilder2 from '@aws-cdk/aws-imagebuilder-alpha';
import * as cdk from 'aws-cdk-lib';
import { aws_ecr as ecr } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ImageBuilderComponent } from './builder';
import { Os } from '../../providers';

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
export class ContainerRecipe extends cdk.Resource {
  public readonly arn: string;
  public readonly name: string;
  public readonly version: string;

  constructor(scope: Construct, id: string, props: ContainerRecipeProperties) {
    super(scope, id);

    const recipe = new imagebuilder2.ContainerRecipe(this, 'Recipe', {
      baseImage: imagebuilder2.BaseContainerImage.fromString(props.parentImage),
      osVersion: props.platform == 'Linux' ? imagebuilder2.OSVersion.LINUX : undefined,
      components: props.components.map(c => {
        return { component: c.component };
      }),
      // containerType: 'DOCKER',
      targetRepository: imagebuilder2.Repository.fromEcr(props.targetRepository),
      dockerfile: imagebuilder2.DockerfileData.fromInline(props.dockerfileTemplate),
      tags: props.tags,
    });

    this.arn = recipe.containerRecipeArn;
    this.name = recipe.containerRecipeName;
    this.version = recipe.containerRecipeVersion;
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
  } else if (os.is(Os.LINUX_UBUNTU) || os.is(Os.LINUX_UBUNTU_2204)) {
    return 'public.ecr.aws/lts/ubuntu:22.04';
  } else if (os.is(Os.LINUX_UBUNTU_2404)) {
    return 'public.ecr.aws/lts/ubuntu:24.04';
  } else if (os.is(Os.LINUX_AMAZON_2)) {
    return 'public.ecr.aws/amazonlinux/amazonlinux:2';
  } else if (os.is(Os.LINUX_AMAZON_2023)) {
    return 'public.ecr.aws/amazonlinux/amazonlinux:2023';
  } else {
    throw new Error(`OS ${os.name} not supported for Docker runner image`);
  }
}

