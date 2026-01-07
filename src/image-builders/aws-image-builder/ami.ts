import * as cdk from 'aws-cdk-lib';
import { Annotations, aws_imagebuilder as imagebuilder } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ImageBuilderComponent } from './builder';
import { amiRootDevice, Architecture, Os } from '../../providers';
import { BaseImage, BaseImageInput } from './base-image';
import { uniqueImageBuilderName } from '../common';

/**
 * Properties for AmiRecipe construct.
 *
 * @internal
 */
interface AmiRecipeProperties {
  /**
   * Target platform. Must match builder platform.
   */
  readonly platform: 'Linux' | 'Windows';

  /**
   * Target architecture. Must match builder platform.
   */
  readonly architecture: Architecture;

  /**
   * Base AMI to use for the new runner AMI.
   * 
   * Can be a string (AMI ID, Image Builder ARN, SSM parameter, or Marketplace product ID)
   * or an object with properties specifying the base image.
   */
  readonly baseAmi: BaseImageInput;

  /**
   * Storage size for the builder.
   */
  readonly storageSize?: cdk.Size;

  /**
   * Components to add to target container image.
   */
  readonly components: ImageBuilderComponent[];

  /**
   * Tags to apply to the recipe and image.
   */
  readonly tags: { [key: string]: string };
}

/**
 * Image builder recipe for Amazon Machine Image (AMI).
 *
 * @internal
 */
export class AmiRecipe extends cdk.Resource {
  public readonly arn: string;
  public readonly name: string;
  public readonly version: string;

  constructor(scope: Construct, id: string, props: AmiRecipeProperties) {
    super(scope, id);

    // Warn if using deprecated string format
    if (typeof props.baseAmi === 'string') {
      Annotations.of(scope).addWarning(
        'Passing baseAmi as a string is deprecated. Please use BaseImage static factory methods instead, e.g., BaseImage.fromAmiId("ami-12345") or BaseImage.fromString("arn:aws:...")'
      );
    }

    // Convert BaseImageInput to BaseImage
    const baseImage = BaseImage.from(props.baseAmi);

    let components = props.components.map(component => {
      return {
        componentArn: component.arn,
      };
    });

    const blockDeviceMappings = props.storageSize ? [
      {
        deviceName: amiRootDevice(this, baseImage.image).ref,
        ebs: {
          volumeSize: props.storageSize.toGibibytes(),
          deleteOnTermination: true,
        },
      },
    ] : undefined;

    this.name = uniqueImageBuilderName(this);

    let workingDirectory;
    if (props.platform == 'Linux') {
      workingDirectory = '/home/runner';
    } else if (props.platform == 'Windows') {
      workingDirectory = 'C:/'; // must exist or Image Builder fails and must not be empty or git will stall installing from the default windows\system32
    } else {
      throw new Error(`Unsupported AMI recipe platform: ${props.platform}`);
    }

    const recipe = new imagebuilder.CfnImageRecipe(this, 'Recipe', {
      name: this.name,
      version: '1.0.x',
      parentImage: baseImage.image,
      components,
      workingDirectory,
      tags: props.tags,
      blockDeviceMappings,
    });

    this.arn = recipe.attrArn;
    this.version = recipe.getAtt('Version', cdk.ResolutionTypeHint.STRING).toString();
  }
}

/**
 * Default base AMI for given OS and architecture.
 *
 * @internal
 */
export function defaultBaseAmi(scope: Construct, os: Os, architecture: Architecture) {
  const stack = cdk.Stack.of(scope);

  let arch;
  if (architecture.is(Architecture.X86_64)) {
    arch = 'x86';
  } else if (architecture.is(Architecture.ARM64)) {
    arch = 'arm64';
  } else {
    throw new Error(`Unsupported architecture for base AMI: ${architecture.name}`);
  }

  if (os.is(Os.LINUX_UBUNTU) || os.is(Os.LINUX_UBUNTU_2204) || os.is(Os.LINUX)) {
    return stack.formatArn({
      service: 'imagebuilder',
      resource: 'image',
      account: 'aws',
      resourceName: `ubuntu-server-22-lts-${arch}/x.x.x`,
    });
  }

  if (os.is(Os.LINUX_UBUNTU_2404)) {
    return stack.formatArn({
      service: 'imagebuilder',
      resource: 'image',
      account: 'aws',
      resourceName: `ubuntu-server-24-lts-${arch}/x.x.x`,
    });
  }

  if (os.is(Os.LINUX_AMAZON_2)) {
    return stack.formatArn({
      service: 'imagebuilder',
      resource: 'image',
      account: 'aws',
      resourceName: `amazon-linux-2-${arch}/x.x.x`,
    });
  }

  if (os.is(Os.LINUX_AMAZON_2023)) {
    return stack.formatArn({
      service: 'imagebuilder',
      resource: 'image',
      account: 'aws',
      resourceName: `amazon-linux-2023-${arch}/x.x.x`,
    });
  }

  if (os.is(Os.WINDOWS)) {
    return stack.formatArn({
      service: 'imagebuilder',
      resource: 'image',
      account: 'aws',
      resourceName: `windows-server-2022-english-full-base-${arch}/x.x.x`,
    });
  }

  throw new Error(`OS ${os.name} not supported for AMI runner image`);
}

