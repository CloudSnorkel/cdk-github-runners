import * as cdk from 'aws-cdk-lib';
import { aws_imagebuilder as imagebuilder } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { ImageBuilderComponent } from './builder';
import { ImageBuilderObjectBase } from './common';
import { Architecture, Os } from '../../common';
import { uniqueImageBuilderName } from '../common';

/**
 * Properties for AmiRecipe construct.
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
   * Components to add to target container image.
   */
  readonly components: ImageBuilderComponent[];
}

/**
 * Image builder recipe for Amazon Machine Image (AMI).
 *
 * @internal
 */
export class AmiRecipe extends ImageBuilderObjectBase {
  public readonly arn: string;
  public readonly name: string;

  constructor(scope: Construct, id: string, props: AmiRecipeProperties) {
    super(scope, id);

    const name = uniqueImageBuilderName(this);

    let components = props.components.map(component => {
      return {
        componentArn: component.arn,
      };
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
      name: name,
      version: this.version('ImageRecipe', name, {
        platform: props.platform,
        components,
        parentAmi: props.baseAmi,
      }),
      parentImage: props.baseAmi,
      components,
      workingDirectory,
    });

    this.arn = recipe.attrArn;
    this.name = name;
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
      resourceName: `ubuntu-server-22-lts-${arch}`,
    });
  }

  if (os.is(Os.LINUX_AMAZON_2)) {
    return stack.formatArn({
      service: 'imagebuilder',
      resource: 'image',
      resourceName: `amazon-linux-2-${arch}`,
    });
  }

  if (os.is(Os.WINDOWS)) {
    return stack.formatArn({
      service: 'imagebuilder',
      resource: 'image',
      resourceName: `windows-server-2022-english-full-base-${arch}`,
    });
  }

  throw new Error(`OS ${os.name} not supported for AMI runner image`);
}

