import * as cdk from 'aws-cdk-lib';
import { aws_lambda as lambda, aws_stepfunctions as stepfunctions } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { LambdaAccess } from './access';
import { Secrets } from './secrets';
import { singletonLogGroup, SingletonLogType } from './utils';
import { WebhookHandlerFunction } from './webhook-handler-function';

/**
 * Input to the provider selector Lambda function.
 */
export interface ProviderSelectorInput {
  /**
   * Full GitHub webhook payload (workflow_job event structure with action="queued").
   *
   * * Original labels requested by the workflow job can be found at `payload.workflow_job.labels`.
   * * Repository path (e.g. CLoudSnorkel/cdk-github-runners) is at `payload.repository.full_name`.
   * * Commit hash is at `payload.workflow_job.head_sha`.
   *
   * @see https://docs.github.com/en/webhooks/webhook-events-and-payloads?actionType=queued#workflow_job
   */
  readonly payload: any;

  /**
   * Map of available provider node paths to their configured labels.
   * Example: { "MyStack/Small": ["linux", "small"], "MyStack/Large": ["linux", "large"] }
   */
  readonly providers: Record<string, string[]>;

  /**
   * Provider node path that would have been selected by default label matching.
   * Use this to easily return the default selection: `{ provider: input.defaultProvider, labels: input.defaultLabels }`
   * May be undefined if no provider matched by default.
   */
  readonly defaultProvider?: string;

  /**
   * Labels that would have been used by default (the selected provider's labels).
   * May be undefined if no provider matched by default.
   */
  readonly defaultLabels?: string[];
}

/**
 * Result from the provider selector Lambda function.
 */
export interface ProviderSelectorResult {
  /**
   * Node path of the provider to use (e.g., "MyStack/MyProvider").
   * Must match one of the configured provider node paths from the input.
   * If not provided, the job will be skipped (no runner created).
   */
  readonly provider?: string;

  /**
   * Labels to use when registering the runner.
   * Must be returned when a provider is selected.
   * Can be used to add, remove, or modify labels.
   */
  readonly labels?: string[];
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
   * Mapping of provider node paths to their supported labels.
   */
  readonly providers: Record<string, string[]>;

  /**
   * Optional Lambda function to customize provider selection.
   */
  readonly providerSelector?: lambda.IFunction;

  /**
   * Whether to require the "self-hosted" label.
   */
  readonly requireSelfHostedLabel: boolean;
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
          PROVIDERS: JSON.stringify(props.providers),
          REQUIRE_SELF_HOSTED_LABEL: props.requireSelfHostedLabel ? '1' : '0',
          PROVIDER_SELECTOR_ARN: props.providerSelector?.functionArn ?? '',
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
    props.providerSelector?.grantInvoke(this.handler);
  }
}
