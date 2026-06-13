import * as fs from 'fs';
import * as path from 'path';
import { aws_ec2 as ec2, aws_iam as iam, aws_lambda as lambda, aws_logs as logs } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * Attach a value as CloudFormation metadata of the given function's resource, and let the function read it back
 * at runtime with getOwnResourceMetadata() from lambda-stack-metadata.ts. Used for values that can grow past the
 * 4KB Lambda environment variables limit, like the providers map.
 *
 * @internal
 */
export function addFunctionMetadata(func: lambda.Function, key: string, value: any) {
  const stack = cdk.Stack.of(func);
  const resource = func.node.defaultChild as lambda.CfnFunction;
  resource.addPropertyOverride('Environment.Variables.LOGICAL_ID', resource.logicalId);
  resource.addPropertyOverride('Environment.Variables.STACK_NAME', stack.stackName);
  resource.addMetadata(key, value);
  func.addToRolePolicy(new iam.PolicyStatement({
    actions: ['cloudformation:DescribeStackResource'],
    resources: [stack.stackId],
  }));
}

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

/**
 * Discovers certificate files from a given path (file or directory).
 *
 * If the path is a directory, finds all .pem and .crt files in it.
 * If the path is a file, returns it as a single certificate file.
 *
 * @param sourcePath path to a certificate file or directory containing certificate files
 * @returns array of certificate file paths, sorted alphabetically
 * @throws Error if path doesn't exist, is neither file nor directory, or directory has no certificate files
 *
 * @internal
 */
export function discoverCertificateFiles(sourcePath: string): string[] {
  let certificateFiles: string[] = [];

  try {
    const stat = fs.statSync(sourcePath);
    if (stat.isDirectory()) {
      // Read directory and find all .pem and .crt files
      const files = fs.readdirSync(sourcePath);
      certificateFiles = files
        .filter(file => file.endsWith('.pem') || file.endsWith('.crt'))
        .map(file => path.join(sourcePath, file))
        .sort(); // Sort for consistent ordering

      if (certificateFiles.length === 0) {
        throw new Error(`No certificate files (.pem or .crt) found in directory: ${sourcePath}`);
      }
    } else if (stat.isFile()) {
      // Single file - backwards compatible
      certificateFiles = [sourcePath];
    } else {
      throw new Error(`Certificate source path is neither a file nor a directory: ${sourcePath}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Certificate source path does not exist: ${sourcePath}`);
    }
    throw error;
  }

  return certificateFiles;
}

/**
 * Returns true if the instance type has an NVIDIA GPU.
 *
 * Uses AWS naming convention: most NVIDIA GPU instances use 'g' (g4dn, g5, g6, g9...) or 'p' (p3, p4d, p5, p6...)
 * prefix followed by a digit. Explicitly excludes known non-NVIDIA GPU families such as g4ad (AMD).
 *
 * @internal
 */
export function isGpuInstanceType(instanceType: ec2.InstanceType): boolean {
  const s = instanceType.toString().toLowerCase();
  // Match GPU instance families starting with g/p + digit, but exclude known non-NVIDIA GPU families.
  return /^[gp]\d+(?!ad)/.test(s);
}
