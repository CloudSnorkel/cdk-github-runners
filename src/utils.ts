import { aws_iam as iam, aws_lambda as lambda, aws_logs as logs } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * Initialize or return a singleton Lambda function instance.
 *
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
 * Central log group type.
 *
 * @internal
 */
export enum SingletonLogType {
  RUNNER_IMAGE_BUILD = 'Runner Image Build Helpers Log',
  ORCHESTRATOR = 'Orchestrator Log',
  SETUP = 'Setup Log',
}

/**
 * Initialize or return central log group instance.
 *
 * @internal
 */
export function singletonLogGroup(scope: Construct, type: SingletonLogType): logs.ILogGroup {
  const existing = cdk.Stack.of(scope).node.tryFindChild(type);
  if (existing) {
    // Just assume this is true
    return existing as logs.ILogGroup;
  }

  return new logs.LogGroup(cdk.Stack.of(scope), type, {
    retention: logs.RetentionDays.ONE_MONTH,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });
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
