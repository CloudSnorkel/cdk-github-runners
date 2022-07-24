import * as path from 'path';
import { aws_lambda as lambda, aws_logs as logs } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * Lambda Function wrapper that uses pre-bundled JavaScript file from the known folder `lib/lambdas` with some reasonable defaults. The bundled files are put there by projen tasks that use esbuild to bundle TypeScript files from `src/lambdas`. This code is found in `.projenrc.js`.
 */
export class BundledNodejsFunction extends lambda.Function {
  public static singleton(scope: Construct, id: string, props: lambda.FunctionOptions) {
    const constructName = `${id}-dcc036c8-876b-451e-a2c1-552f9e06e9e1`;
    const existing = cdk.Stack.of(scope).node.tryFindChild(constructName);
    if (existing) {
      // Just assume this is true
      return existing as BundledNodejsFunction;
    }

    return new BundledNodejsFunction(cdk.Stack.of(scope), constructName, props, id);
  }

  constructor(scope: Construct, id: string, readonly props: lambda.FunctionOptions, srcId?: string) {
    super(scope, id, {
      ...props,
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lib', 'lambdas', srcId ?? id)),
      handler: 'index.handler',
      runtime: lambda.Runtime.NODEJS_14_X,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });
    this.addEnvironment('AWS_NODEJS_CONNECTION_REUSE_ENABLED', '1', { removeInEdge: true });
  }
}