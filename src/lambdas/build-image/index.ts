/* eslint-disable-next-line import/no-extraneous-dependencies,import/no-unresolved */
import * as AWSLambda from 'aws-lambda';
/* eslint-disable-next-line import/no-extraneous-dependencies */
import * as AWS from 'aws-sdk';
import { customResourceRespond } from '../helpers';

const codebuild = new AWS.CodeBuild();
const ecr = new AWS.ECR();
const ib = new AWS.Imagebuilder();


/* eslint-disable @typescript-eslint/no-require-imports, import/no-extraneous-dependencies */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent, context: AWSLambda.Context) {
  try {
    console.log(JSON.stringify(event));

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
        const images = await ecr.listImages({ repositoryName: repoName, maxResults: 100 }).promise();
        if (images.imageIds && images.imageIds.length > 0) {
          await ecr.batchDeleteImage({
            imageIds: images.imageIds.map(i => {
              return { imageDigest: i.imageDigest };
            }),
            repositoryName: repoName,
          }).promise();
        }
        if (ibName) {
          const images = await ib.listImages({filters: [{name:'name', values:[ibName]}]}).promise();
          if (images.imageVersionList) {
            for (const v of images.imageVersionList) {
              if (v.arn) {
                const imageVersions = await ib.listImageBuildVersions({imageVersionArn: v.arn}).promise();
                if (imageVersions.imageSummaryList) {
                  for (const vs of imageVersions.imageSummaryList) {
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
