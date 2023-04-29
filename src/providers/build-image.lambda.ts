import * as AWSLambda from 'aws-lambda';
import * as AWS from 'aws-sdk';
import { customResourceRespond } from '../lambda-helpers';

const codebuild = new AWS.CodeBuild();
const ecr = new AWS.ECR();
const ib = new AWS.Imagebuilder();


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
        await codebuild.startBuild({
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
        }).promise();
        break;
      case 'Delete':
        const ecrImages = await ecr.listImages({ repositoryName: repoName, maxResults: 100 }).promise();
        if (ecrImages.imageIds && ecrImages.imageIds.length > 0) {
          await ecr.batchDeleteImage({
            imageIds: ecrImages.imageIds.map(i => {
              return { imageDigest: i.imageDigest };
            }),
            repositoryName: repoName,
          }).promise();
        }
        if (ibName) {
          const ibImages = await ib.listImages({ filters: [{ name: 'name', values: [ibName] }] }).promise();
          if (ibImages.imageVersionList) {
            for (const v of ibImages.imageVersionList) {
              if (v.arn) {
                const ibImageVersions = await ib.listImageBuildVersions({ imageVersionArn: v.arn }).promise();
                if (ibImageVersions.imageSummaryList) {
                  for (const vs of ibImageVersions.imageSummaryList) {
                    if (vs.arn) {
                      console.log(`Deleting ${vs.arn}`);
                      await ib.deleteImage({ imageBuildVersionArn: vs.arn }).promise();
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
