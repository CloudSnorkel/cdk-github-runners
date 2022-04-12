import { aws_stepfunctions as stepfunctions } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { Secrets } from './secrets';
import { BundledNodejsFunction } from './utils';

export interface GithubWebhookHandlerProps {
  readonly orchestrator: stepfunctions.StateMachine;
  readonly secrets: Secrets;
}

export class GithubWebhookHandler extends Construct {
  readonly url: string;
  readonly handler: BundledNodejsFunction;

  constructor(scope: Construct, id: string, props: GithubWebhookHandlerProps) {
    super(scope, id);

    this.handler = new BundledNodejsFunction(
      this,
      'webhook-handler',
      {
        environment: {
          STEP_FUNCTION_ARN: props.orchestrator.stateMachineArn,
          WEBHOOK_SECRET_ARN: props.secrets.webhook.secretArn,
        },
        timeout: cdk.Duration.seconds(30),
      },
    );

    this.url = this.handler.addFunctionUrl({ authType: FunctionUrlAuthType.NONE }).url;

    props.secrets.webhook.grantRead(this.handler);
    props.orchestrator.grantStartExecution(this.handler);
  }
}