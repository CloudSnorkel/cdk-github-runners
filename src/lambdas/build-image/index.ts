/* eslint-disable-next-line import/no-extraneous-dependencies,import/no-unresolved */
import * as AWSLambda from 'aws-lambda';
/* eslint-disable-next-line import/no-extraneous-dependencies */
import * as AWS from 'aws-sdk';

const codebuild = new AWS.CodeBuild();
const ecr = new AWS.ECR();


/* eslint-disable @typescript-eslint/no-require-imports, import/no-extraneous-dependencies */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent, context: AWSLambda.Context) {
  try {
    console.log(JSON.stringify(event));

    const repoName = event.ResourceProperties.RepoName;
    const projectName = event.ResourceProperties.ProjectName;

    // let physicalResourceId: string;
    // let data: { [key: string]: string } = {};

    switch (event.RequestType) {
      case 'Create':
      case 'Update':
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
        await respond('SUCCESS', 'OK', event.PhysicalResourceId, {});
        break;
    }
  } catch (e) {
    console.log(e);
    await respond('FAILED', (e as Error).message || 'Internal Error', context.logStreamName, {});
  }

  function respond(responseStatus: string, reason: string, physicalResourceId: string, data: any) {
    const responseBody = JSON.stringify({
      Status: responseStatus,
      Reason: reason,
      PhysicalResourceId: physicalResourceId,
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      NoEcho: false,
      Data: data,
    });

    console.log('Responding', responseBody);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const parsedUrl = require('url').parse(event.ResponseURL);
    const requestOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.path,
      method: 'PUT',
      headers: {
        'content-type': '',
        'content-length': responseBody.length,
      },
    };

    return new Promise((resolve, reject) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const request = require('https').request(requestOptions, resolve);
        request.on('error', reject);
        request.write(responseBody);
        request.end();
      } catch (e) {
        reject(e);
      }
    });
  }
}
