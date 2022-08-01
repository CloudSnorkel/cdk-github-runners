/* eslint-disable-next-line import/no-extraneous-dependencies,import/no-unresolved */
import * as AWSLambda from 'aws-lambda';
/* eslint-disable import/no-extraneous-dependencies */
import * as AWS from 'aws-sdk';
import { inc, maxSatisfying } from 'semver';
import { customResourceRespond } from '../helpers';

const ib = new AWS.Imagebuilder();

/* eslint-disable @typescript-eslint/no-require-imports, import/no-extraneous-dependencies */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent, context: AWSLambda.Context) {
  try {
    const objectType = event.ResourceProperties.ObjectType;
    const objectName = event.ResourceProperties.ObjectName;

    switch (event.RequestType) {
      case 'Create':
      case 'Update':
        let version: string | null = '1.0.0';
        let allVersions: string[] = [];
        try {
          switch (objectType) {
            case 'Component': {
              const result = await ib.listComponents({
                filters: [{
                  name: 'name',
                  values: [objectName],
                }],
              }).promise();
              allVersions = result.componentVersionList!.map(i => i.version || '1.0.0');
              break;
            }
            case 'ImageRecipe': {
              const result = await ib.listImageRecipes({
                filters: [{
                  name: 'name',
                  values: [objectName],
                }],
              }).promise();
              allVersions = result.imageRecipeSummaryList!.map(i => i.arn?.split('/').pop() || '1.0.0');
              break;
            }
            case 'ContainerRecipe': {
              const result = await ib.listContainerRecipes({
                filters: [{
                  name: 'name',
                  values: [objectName],
                }],
              }).promise();
              allVersions = result.containerRecipeSummaryList!.map(i => i.arn?.split('/').pop() || '1.0.0');
              break;
            }
          }
        } catch (e: any) {
          if (e.code !== 'ResourceNotFoundException') {
            throw e;
          }
        }

        version = maxSatisfying(allVersions, '>=0.0.0');
        if (version === null) {
          version = '1.0.0';
        }
        version = inc(version, 'patch');
        if (version === null) {
          throw new Error('Unable to bump version');
        }
        await customResourceRespond(event, 'SUCCESS', 'OK', version, {});

        break;
      case 'Delete':
        await customResourceRespond(event, 'SUCCESS', 'OK', event.PhysicalResourceId, {});
        break;
    }
  } catch (e) {
    console.log(e);
    await customResourceRespond(event, 'FAILED', (e as Error).message || 'Internal Error', context.logStreamName, {});
  }
}
