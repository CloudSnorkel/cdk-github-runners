/* eslint-disable-next-line import/no-extraneous-dependencies */
import * as AWS from 'aws-sdk';

const cfn = new AWS.CloudFormation();
const lambda = new AWS.Lambda();

interface Input {
  readonly lambdaName: string;
  readonly repositoryUri: string;
  readonly repositoryTag: string;
  readonly stackName: string;
}

export async function handler(event: Input) {
  console.log(event);

  const stacks = await cfn.describeStacks({
    StackName: event.stackName,
  }).promise();

  if (stacks.Stacks?.length != 1) {
    console.error(`Unable to find stack ${event.stackName}`);
    return;
  }

  if (stacks.Stacks[0].StackStatus.endsWith('_IN_PROGRESS')) {
    console.error(`Stack ${event.stackName} is already in progress, skipping Lambda update as the stack will do it for us. If we update here, it may conflict with the stack operation.`);
    return;
  }

  await lambda.updateFunctionCode({
    FunctionName: event.lambdaName,
    ImageUri: `${event.repositoryUri}:${event.repositoryTag}`,
    Publish: true,
  }).promise();
}
