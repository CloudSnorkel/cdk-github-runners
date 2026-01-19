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
    console.log({
      notice: 'CloudFormation custom resource request',
      ...event,
      ResponseURL: '...',
    });

    const props = event.ResourceProperties as BuildImageFunctionProperties;

    switch (event.RequestType) {
      case 'Create':
      case 'Update':
        console.log({
          notice: 'Starting CodeBuild project',
          projectName: props.ProjectName,
          repoName: props.RepoName,
        });
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
    console.error({
      notice: 'Failed to start CodeBuild project',
      error: `${e}`,
    });
    await customResourceRespond(event, 'FAILED', (e as Error).message || 'Internal Error', context.logStreamName, {});
  }
}
