import { aws_lambda as lambda } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * @internal
 */
export function singletonLambda<FunctionType>(
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
