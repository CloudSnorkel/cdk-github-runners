import { CodeBuildClient, StartBuildCommand } from '@aws-sdk/client-codebuild';
import {
  DeleteImageCommand,
  ImagebuilderClient,
  ListImageBuildVersionsCommand,
  ListImagesCommand as ListIbImagesCommand,
} from '@aws-sdk/client-imagebuilder';
import * as AWSLambda from 'aws-lambda';
import { customResourceRespond } from '../lambda-helpers';

const codebuild = new CodeBuildClient();
const ib = new ImagebuilderClient();

/**
 * @internal
 */
export interface BuildImageFunctionProperties {
  ServiceToken: string;
  DeleteOnly?: boolean;
  RepoName: string;
  ProjectName: string;
  ImageBuilderName?: string;
  WaitHandle?: string;
}

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent, context: AWSLambda.Context) {
  try {
    console.log(JSON.stringify({ ...event, ResponseURL: '...' }));

    const props = event.ResourceProperties as BuildImageFunctionProperties;

    switch (event.RequestType) {
      case 'Create':
      case 'Update':
        if (props.DeleteOnly) {
          await customResourceRespond(event, 'SUCCESS', 'OK', 'Deleter', {});
          break;
        }

        console.log(`Starting CodeBuild project ${props.ProjectName}`);
        const cbRes = await codebuild.send(new StartBuildCommand({
          projectName: props.ProjectName,
          environmentVariablesOverride: [
            {
              type: 'PLAINTEXT',
              name: 'WAIT_HANDLE',
              value: props.WaitHandle!,
            },
          ],
        }));
        await customResourceRespond(event, 'SUCCESS', 'OK', cbRes.build?.id ?? 'build', {});
        break;
      case 'Delete':
        if (props.ImageBuilderName) {
          const ibImages = await ib.send(new ListIbImagesCommand({ filters: [{ name: 'name', values: [props.ImageBuilderName] }] }));
          if (ibImages.imageVersionList) {
            for (const v of ibImages.imageVersionList) {
              if (v.arn) {
                const ibImageVersions = await ib.send(new ListImageBuildVersionsCommand({ imageVersionArn: v.arn }));
                if (ibImageVersions.imageSummaryList) {
                  for (const vs of ibImageVersions.imageSummaryList) {
                    if (vs.arn) {
                      console.log(`Deleting ${vs.arn}`);
                      await ib.send(new DeleteImageCommand({ imageBuildVersionArn: vs.arn }));
                    }
                  }
                }
              }
            }
          }
        }
        await customResourceRespond(event, 'SUCCESS', 'OK', event.PhysicalResourceId, {});
        break;
    }
  } catch (e) {
    console.error(e);
    await customResourceRespond(event, 'FAILED', (e as Error).message || 'Internal Error', context.logStreamName, {});
  }
}
