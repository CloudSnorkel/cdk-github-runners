import { aws_iam as iam, aws_lambda as lambda } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * @internal
 */
export function singletonLambda<FunctionType extends lambda.Function>(
  functionType: new (s: Construct, i: string, p?: lambda.FunctionOptions) => FunctionType,
  scope: Construct, id: string, props?: lambda.FunctionOptions): FunctionType {

  const constructName = `${id}-dcc036c8-876b-451e-a2c1-552f9e06e9e1`;
  const existing = cdk.Stack.of(scope).node.tryFindChild(constructName);
  if (existing) {
    // Just assume this is true
    return existing as FunctionType;
  }

  return new functionType(cdk.Stack.of(scope), constructName, props);
}

/**
 * The absolute minimum permissions required for SSM Session Manager to work. Unlike `AmazonSSMManagedInstanceCore`, it doesn't give permission to read all SSM parameters.
 *
 * @internal
 */
export const MINIMAL_SSM_SESSION_MANAGER_POLICY_STATEMENT = new iam.PolicyStatement({
  actions: [
    'ssmmessages:CreateControlChannel',
    'ssmmessages:CreateDataChannel',
    'ssmmessages:OpenControlChannel',
    'ssmmessages:OpenDataChannel',
  ],
  resources: ['*'],
});

/**
 * The absolute minimum permissions required for SSM Session Manager on ECS to work. Unlike `AmazonSSMManagedInstanceCore`, it doesn't give permission to read all SSM parameters.
 *
 * @internal
 */
export const MINIMAL_ECS_SSM_SESSION_MANAGER_POLICY_STATEMENT = new iam.PolicyStatement({
  actions: [
    'ssmmessages:CreateControlChannel',
    'ssmmessages:CreateDataChannel',
    'ssmmessages:OpenControlChannel',
    'ssmmessages:OpenDataChannel',
    's3:GetEncryptionConfiguration',
  ],
  resources: ['*'],
});

/**
 * The absolute minimum permissions required for SSM Session Manager on EC2 to work. Unlike `AmazonSSMManagedInstanceCore`, it doesn't give permission to read all SSM parameters.
 *
 * @internal
 */
export const MINIMAL_EC2_SSM_SESSION_MANAGER_POLICY_STATEMENT = new iam.PolicyStatement({
  actions: [
    'ssmmessages:CreateControlChannel',
    'ssmmessages:CreateDataChannel',
    'ssmmessages:OpenControlChannel',
    'ssmmessages:OpenDataChannel',
    's3:GetEncryptionConfiguration',
    'ssm:UpdateInstanceInformation',
  ],
  resources: ['*'],
});
