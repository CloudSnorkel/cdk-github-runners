import * as cdk from 'aws-cdk-lib';
import { aws_lambda as lambda, aws_ssm as ssm, aws_events as events, aws_events_targets as events_targets } from 'aws-cdk-lib';
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
  readonly lambda: WebhookRedeliveryFunction;

  constructor(scope: Construct, id: string, props: GithubWebhookRedeliveryProps) {
    super(scope, id);

    const lastDeliveryIdParam = new ssm.StringParameter(this, 'LastDeliveryId', {
      description: 'The last webhook delivery ID that was processed by the redelivery lambda',
      allowedPattern: '^\\d+$',
      stringValue: '0',
    });

    this.lambda = new WebhookRedeliveryFunction(
      this,
      'Lambda',
      {
        description: 'Check for GitHub webhook delivery failures and redeliver them',
        environment: {
          GITHUB_SECRET_ARN: props.secrets.github.secretArn,
          GITHUB_PRIVATE_KEY_SECRET_ARN: props.secrets.githubPrivateKey.secretArn,
          LAST_DELIVERY_ID_PARAM: lastDeliveryIdParam.parameterName,
        },
        reservedConcurrentExecutions: 1, // avoid concurrent executions
        timeout: cdk.Duration.seconds(4.5 * 60), // 4.5 minutes
        logGroup: singletonLogGroup(this, SingletonLogType.WEBHOOK_REDELIVERY),
        loggingFormat: lambda.LoggingFormat.JSON,
      },
    );

    props.secrets.github.grantRead(this.lambda);
    props.secrets.githubPrivateKey.grantRead(this.lambda);
    lastDeliveryIdParam.grantRead(this.lambda);
    lastDeliveryIdParam.grantWrite(this.lambda);

    new events.Rule(this, 'Schedule', {
      schedule: events.Schedule.rate(cdk.Duration.minutes(5)),
      description: 'Schedule to run the webhook redelivery lambda every 5 minutes',
      targets: [
        new events_targets.LambdaFunction(this.lambda, {
          retryAttempts: 0,
        }),
      ],
    });
  }
}
