import * as cdk from 'aws-cdk-lib';
import {
  Annotations,
  aws_cloudwatch as cloudwatch,
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_stepfunctions as stepfunctions,
  aws_stepfunctions_tasks as stepfunctions_tasks,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { LambdaAccess } from './access';
import { DeleteRunnerFunction } from './lambdas/delete-runner-function';
import { SetupFunction } from './lambdas/setup-function';
import { StatusFunction } from './lambdas/status-function';
import { TokenRetrieverFunction } from './lambdas/token-retriever-function';
import { CodeBuildRunnerProvider } from './providers/codebuild';
import { IRunnerProvider } from './providers/common';
import { FargateRunnerProvider } from './providers/fargate';
import { LambdaRunnerProvider } from './providers/lambda';
import { Secrets } from './secrets';
import { GithubWebhookHandler } from './webhook';


/**
 * Properties for GitHubRunners
 */
export interface GitHubRunnersProps {
  /**
   * List of runner providers to use. At least one provider is required. Provider will be selected when its label matches the labels requested by the workflow job.
   *
   * @default CodeBuild, Lambda and Fargate runners with all the defaults (no VPC or default account VPC)
   */
  readonly providers?: IRunnerProvider[];

  /**
   * VPC used for all management functions. Use this with GitHub Enterprise Server hosted that's inaccessible from outside the VPC.
   */
  readonly vpc?: ec2.IVpc;

  /**
   * VPC subnets used for all management functions. Use this with GitHub Enterprise Server hosted that's inaccessible from outside the VPC.
   */
  readonly vpcSubnets?: ec2.SubnetSelection;

  /**
   * Allow management functions to run in public subnets. Lambda Functions in a public subnet can NOT access the internet.
   *
   * @default false
   */
  readonly allowPublicSubnet?: boolean;

  /**
   * Security group attached to all management functions. Use this with to provide access to GitHub Enterprise Server hosted inside a VPC.
   */
  readonly securityGroup?: ec2.ISecurityGroup;

  /**
   * Path to a directory containing a file named certs.pem containing any additional certificates required to trust GitHub Enterprise Server. Use this when GitHub Enterprise Server certificates are self-signed.
   *
   * You may also want to use custom images for your runner providers that contain the same certificates. See {@link CodeBuildImageBuilder.addCertificates}.
   *
   * ```typescript
   * const imageBuilder = CodeBuildRunnerProvider.imageBuilder(this, 'Image Builder with Certs');
   * imageBuilder.addComponent(RunnerImageComponent.extraCertificates('path-to-my-extra-certs-folder/certs.pem', 'private-ca');
   *
   * const provider = new CodeBuildRunnerProvider(this, 'CodeBuild', {
   *     imageBuilder: imageBuilder,
   * });
   *
   * new GitHubRunners(
   *   this,
   *   'runners',
   *   {
   *     providers: [provider],
   *     extraCertificates: 'path-to-my-extra-certs-folder',
   *   }
   * );
   * ```
   */
  readonly extraCertificates?: string;

  /**
   * Time to wait before stopping a runner that remains idle. If the user cancelled the job, or if another runner stole it, this stops the runner to avoid wasting resources.
   *
   * @default 10 minutes
   */
  readonly idleTimeout?: cdk.Duration;

  /**
   * Logging options for the state machine that manages the runners.
   *
   * @default no logs
   */
  readonly logOptions?: LogOptions;

  /**
   * Access configuration for the setup function. Once you finish the setup process, you can set this to `LambdaAccess.noAccess()` to remove access to the setup function. You can also use `LambdaAccess.apiGateway({ allowedIps: ['my-ip/0']})` to limit access to your IP only.
   *
   * @default LambdaAccess.lambdaUrl()
   */
  readonly setupAccess?: LambdaAccess;


  /**
   * Access configuration for the webhook function. This function is called by GitHub when a new workflow job is scheduled. For an extra layer of security, you can set this to `LambdaAccess.apiGateway({ allowedIps: LambdaAccess.githubWebhookIps() })`.
   *
   * You can also set this to `LambdaAccess.privateApiGateway()` if your GitHub Enterprise Server is hosted in a VPC. This will create an API Gateway endpoint that's only accessible from within the VPC.
   *
   * *WARNING*: changing access type may change the URL. When the URL changes, you must update GitHub as well.
   *
   * @default LambdaAccess.lambdaUrl()
   */
  readonly webhookAccess?: LambdaAccess;

  /**
   * Access configuration for the status function. This function returns a lot of sensitive information about the runner, so you should only allow access to it from trusted IPs, if at all.
   *
   * @default LambdaAccess.noAccess()
   */
  readonly statusAccess?: LambdaAccess;
}

/**
 * Defines what execution history events are logged and where they are logged.
 */
export interface LogOptions {
  /**
   * The log group where the execution history events will be logged.
   */
  readonly logGroupName?: string;

  /**
   * Determines whether execution data is included in your log.
   *
   * @default false
   */
  readonly includeExecutionData?: boolean;

  /**
   * Defines which category of execution history events are logged.
   *
   * @default ERROR
   */
  readonly level?: stepfunctions.LogLevel;

  /**
   * The number of days log events are kept in CloudWatch Logs. When updating
   * this property, unsetting it doesn't remove the log retention policy. To
   * remove the retention policy, set the value to `INFINITE`.
   *
   * @default logs.RetentionDays.ONE_MONTH
   */
  readonly logRetention?: logs.RetentionDays;
}

/**
 * Create all the required infrastructure to provide self-hosted GitHub runners. It creates a webhook, secrets, and a step function to orchestrate all runs. Secrets are not automatically filled. See README.md for instructions on how to setup GitHub integration.
 *
 * By default, this will create a runner provider of each available type with the defaults. This is good enough for the initial setup stage when you just want to get GitHub integration working.
 *
 * ```typescript
 * new GitHubRunners(this, 'runners');
 * ```
 *
 * Usually you'd want to configure the runner providers so the runners can run in a certain VPC or have certain permissions.
 *
 * ```typescript
 * const vpc = ec2.Vpc.fromLookup(this, 'vpc', { vpcId: 'vpc-1234567' });
 * const runnerSg = new ec2.SecurityGroup(this, 'runner security group', { vpc: vpc });
 * const dbSg = ec2.SecurityGroup.fromSecurityGroupId(this, 'database security group', 'sg-1234567');
 * const bucket = new s3.Bucket(this, 'runner bucket');
 *
 * // create a custom CodeBuild provider
 * const myProvider = new CodeBuildRunner(
 *   this, 'codebuild runner',
 *   {
 *      label: 'my-codebuild',
 *      vpc: vpc,
 *      securityGroup: runnerSg,
 *   },
 * );
 * // grant some permissions to the provider
 * bucket.grantReadWrite(myProvider);
 * dbSg.connections.allowFrom(runnerSg, ec2.Port.tcp(3306), 'allow runners to connect to MySQL database');
 *
 * // create the runner infrastructure
 * new GitHubRunners(
 *   this,
 *   'runners',
 *   {
 *     providers: [myProvider],
 *   }
 * );
 * ```
 */
export class GitHubRunners extends Construct {
  /**
   * Configured runner providers.
   */
  readonly providers: IRunnerProvider[];

  /**
   * Secrets for GitHub communication including webhook secret and runner authentication.
   */
  readonly secrets: Secrets;

  private readonly webhook: GithubWebhookHandler;
  private readonly orchestrator: stepfunctions.StateMachine;
  private readonly setupUrl: string;
  private readonly extraLambdaEnv: {[p: string]: string} = {};
  private readonly extraLambdaProps: lambda.FunctionOptions;
  private stateMachineLogGroup?: logs.LogGroup;
  private jobsCompletedMetricFilters?: logs.MetricFilter[];

  constructor(scope: Construct, id: string, readonly props?: GitHubRunnersProps) {
    super(scope, id);

    this.secrets = new Secrets(this, 'Secrets');
    this.extraLambdaProps = {
      vpc: this.props?.vpc,
      vpcSubnets: this.props?.vpcSubnets,
      allowPublicSubnet: this.props?.allowPublicSubnet,
      securityGroups: this.props?.securityGroup ? [this.props.securityGroup] : undefined,
      layers: this.props?.extraCertificates ? [new lambda.LayerVersion(scope, 'Certificate Layer', {
        description: 'Layer containing GitHub Enterprise Server certificate for cdk-github-runners',
        code: lambda.Code.fromAsset(this.props.extraCertificates),
      })] : undefined,
    };
    if (this.props?.extraCertificates) {
      this.extraLambdaEnv.NODE_EXTRA_CA_CERTS = '/opt/certs.pem';
    }

    if (this.props?.providers) {
      this.providers = this.props.providers;
    } else {
      this.providers = [
        new CodeBuildRunnerProvider(this, 'CodeBuild'),
        new LambdaRunnerProvider(this, 'Lambda'),
        new FargateRunnerProvider(this, 'Fargate'),
      ];
    }

    this.checkIntersectingLabels();

    this.orchestrator = this.stateMachine(props);
    this.webhook = new GithubWebhookHandler(this, 'Webhook Handler', {
      orchestrator: this.orchestrator,
      secrets: this.secrets,
      access: this.props?.webhookAccess ?? LambdaAccess.lambdaUrl(),
    });

    this.setupUrl = this.setupFunction();
    this.statusFunction();
  }

  private stateMachine(props?: GitHubRunnersProps) {
    const tokenRetrieverTask = new stepfunctions_tasks.LambdaInvoke(
      this,
      'Get Runner Token',
      {
        lambdaFunction: this.tokenRetriever(),
        payloadResponseOnly: true,
        resultPath: '$.runner',
      },
    );

    let deleteRunnerFunction = this.deleteRunner();
    const deleteRunnerTask = new stepfunctions_tasks.LambdaInvoke(
      this,
      'Delete Runner',
      {
        lambdaFunction: deleteRunnerFunction,
        payloadResponseOnly: true,
        resultPath: '$.delete',
        payload: stepfunctions.TaskInput.fromObject({
          runnerName: stepfunctions.JsonPath.stringAt('$$.Execution.Name'),
          owner: stepfunctions.JsonPath.stringAt('$.owner'),
          repo: stepfunctions.JsonPath.stringAt('$.repo'),
          runId: stepfunctions.JsonPath.stringAt('$.runId'),
          installationId: stepfunctions.JsonPath.stringAt('$.installationId'),
          idleOnly: false,
        }),
      },
    );
    deleteRunnerTask.addRetry({
      errors: [
        'RunnerBusy',
      ],
      interval: cdk.Duration.minutes(1),
      backoffRate: 1,
      maxAttempts: 60,
    });

    const waitForIdleRunner = new stepfunctions.Wait(this, 'Wait', {
      time: stepfunctions.WaitTime.duration(props?.idleTimeout ?? cdk.Duration.minutes(10)),
    });
    const deleteIdleRunnerTask = new stepfunctions_tasks.LambdaInvoke(
      this,
      'Delete Idle Runner',
      {
        lambdaFunction: deleteRunnerFunction,
        payloadResponseOnly: true,
        resultPath: '$.delete',
        payload: stepfunctions.TaskInput.fromObject({
          runnerName: stepfunctions.JsonPath.stringAt('$$.Execution.Name'),
          owner: stepfunctions.JsonPath.stringAt('$.owner'),
          repo: stepfunctions.JsonPath.stringAt('$.repo'),
          runId: stepfunctions.JsonPath.stringAt('$.runId'),
          installationId: stepfunctions.JsonPath.stringAt('$.installationId'),
          idleOnly: true,
        }),
      },
    );

    const providerChooser = new stepfunctions.Choice(this, 'Choose provider');
    for (const provider of this.providers) {
      const providerTask = provider.getStepFunctionTask(
        {
          runnerTokenPath: stepfunctions.JsonPath.stringAt('$.runner.token'),
          runnerNamePath: stepfunctions.JsonPath.stringAt('$$.Execution.Name'),
          githubDomainPath: stepfunctions.JsonPath.stringAt('$.runner.domain'),
          ownerPath: stepfunctions.JsonPath.stringAt('$.owner'),
          repoPath: stepfunctions.JsonPath.stringAt('$.repo'),
        },
      );
      providerChooser.when(
        stepfunctions.Condition.and(
          ...provider.labels.map(
            label => stepfunctions.Condition.isPresent(`$.labels.${label.toLowerCase()}`),
          ),
        ),
        providerTask,
      );
    }

    providerChooser.otherwise(new stepfunctions.Succeed(this, 'Unknown label'));

    const work = tokenRetrieverTask.next(
      new stepfunctions.Parallel(this, 'Error Catcher', { resultPath: '$.result' })
        .branch(providerChooser)
        .branch(waitForIdleRunner.next(deleteIdleRunnerTask))
        .addCatch(
          deleteRunnerTask
            .next(new stepfunctions.Fail(this, 'Runner Failed')),
          {
            resultPath: '$.error',
          },
        ),
    );

    let logOptions: cdk.aws_stepfunctions.LogOptions | undefined;
    if (this.props?.logOptions) {
      this.stateMachineLogGroup = new logs.LogGroup(this, 'Logs', {
        logGroupName: props?.logOptions?.logGroupName,
        retention: props?.logOptions?.logRetention ?? logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      logOptions = {
        destination: this.stateMachineLogGroup,
        includeExecutionData: props?.logOptions?.includeExecutionData ?? true,
        level: props?.logOptions?.level ?? stepfunctions.LogLevel.ALL,
      };
    }

    const stateMachine = new stepfunctions.StateMachine(
      this,
      'Runner Orchestrator',
      {
        definition: work,
        logs: logOptions,
      },
    );

    for (const provider of this.providers) {
      provider.grantStateMachine(stateMachine);
    }

    return stateMachine;
  }

  private tokenRetriever() {
    const func = new TokenRetrieverFunction(
      this,
      'token-retriever',
      {
        description: 'Get token from GitHub Actions used to start new self-hosted runner',
        environment: {
          GITHUB_SECRET_ARN: this.secrets.github.secretArn,
          GITHUB_PRIVATE_KEY_SECRET_ARN: this.secrets.githubPrivateKey.secretArn,
          ...this.extraLambdaEnv,
        },
        timeout: cdk.Duration.seconds(30),
        logRetention: logs.RetentionDays.ONE_MONTH,
        ...this.extraLambdaProps,
      },
    );

    this.secrets.github.grantRead(func);
    this.secrets.githubPrivateKey.grantRead(func);

    return func;
  }

  private deleteRunner() {
    const func = new DeleteRunnerFunction(
      this,
      'delete-runner',
      {
        description: 'Delete GitHub Actions runner on error',
        environment: {
          GITHUB_SECRET_ARN: this.secrets.github.secretArn,
          GITHUB_PRIVATE_KEY_SECRET_ARN: this.secrets.githubPrivateKey.secretArn,
          ...this.extraLambdaEnv,
        },
        timeout: cdk.Duration.seconds(30),
        logRetention: logs.RetentionDays.ONE_MONTH,
        ...this.extraLambdaProps,
      },
    );

    this.secrets.github.grantRead(func);
    this.secrets.githubPrivateKey.grantRead(func);

    return func;
  }

  private statusFunction() {
    const statusFunction = new StatusFunction(
      this,
      'status',
      {
        description: 'Provide user with status about self-hosted GitHub Actions runners',
        environment: {
          WEBHOOK_SECRET_ARN: this.secrets.webhook.secretArn,
          GITHUB_SECRET_ARN: this.secrets.github.secretArn,
          GITHUB_PRIVATE_KEY_SECRET_ARN: this.secrets.githubPrivateKey.secretArn,
          SETUP_SECRET_ARN: this.secrets.setup.secretArn,
          WEBHOOK_URL: this.webhook.url,
          WEBHOOK_HANDLER_ARN: this.webhook.handler.latestVersion.functionArn,
          STEP_FUNCTION_ARN: this.orchestrator.stateMachineArn,
          STEP_FUNCTION_LOG_GROUP: this.stateMachineLogGroup?.logGroupName ?? '',
          SETUP_FUNCTION_URL: this.setupUrl,
          ...this.extraLambdaEnv,
        },
        timeout: cdk.Duration.minutes(3),
        logRetention: logs.RetentionDays.ONE_MONTH,
        ...this.extraLambdaProps,
      },
    );

    const providers = this.providers.map(provider => provider.status(statusFunction));

    // expose providers as stack metadata as it's too big for Lambda environment variables
    // specifically integration testing got an error because lambda update request was >5kb
    const stack = cdk.Stack.of(this);
    const f = (statusFunction.node.defaultChild as lambda.CfnFunction);
    f.addPropertyOverride('Environment.Variables.LOGICAL_ID', f.logicalId);
    f.addPropertyOverride('Environment.Variables.STACK_NAME', stack.stackName);
    f.addMetadata('providers', providers);
    statusFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cloudformation:DescribeStackResource'],
      resources: [stack.stackId],
    }));

    this.secrets.webhook.grantRead(statusFunction);
    this.secrets.github.grantRead(statusFunction);
    this.secrets.githubPrivateKey.grantRead(statusFunction);
    this.secrets.setup.grantRead(statusFunction);
    this.orchestrator.grantRead(statusFunction);

    new cdk.CfnOutput(
      this,
      'status command',
      {
        value: `aws --region ${stack.region} lambda invoke --function-name ${statusFunction.functionName} status.json`,
      },
    );

    const access = this.props?.statusAccess ?? LambdaAccess.noAccess();
    const url = access._bind(this, 'status access', statusFunction);

    if (url !== '') {
      new cdk.CfnOutput(
        this,
        'status url',
        {
          value: url,
        },
      );
    }
  }

  private setupFunction(): string {
    const setupFunction = new SetupFunction(
      this,
      'setup',
      {
        description: 'Setup GitHub Actions integration with self-hosted runners',
        environment: {
          SETUP_SECRET_ARN: this.secrets.setup.secretArn,
          WEBHOOK_SECRET_ARN: this.secrets.webhook.secretArn,
          GITHUB_SECRET_ARN: this.secrets.github.secretArn,
          GITHUB_PRIVATE_KEY_SECRET_ARN: this.secrets.githubPrivateKey.secretArn,
          WEBHOOK_URL: this.webhook.url,
          ...this.extraLambdaEnv,
        },
        timeout: cdk.Duration.minutes(3),
        logRetention: logs.RetentionDays.ONE_MONTH,
        ...this.extraLambdaProps,
      },
    );

    // this.secrets.webhook.grantRead(setupFunction);
    this.secrets.webhook.grantWrite(setupFunction);
    this.secrets.github.grantRead(setupFunction);
    this.secrets.github.grantWrite(setupFunction);
    // this.secrets.githubPrivateKey.grantRead(setupFunction);
    this.secrets.githubPrivateKey.grantWrite(setupFunction);
    this.secrets.setup.grantRead(setupFunction);
    this.secrets.setup.grantWrite(setupFunction);

    const access = this.props?.setupAccess ?? LambdaAccess.lambdaUrl();
    return access._bind(this, 'setup access', setupFunction);
  }

  private checkIntersectingLabels() {
    // this "algorithm" is very inefficient, but good enough for the tiny datasets we expect
    for (const p1 of this.providers) {
      for (const p2 of this.providers) {
        if (p1 == p2) {
          continue;
        }
        if (p1.labels.every(l => p2.labels.includes(l))) {
          if (p2.labels.every(l => p1.labels.includes(l))) {
            throw new Error(`Both ${p1.node.path} and ${p2.node.path} use the same labels [${p1.labels.join(', ')}]`);
          }
          Annotations.of(p1).addWarning(`Labels [${p1.labels.join(', ')}] intersect with another provider (${p2.node.path} -- [${p2.labels.join(', ')}]). If a workflow specifies the labels [${p1.labels.join(', ')}], it is not guaranteed which provider will be used. It is recommended you do not use intersecting labels`);
        }
      }
    }
  }

  /**
   * Metric for the number of GitHub Actions jobs completed. It has `ProviderLabels` and `Status` dimensions. The status can be one of "Succeeded", "SucceededWithIssues", "Failed", "Canceled", "Skipped", or "Abandoned".
   *
   * **WARNING:** this method creates a metric filter for each provider. Each metric has a status dimension with six possible values. These resources may incur cost.
   */
  public metricJobCompleted(props?: cloudwatch.MetricProps): cloudwatch.Metric {
    if (!this.jobsCompletedMetricFilters) {
      // we can't use logs.FilterPattern.spaceDelimited() because it has no support for ||
      // status list taken from https://github.com/actions/runner/blob/be9632302ceef50bfb36ea998cea9c94c75e5d4d/src/Sdk/DTWebApi/WebApi/TaskResult.cs
      // we need "..." for Lambda that prefixes some extra data to log lines
      const pattern = logs.FilterPattern.literal('[..., marker = "CDKGHA", job = "JOB", done = "DONE", labels, status = "Succeeded" || status = "SucceededWithIssues" || status = "Failed" || status = "Canceled" || status = "Skipped" || status = "Abandoned"]');

      this.jobsCompletedMetricFilters = this.providers.map(p =>
        p.logGroup.addMetricFilter(`${p.logGroup.node.id} filter`, {
          metricNamespace: 'GitHubRunners',
          metricName: 'JobCompleted',
          filterPattern: pattern,
          metricValue: '1',
          // can't with dimensions -- defaultValue: 0,
          dimensions: {
            ProviderLabels: '$labels',
            Status: '$status',
          },
        }),
      );

      for (const metricFilter of this.jobsCompletedMetricFilters) {
        if (metricFilter.node.defaultChild instanceof logs.CfnMetricFilter) {
          metricFilter.node.defaultChild.addPropertyOverride('MetricTransformations.0.Unit', 'Count');
        } else {
          Annotations.of(metricFilter).addWarning('Unable to set metric filter Unit to Count');
        }
      }
    }

    return new cloudwatch.Metric({
      namespace: 'GitHubRunners',
      metricName: 'JobsCompleted',
      unit: cloudwatch.Unit.COUNT,
      statistic: cloudwatch.Statistic.SUM,
      ...props,
    }).attachTo(this);
  }

  /**
   * Metric for successful executions.
   *
   * A successful execution doesn't always mean a runner was started. It can be successful even without any label matches.
   *
   * A successful runner doesn't mean the job it executed was successful. For that, see {@link metricJobCompleted}.
   */
  public metricSucceeded(props?: cloudwatch.MetricProps): cloudwatch.Metric {
    return this.orchestrator.metricSucceeded(props);
  }

  /**
   * Metric for failed runner executions.
   *
   * A failed runner usually means the runner failed to start and so a job was never executed. It doesn't necessarily mean the job was executed and failed. For that, see {@link metricJobCompleted}.
   */
  public metricFailed(props?: cloudwatch.MetricProps): cloudwatch.Metric {
    return this.orchestrator.metricFailed(props);
  }

  /**
   * Metric for the interval, in milliseconds, between the time the execution starts and the time it closes. This time may be longer than the time the runner took.
   */
  public metricTime(props?: cloudwatch.MetricProps): cloudwatch.Metric {
    return this.orchestrator.metricTime(props);
  }
}
