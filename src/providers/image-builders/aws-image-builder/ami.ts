import { aws_ec2 as ec2, aws_imagebuilder as imagebuilder } from 'aws-cdk-lib';
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
export function defaultBaseAmi(os: Os, architecture: Architecture) {
  let archUrl;
  let cpuType;
  if (architecture.is(Architecture.X86_64)) {
    archUrl = 'amd64';
    cpuType = ec2.AmazonLinuxCpuType.X86_64;
  } else if (architecture.is(Architecture.ARM64)) {
    archUrl = 'arm64';
    cpuType = ec2.AmazonLinuxCpuType.ARM_64;
  } else {
    throw new Error(`Unsupported architecture for base AMI: ${architecture.name}`);
  }

  if (os.is(Os.LINUX_UBUNTU) || os.is(Os.LINUX)) {
    return ec2.MachineImage.fromSsmParameter(
      `/aws/service/canonical/ubuntu/server/focal/stable/current/${archUrl}/hvm/ebs-gp2/ami-id`,
      {
        os: ec2.OperatingSystemType.LINUX,
      },
    );
  }

  if (os.is(Os.LINUX_AMAZON_2)) {
    return ec2.MachineImage.latestAmazonLinux({ cpuType });
  }

  if (os.is(Os.WINDOWS)) {
    return ec2.MachineImage.latestWindows(ec2.WindowsVersion.WINDOWS_SERVER_2022_ENGLISH_FULL_CONTAINERSLATEST);
  }

  throw new Error(`OS ${os.name} not supported for AMI runner image`);
}

