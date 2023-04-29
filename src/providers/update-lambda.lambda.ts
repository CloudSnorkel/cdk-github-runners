import * as AWS from 'aws-sdk';
import { AWSError } from 'aws-sdk/lib/error';

const lambda = new AWS.Lambda();

interface Input {
  readonly lambdaName: string;
  readonly repositoryUri: string;
  readonly repositoryTag: string;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function handler(event: Input) {
  console.log(JSON.stringify(event));

  while (true) {
    try {
      await lambda.updateFunctionCode({
        FunctionName: event.lambdaName,
        ImageUri: `${event.repositoryUri}:${event.repositoryTag}`,
        Publish: true,
      }).promise();
      break;
    } catch (e) {
      if ((<AWSError>e).code == 'ResourceConflictException') {
        // keep trying if function is already being updated by CloudFormation
        // this can happen if we update some settings on the function and the image code at the same time
        await sleep(10000);
      } else {
        throw e;
      }
    }
  }
}
