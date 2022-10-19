import * as cdk from 'aws-cdk-lib';
import { aws_iam as iam, aws_imagebuilder as imagebuilder, aws_s3_assets as s3_assets, CustomResource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BundledNodejsFunction } from '../../utils';

/**
 * @internal
 */
export function uniqueImageBuilderName(scope: Construct): string {
  return cdk.Names.uniqueResourceName(scope, { maxLength: 126, separator: '-', allowedSpecialCharacters: '_-' });
}

/**
 * @internal
 */
export abstract class ImageBuilderObjectBase extends cdk.Resource {
  protected constructor(scope: Construct, id: string) {
    super(scope, id);
  }

  protected version(type: 'Component' | 'ImageRecipe' | 'ContainerRecipe', name: string, data: any): string {
    return new CustomResource(this, 'Version', {
      serviceToken: this.versionFunction().functionArn,
      resourceType: `Custom::ImageBuilder-${type}-Version`,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // no point in deleting as it doesn't even create anything
      properties: {
        ObjectType: type,
        ObjectName: name,
        VersionedData: data, // get a new version every time something changes, like Image Builder wants
      },
    }).ref;
  }

  private versionFunction(): BundledNodejsFunction {
    return BundledNodejsFunction.singleton(this, 'aws-image-builder-versioner', {
      description: 'Custom resource handler that bumps up Image Builder versions',
      initialPolicy: [
        new iam.PolicyStatement({
          actions: [
            'imagebuilder:ListComponents',
            'imagebuilder:ListContainerRecipes',
            'imagebuilder:ListImageRecipes',
          ],
          resources: ['*'],
        }),
      ],
    });
  }
}

/**
 * An asset including file or directory to place inside the built image.
 */
export interface ImageBuilderAsset {
  /**
   * Path to place asset in the image.
   */
  readonly path: string;

  /**
   * Asset to place in the image.
   */
  readonly asset: s3_assets.Asset;
}

/**
 * Properties for ImageBuilderComponent construct.
 */
export interface ImageBuilderComponentProperties {
  /**
   * Component platform. Must match the builder platform.
   */
  readonly platform: 'Linux' | 'Windows';

  /**
   * Component display name.
   */
  readonly displayName: string;

  /**
   * Component description.
   */
  readonly description: string;

  /**
   * Shell commands to run when adding this component to the image.
   *
   * On Linux, these are bash commands. On Windows, there are PowerShell commands.
   */
  readonly commands: string[];

  /**
   * Optional assets to add to the built image.
   */
  readonly assets?: ImageBuilderAsset[];
}

/**
 * Components are a set of commands to run and optional files to add to an image. Components are the building blocks of images built by Image Builder.
 *
 * Example:
 *
 * ```
 * new ImageBuilderComponent(this, 'AWS CLI', {
 *   platform: 'Windows',
 *   displayName: 'AWS CLI',
 *   description: 'Install latest version of AWS CLI',
 *   commands: [
 *     '$ErrorActionPreference = \'Stop\'',
 *     'Start-Process msiexec.exe -Wait -ArgumentList \'/i https://awscli.amazonaws.com/AWSCLIV2.msi /qn\'',
 *   ],
 * }
 * ```
 */
export class ImageBuilderComponent extends ImageBuilderObjectBase {
  /**
   * Component ARN.
   */
  public readonly arn: string;

  /**
   * Supported platform for the component.
   */
  public readonly platform: 'Windows' | 'Linux';

  private readonly assets: s3_assets.Asset[] = [];

  constructor(scope: Construct, id: string, props: ImageBuilderComponentProperties) {
    super(scope, id);

    this.platform = props.platform;

    let steps: any[] = [];

    if (props.assets) {
      let inputs: any[] = [];
      let extractCommands: string[] = [];
      for (const asset of props.assets) {
        this.assets.push(asset.asset);

        if (asset.asset.isFile) {
          inputs.push({
            source: asset.asset.s3ObjectUrl,
            destination: asset.path,
          });
        } else if (asset.asset.isZipArchive) {
          inputs.push({
            source: asset.asset.s3ObjectUrl,
            destination: `${asset.path}.zip`,
          });
          if (props.platform === 'Windows') {
            extractCommands.push('$ErrorActionPreference = \'Stop\'');
            extractCommands.push(`Expand-Archive "${asset.path}.zip" -DestinationPath "${asset.path}"`);
            extractCommands.push(`del "${asset.path}.zip"`);
          } else {
            extractCommands.push(`unzip "${asset.path}.zip" -d "${asset.path}"`);
            extractCommands.push(`rm "${asset.path}.zip"`);
          }
        } else {
          throw new Error(`Unknown asset type: ${asset.asset}`);
        }
      }

      steps.push({
        name: 'Download',
        action: 'S3Download',
        inputs,
      });

      if (extractCommands.length > 0) {
        steps.push({
          name: 'Extract',
          action: props.platform === 'Linux' ? 'ExecuteBash' : 'ExecutePowerShell',
          inputs: {
            commands: extractCommands,
          },
        });
      }
    }

    steps.push({
      name: 'Run',
      action: props.platform === 'Linux' ? 'ExecuteBash' : 'ExecutePowerShell',
      inputs: {
        commands: props.commands,
      },
    });

    const data = {
      name: props.displayName,
      schemaVersion: '1.0',
      phases: [
        {
          name: 'build',
          steps,
        },
      ],
    };

    const name = uniqueImageBuilderName(this);
    const component = new imagebuilder.CfnComponent(this, 'Component', {
      name: name,
      description: props.description,
      platform: props.platform,
      version: this.version('Component', name, {
        platform: props.platform,
        data,
      }),
      data: JSON.stringify(data),
    });

    this.arn = component.attrArn;
  }

  /**
   * Grants read permissions to the principal on the assets buckets.
   *
   * @param grantee
   */
  grantAssetsRead(grantee: iam.IGrantable) {
    for (const asset of this.assets) {
      asset.grantRead(grantee);
    }
  }
}
