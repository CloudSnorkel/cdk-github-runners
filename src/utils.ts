import * as path from 'path';
import { aws_lambda as lambda, aws_logs as logs } from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * Lambda Function wrapper that uses pre-bundled JavaScript file from the known folder `lib/lambdas` with some reasonable defaults. The bundled files are put there by projen tasks that use esbuild to bundle TypeScript files from `src/lambdas`. This code is found in `.projenrc.js`.
 */
export class BundledNodejsFunction extends lambda.Function {
  constructor(scope: Construct, id: string, readonly props: lambda.FunctionOptions) {
    super(scope, id, {
      ...props,
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambdas', id)),
      handler: 'index.handler',
      runtime: lambda.Runtime.NODEJS_14_X,
      logRetention: logs.RetentionDays.ONE_MONTH,
    });
  }
}