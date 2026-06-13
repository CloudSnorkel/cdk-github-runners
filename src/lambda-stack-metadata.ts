import { CloudFormationClient, DescribeStackResourceCommand } from '@aws-sdk/client-cloudformation';

const cfn = new CloudFormationClient();

/**
 * Read a metadata value attached to this Lambda function's CloudFormation resource. The resource is located with
 * the STACK_NAME and LOGICAL_ID environment variables set by the CDK code that created the function.
 *
 * Used for values that can grow past the 4KB Lambda environment variables limit, like the providers map.
 *
 * @internal
 */
export async function getOwnResourceMetadata<T>(key: string): Promise<T | undefined> {
  const resource = await cfn.send(new DescribeStackResourceCommand({
    StackName: process.env.STACK_NAME,
    LogicalResourceId: process.env.LOGICAL_ID,
  }));
  return JSON.parse(resource.StackResourceDetail?.Metadata ?? '{}')[key];
}
