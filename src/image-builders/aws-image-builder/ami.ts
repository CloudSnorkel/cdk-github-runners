import * as cdk from 'aws-cdk-lib';
import { aws_imagebuilder as imagebuilder } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ImageBuilderComponent } from './builder';
import { ImageBuilderObjectBase } from './common';
import { amiRootDevice, Architecture, Os } from '../../providers';
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
   */
  readonly baseAmi: string;

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
export class AmiRecipe extends ImageBuilderObjectBase {
  public readonly arn: string;
  public readonly name: string;
  public readonly version: string;

  constructor(scope: Construct, id: string, props: AmiRecipeProperties) {
    super(scope, id);

    let components = props.components.map(component => {
      return {
        componentArn: component.arn,
      };
    });

    const blockDeviceMappings = props.storageSize ? [
      {
        deviceName: amiRootDevice(this, props.baseAmi).ref,
        ebs: {
          volumeSize: props.storageSize.toGibibytes(),
          deleteOnTermination: true,
        },
      },
    ] : undefined;

    this.name = uniqueImageBuilderName(this);
    this.version = this.generateVersion('ImageRecipe', this.name, {
      platform: props.platform,
      components,
      parentAmi: props.baseAmi,
      tags: props.tags,
      blockDeviceMappings,
    });

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
      version: this.version,
      parentImage: props.baseAmi,
      components,
      workingDirectory,
      tags: props.tags,
      blockDeviceMappings,
    });

    this.arn = recipe.attrArn;
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

  if (os.is(Os.LINUX_UBUNTU) || os.is(Os.LINUX)) {
    return stack.formatArn({
      service: 'imagebuilder',
      resource: 'image',
      account: 'aws',
      resourceName: `ubuntu-server-22-lts-${arch}/x.x.x`,
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

