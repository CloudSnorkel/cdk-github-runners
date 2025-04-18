// ~~ Generated by projen. To modify, edit .projenrc.js and run "npx projen".
import * as path from 'path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

/**
 * Props for WebhookHandlerFunction
 */
export interface WebhookHandlerFunctionProps extends lambda.FunctionOptions {
}

/**
 * An AWS Lambda function which executes src/webhook-handler.
 */
export class WebhookHandlerFunction extends lambda.Function {
  constructor(scope: Construct, id: string, props?: WebhookHandlerFunctionProps) {
    super(scope, id, {
      description: 'src/webhook-handler.lambda.ts',
      ...props,
      runtime: new lambda.Runtime('nodejs22.x', lambda.RuntimeFamily.NODEJS),
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../assets/webhook-handler.lambda')),
    });
    this.addEnvironment('AWS_NODEJS_CONNECTION_REUSE_ENABLED', '1', { removeInEdge: true });
  }
}