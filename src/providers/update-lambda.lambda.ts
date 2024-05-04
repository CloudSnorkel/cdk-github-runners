import { LambdaClient, UpdateFunctionCodeCommand, ResourceConflictException } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient();

interface Input {
  readonly lambdaName: string;
  readonly repositoryUri: string;
  readonly repositoryTag: string;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function handler(event: Input) {
  console.log(event);

  while (true) {
    try {
      await lambda.send(new UpdateFunctionCodeCommand({
        FunctionName: event.lambdaName,
        ImageUri: `${event.repositoryUri}:${event.repositoryTag}`,
        Publish: true,
      }));
      break;
    } catch (e) {
      if (e instanceof ResourceConflictException) {
        // keep trying if function is already being updated by CloudFormation
        // this can happen if we update some settings on the function and the image code at the same time
        await sleep(10000);
      } else {
        throw e;
      }
    }
  }
}
