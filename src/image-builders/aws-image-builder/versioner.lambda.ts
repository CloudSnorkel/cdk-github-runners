import * as AWSLambda from 'aws-lambda';
import * as AWS from 'aws-sdk';
import { inc, maxSatisfying } from 'semver';
import { customResourceRespond } from '../../lambda-helpers';

const ib = new AWS.Imagebuilder();

/**
 * Exported for unit tests.
 * @internal
 */
export function increaseVersion(allVersions: string[]) {
  let version = maxSatisfying(allVersions, '>=0.0.0');
  if (version === null) {
    version = '1.0.0';
  }
  console.log(`Found versions ${allVersions} -- latest is ${version}`);

  version = inc(version, 'patch');
  if (version === null) {
    throw new Error('Unable to bump version');
  }

  return version;
}

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent, context: AWSLambda.Context) {
  console.log(JSON.stringify({ ...event, ResponseURL: '...' }));

  try {
    const objectType = event.ResourceProperties.ObjectType;
    const objectName = event.ResourceProperties.ObjectName;

    switch (event.RequestType) {
      case 'Create':
      case 'Update':
        let allVersions: string[] = [];
        try {
          switch (objectType) {
            case 'Component': {
              let result: AWS.Imagebuilder.ListComponentsResponse = {};
              do {
                result = await ib.listComponents({
                  filters: [{
                    name: 'name',
                    values: [objectName],
                  }],
                  nextToken: result.nextToken,
                }).promise();
                allVersions = allVersions.concat(result.componentVersionList!.map(i => i.version || '1.0.0'));
              } while (result.nextToken);
              break;
            }
            case 'ImageRecipe': {
              let result: AWS.Imagebuilder.ListImageRecipesResponse = {};
              do {
                result = await ib.listImageRecipes({
                  filters: [{
                    name: 'name',
                    values: [objectName],
                  }],
                  nextToken: result.nextToken,
                }).promise();
                allVersions = allVersions.concat(result.imageRecipeSummaryList!.map(i => i.arn?.split('/').pop() || '1.0.0'));
              } while (result.nextToken);
              break;
            }
            case 'ContainerRecipe': {
              let result: AWS.Imagebuilder.ListContainerRecipesResponse = {};
              do {
                result = await ib.listContainerRecipes({
                  filters: [{
                    name: 'name',
                    values: [objectName],
                  }],
                  nextToken: result.nextToken,
                }).promise();
                allVersions = allVersions.concat(result.containerRecipeSummaryList!.map(i => i.arn?.split('/').pop() || '1.0.0'));
              } while (result.nextToken);
              break;
            }
          }
        } catch (e) {
          if ((e as any).code !== 'ResourceNotFoundException') {
            throw e;
          } else {
            console.log('Resource not found, assuming first version');
          }
        }

        const version = increaseVersion(allVersions);
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
