import * as cdk from 'aws-cdk-lib';
import { aws_iam as iam, aws_lambda as lambda, CustomResource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { VersionerFunction } from './versioner-function';
import { singletonLambda, singletonLogGroup, SingletonLogType } from '../../utils';

/**
 * @internal
 */
export abstract class ImageBuilderObjectBase extends cdk.Resource {
  protected constructor(scope: Construct, id: string) {
    super(scope, id);
  }

  protected generateVersion(type: 'Component' | 'ImageRecipe' | 'ContainerRecipe' | 'Workflow', name: string, data: any): string {
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

  private versionFunction(): VersionerFunction {
    return singletonLambda(VersionerFunction, this, 'aws-image-builder-versioner', {
      description: 'Custom resource handler that bumps up Image Builder versions',
      initialPolicy: [
        new iam.PolicyStatement({
          actions: [
            'imagebuilder:ListComponents',
            'imagebuilder:ListContainerRecipes',
            'imagebuilder:ListImageRecipes',
            'imagebuilder:ListWorkflows',
          ],
          resources: ['*'],
        }),
      ],
      logGroup: singletonLogGroup(this, SingletonLogType.RUNNER_IMAGE_BUILD),
      logFormat: lambda.LogFormat.JSON,
      timeout: cdk.Duration.minutes(5),
    });
  }
}

