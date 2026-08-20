import * as cdk from 'aws-cdk-lib';
import {
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_lambda_event_sources as lambda_event_sources,
  aws_logs as logs,
  aws_logs_destinations as logs_destinations,
  aws_sqs as sqs,
  aws_stepfunctions as stepfunctions,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Secrets } from './secrets';
import { StolenRunnerHandlerFunction } from './stolen-runner-handler-function';
import { singletonLogGroup, SingletonLogType } from './utils';

/**
 * Properties for StolenRunnerDetector.
 *
 * @internal
 */
export interface StolenRunnerDetectorProps {
  /**
   * Secrets used to communicate with GitHub.
   */
  readonly secrets: Secrets;

  /**
   * Step function that starts runners. Used to start replacement runners and to know when runners are done.
   */
  readonly orchestrator: stepfunctions.StateMachine;

  /**
   * Log groups the runners write to. Runners report which job landed on them, and this is where those reports come out.
   */
  readonly runnerLogGroups: logs.ILogGroup[];

  /**
   * Additional Lambda function options (VPC, security groups, layers, etc.).
   */
  readonly extraLambdaProps?: lambda.FunctionOptions;

  /**
   * Additional environment variables for the Lambda function.
   */
  readonly extraLambdaEnv?: { [key: string]: string };
}

/**
 * Remembers which jobs we start runners for, listens to runners reporting the jobs they pick up, and starts
 * another runner whenever one of ours runs a job we didn't start a runner for.
 *
 * We collect a set of jobs we started runners for.
 * Then for each job a runner picks up, we check if it was in that set.
 * If it wasn't in that set, the runner was stolen.
 * We start a new runner of the exact same type if it was stolen.
 *
 * @internal
 */
export class StolenRunnerDetector extends Construct {
  /**
   * The jobs we started runners for.
   */
  readonly table: dynamodb.Table;

  /**
   * Queue of runner reports waiting to be checked.
   */
  readonly queue: sqs.Queue;

  /**
   * Function that checks assignments and starts replacement runners.
   */
  readonly handler: StolenRunnerHandlerFunction;

  private readonly ttlSeconds: number;

  constructor(scope: Construct, id: string, props: StolenRunnerDetectorProps) {
    super(scope, id);

    // leave record long enough for github's 24-hour job timeout + our step function 24 hour timeout
    this.ttlSeconds = cdk.Duration.days(3).toSeconds();

    this.table = new dynamodb.Table(this, 'Jobs', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.queue = new sqs.Queue(this, 'Queue', {
      // FIFO for the deduplication, not the ordering. a runner runs one job, so it has exactly one thing to tell
      // us, but we hear it twice: once from the workflow_job.in_progress webhook and once from the runner's log.
      // sending both with MessageDeduplicationId set to the runner name will only allow the first message.
      // this saves us on extra work and protects from buggy or malicious runners reporting too much.
      // deduplication is a fixed five minute window.
      fifo: true,
      // delay testing runner reports by a minute to give workflow_job.queued webhook a chance to arrive
      deliveryDelay: cdk.Duration.minutes(1),
      visibilityTimeout: cdk.Duration.minutes(3),
      // a report is only worth acting on while the abandoned job is still waiting for a runner, so there is no
      // point keeping one for days. this also bounds anything that fails forever without needing a dead letter
      // queue full of reports nobody will ever look at.
      retentionPeriod: cdk.Duration.hours(1),
    });

    this.handler = new StolenRunnerHandlerFunction(this, 'Lambda', {
      description: 'Detect GitHub Actions runners stolen by other jobs and start a new runner for the abandoned job',
      environment: {
        GITHUB_SECRET_ARN: props.secrets.github.secretArn,
        GITHUB_PRIVATE_KEY_SECRET_ARN: props.secrets.githubPrivateKey.secretArn,
        STEP_FUNCTION_ARN: props.orchestrator.stateMachineArn,
        RUNNER_TRACKER_TABLE: this.table.tableName,
        RUNNER_TRACKER_TTL_SECONDS: `${this.ttlSeconds}`,
        JOB_ASSIGNMENT_QUEUE_URL: this.queue.queueUrl,
        ...props.extraLambdaEnv,
      },
      timeout: cdk.Duration.minutes(2),
      logGroup: singletonLogGroup(this, SingletonLogType.ORCHESTRATOR),
      loggingFormat: lambda.LoggingFormat.JSON,
      ...props.extraLambdaProps,
    });

    this.handler.addEventSource(new lambda_event_sources.SqsEventSource(this.queue, {
      reportBatchItemFailures: true,
      batchSize: 10,
    }));

    this.table.grantReadWriteData(this.handler);
    this.queue.grantSendMessages(this.handler);
    this.handler.addEnvironment('JOB_ASSIGNMENT_QUEUE_URL', this.queue.queueUrl);
    props.secrets.github.grantRead(this.handler);
    props.secrets.githubPrivateKey.grantRead(this.handler);
    props.orchestrator.grantStartExecution(this.handler);
    // the runner name is the execution name, so the step function still holds everything needed to start another
    // runner just like the one that was taken
    props.orchestrator.grantExecution(this.handler, 'states:DescribeExecution');

    // runners report which job they were handed the moment it's assigned, by printing a line to their own log.
    // that's the only signal we can safely get from a runner that might be running in an isolated subnet or without permissions.
    // runners also technically run untrusted code so we don't want to give them credentials to call API or touch a queue or anything like that.
    const destination = new logs_destinations.LambdaDestination(this.handler, { addPermissions: false /* too many resources */ });
    this.handler.addPermission('Runner Reports', {
      principal: new iam.ServicePrincipal('logs.amazonaws.com'),
      sourceArn: cdk.Stack.of(this).formatArn({
        service: 'logs',
        resource: 'log-group',
        resourceName: '*',
        arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
      }),
      sourceAccount: cdk.Stack.of(this).account,
    });
    const permNode = this.handler.node.findChild('Runner Reports');

    for (const logGroup of props.runnerLogGroups) {
      const sub = new logs.SubscriptionFilter(this, `Runner Reports ${logGroup.node.addr.slice(0, 8)}`, {
        logGroup,
        destination,
        filterPattern: logs.FilterPattern.literal('"CDKGHR JOB RUNNER="'),
      });
      sub.node.addDependency(permNode);
    }
  }

  public grantRecordRunners(func: lambda.Function) {
    func.addEnvironment('RUNNER_TRACKER_TABLE', this.table.tableName);
    func.addEnvironment('RUNNER_TRACKER_TTL_SECONDS', `${this.ttlSeconds}`);
    this.table.grantWriteData(func);
  }
}
