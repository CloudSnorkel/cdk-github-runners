import * as cdk from 'aws-cdk-lib';
import { aws_events as events, aws_events_targets as events_targets, aws_lambda as lambda } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Secrets } from './secrets';
import { singletonLogGroup, SingletonLogType } from './utils';
import { WebhookRedeliveryFunction } from './webhook-redelivery-function';

/**
 * Properties for GithubWebhookRedelivery
 *
 * @internal
 */
export interface GithubWebhookRedeliveryProps {
  /**
   * Secrets used to communicate with GitHub.
   */
  readonly secrets: Secrets;
}

/**
 * Create a Lambda that runs every 5 minutes to check for Github webhook delivery failures and retry them.
 *
 * @internal
 */
export class GithubWebhookRedelivery extends Construct {
  /**
   * Webhook redelivery lambda function.
   */
  readonly handler: WebhookRedeliveryFunction;

  constructor(scope: Construct, id: string, props: GithubWebhookRedeliveryProps) {
    super(scope, id);

    this.handler = new WebhookRedeliveryFunction(
      this,
      'Lambda',
      {
        description: 'Check for GitHub webhook delivery failures and redeliver them',
        environment: {
          GITHUB_SECRET_ARN: props.secrets.github.secretArn,
          GITHUB_PRIVATE_KEY_SECRET_ARN: props.secrets.githubPrivateKey.secretArn,
        },
        reservedConcurrentExecutions: 1, // avoid concurrent executions
        timeout: cdk.Duration.seconds(4.5 * 60), // 4.5 minutes
        logGroup: singletonLogGroup(this, SingletonLogType.ORCHESTRATOR),
        loggingFormat: lambda.LoggingFormat.JSON,
        // applicationLogLevelV2: ApplicationLogLevel.DEBUG,
      },
    );

    props.secrets.github.grantRead(this.handler);
    props.secrets.githubPrivateKey.grantRead(this.handler);

    new events.Rule(this, 'Schedule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      description: 'Schedule to run the webhook redelivery lambda every 5 minutes',
      targets: [
        new events_targets.LambdaFunction(this.handler, {
          retryAttempts: 0,
        }),
      ],
    });
  }
}
