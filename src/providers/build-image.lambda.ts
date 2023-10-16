import { CodeBuildClient, StartBuildCommand } from '@aws-sdk/client-codebuild';
import { BatchDeleteImageCommand, ECRClient, ListImagesCommand as ListEcrImagesCommand } from '@aws-sdk/client-ecr';
import {
  DeleteImageCommand,
  ImagebuilderClient,
  ListImageBuildVersionsCommand,
  ListImagesCommand as ListIbImagesCommand,
} from '@aws-sdk/client-imagebuilder';
import * as AWSLambda from 'aws-lambda';
import { customResourceRespond } from '../lambda-helpers';

const codebuild = new CodeBuildClient();
const ecr = new ECRClient();
const ib = new ImagebuilderClient();


export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent, context: AWSLambda.Context) {
  try {
    console.log(JSON.stringify({ ...event, ResponseURL: '...' }));

    const deleteOnly = event.ResourceProperties.DeleteOnly as boolean | undefined;
    const repoName = event.ResourceProperties.RepoName;
    const projectName = event.ResourceProperties.ProjectName;
    const ibName = event.ResourceProperties.ImageBuilderName as string | undefined;

    // let physicalResourceId: string;
    // let data: { [key: string]: string } = {};

    switch (event.RequestType) {
      case 'Create':
      case 'Update':
        if (deleteOnly) {
          await customResourceRespond(event, 'SUCCESS', 'OK', 'Deleter', {});
          break;
        }

        console.log(`Starting CodeBuild project ${projectName}`);
        await codebuild.send(new StartBuildCommand({
          projectName,
          environmentVariablesOverride: [
            {
              type: 'PLAINTEXT',
              name: 'STACK_ID',
              value: event.StackId,
            },
            {
              type: 'PLAINTEXT',
              name: 'REQUEST_ID',
              value: event.RequestId,
            },
            {
              type: 'PLAINTEXT',
              name: 'LOGICAL_RESOURCE_ID',
              value: event.LogicalResourceId,
            },
            {
              type: 'PLAINTEXT',
              name: 'RESPONSE_URL',
              value: event.ResponseURL,
            },
          ],
        }));
        break;
      case 'Delete':
        const ecrImages = await ecr.send(new ListEcrImagesCommand({ repositoryName: repoName, maxResults: 100 }));
        if (ecrImages.imageIds && ecrImages.imageIds.length > 0) {
          await ecr.send(new BatchDeleteImageCommand({
            imageIds: ecrImages.imageIds.map(i => {
              return { imageDigest: i.imageDigest };
            }),
            repositoryName: repoName,
          }));
        }
        if (ibName) {
          const ibImages = await ib.send(new ListIbImagesCommand({ filters: [{ name: 'name', values: [ibName] }] }));
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
