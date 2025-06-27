import * as cdk from 'aws-cdk-lib';
import { aws_lambda as lambda, aws_stepfunctions as stepfunctions } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { LambdaAccess } from './access';
import { Secrets } from './secrets';
import { singletonLogGroup, SingletonLogType } from './utils';
import { WebhookHandlerFunction } from './webhook-handler-function';

/**
 * @internal
 */
export interface SupportedLabels {
  readonly provider: string;
  readonly labels: string[];
}

/**
 * Properties for GithubWebhookHandler
 *
 * @internal
 */
export interface GithubWebhookHandlerProps {
  /**
   * Step function in charge of handling the workflow job events and start the runners.
   */
  readonly orchestrator: stepfunctions.StateMachine;

  /**
   * Secrets used to communicate with GitHub.
   */
  readonly secrets: Secrets;

  /**
   * Configure access to webhook function.
   */
  readonly access?: LambdaAccess;

  /**
   * List of supported label combinations.
   */
  readonly supportedLabels: SupportedLabels[];

  /**
   * Whether to require the "self-hosted" label.
   */
  readonly requireSelfHostedLabel: boolean;

  /**
   * Whether to skip repo's organization name in the execution name.
   */
  readonly skipOrgName: boolean;

  /**
   * Strip hyphens from the webhook GUID, to allow less truncation in repo name.
   */
  readonly stripHyphenFromGuid: boolean;
}

/**
 * Create a Lambda with a public URL to handle GitHub webhook events. After validating the event with the given secret, the orchestrator step function is called with information about the workflow job.
 *
 * @internal
 */
export class GithubWebhookHandler extends Construct {

  /**
   * Public URL of webhook to be used with GitHub.
   */
  readonly url: string;

  /**
   * Webhook event handler.
   */
  readonly handler: WebhookHandlerFunction;

  constructor(scope: Construct, id: string, props: GithubWebhookHandlerProps) {
    super(scope, id);

    this.handler = new WebhookHandlerFunction(
      this,
      'webhook-handler',
      {
        description: 'Handle GitHub webhook and start runner orchestrator',
        environment: {
          STEP_FUNCTION_ARN: props.orchestrator.stateMachineArn,
          WEBHOOK_SECRET_ARN: props.secrets.webhook.secretArn,
          GITHUB_SECRET_ARN: props.secrets.github.secretArn,
          GITHUB_PRIVATE_KEY_SECRET_ARN: props.secrets.githubPrivateKey.secretArn,
          SUPPORTED_LABELS: JSON.stringify(props.supportedLabels),
          REQUIRE_SELF_HOSTED_LABEL: props.requireSelfHostedLabel ? '1' : '0',
          SKIP_ORG_NAME: props.skipOrgName ? '1' : '0',
          STRIP_HYPHEN_FROM_GUID: props.stripHyphenFromGuid ? '1' : '0',
        },
        timeout: cdk.Duration.seconds(31),
        logGroup: singletonLogGroup(this, SingletonLogType.ORCHESTRATOR),
        loggingFormat: lambda.LoggingFormat.JSON,
      },
    );

    const access = props?.access ?? LambdaAccess.lambdaUrl();
    this.url = access.bind(this, 'access', this.handler);

    props.secrets.webhook.grantRead(this.handler);
    props.secrets.github.grantRead(this.handler);
    props.secrets.githubPrivateKey.grantRead(this.handler);
    props.orchestrator.grantStartExecution(this.handler);
  }
}
