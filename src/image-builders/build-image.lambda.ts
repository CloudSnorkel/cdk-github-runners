import { CodeBuildClient, StartBuildCommand } from '@aws-sdk/client-codebuild';
import * as AWSLambda from 'aws-lambda';
import { customResourceRespond } from '../lambda-helpers';

const codebuild = new CodeBuildClient();

/**
 * @internal
 */
export interface BuildImageFunctionProperties {
  ServiceToken: string;
  RepoName: string;
  ProjectName: string;
  WaitHandle: string;
}

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent, context: AWSLambda.Context) {
  try {
    console.log({ ...event, ResponseURL: '...' });

    const props = event.ResourceProperties as BuildImageFunctionProperties;

    switch (event.RequestType) {
      case 'Create':
      case 'Update':
        console.log(`Starting CodeBuild project ${props.ProjectName}`);
        const cbRes = await codebuild.send(new StartBuildCommand({
          projectName: props.ProjectName,
          environmentVariablesOverride: [
            {
              type: 'PLAINTEXT',
              name: 'WAIT_HANDLE',
              value: props.WaitHandle,
            },
          ],
        }));
        await customResourceRespond(event, 'SUCCESS', 'OK', cbRes.build?.id ?? 'build', {});
        break;
      case 'Delete':
        await customResourceRespond(event, 'SUCCESS', 'OK', event.PhysicalResourceId, {});
        break;
    }
  } catch (e) {
    console.error(e);
    await customResourceRespond(event, 'FAILED', (e as Error).message || 'Internal Error', context.logStreamName, {});
  }
}
