import * as path from 'path';
import { aws_lambda as lambda, aws_logs as logs } from 'aws-cdk-lib';
import { Construct } from 'constructs';

// projen defines the bundling as a post compile task. it's defined at the bottom of .projenrc.js.
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