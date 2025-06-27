import * as cdk from 'aws-cdk-lib';
import {
  Annotations,
  aws_cloudwatch as cloudwatch,
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_lambda_event_sources as lambda_event_sources,
  aws_logs as logs,
  aws_sns as sns,
  aws_sqs as sqs,
  aws_stepfunctions as stepfunctions,
  aws_stepfunctions_tasks as stepfunctions_tasks,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { LambdaAccess } from './access';
import { DeleteFailedRunnerFunction } from './delete-failed-runner-function';
import { IdleRunnerRepearFunction } from './idle-runner-repear-function';
import {
  AwsImageBuilderFailedBuildNotifier,
  CodeBuildImageBuilderFailedBuildNotifier,
  CodeBuildRunnerProvider,
  FargateRunnerProvider,
  IRunnerProvider,
  LambdaRunnerProvider,
  ProviderRetryOptions,
} from './providers';
import { Secrets } from './secrets';
import { SetupFunction } from './setup-function';
import { StatusFunction } from './status-function';
import { TokenRetrieverFunction } from './token-retriever-function';
import { singletonLogGroup, SingletonLogType } from './utils';
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
   * Whether to require the `self-hosted` label. If `true`, the runner will only start if the workflow job explicitly requests the `self-hosted` label.
   *
   * Be careful when setting this to `false`. Avoid setting up providers with generic label requirements like `linux` as they may match workflows that are not meant to run on self-hosted runners.
   *
   * @default true
   */
  readonly requireSelfHostedLabel?: boolean;

  /**
   * VPC used for all management functions. Use this with GitHub Enterprise Server hosted that's inaccessible from outside the VPC.
   *
   * Make sure the selected VPC and subnets have access to the following with either NAT Gateway or VPC Endpoints:
   * * GitHub Enterprise Server
   * * Secrets Manager
   * * SQS
   * * Step Functions
   * * CloudFormation (status function only)
   * * EC2 (status function only)
   * * ECR (status function only)
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
   *
   * @deprecated use {@link securityGroups} instead
   */
  readonly securityGroup?: ec2.ISecurityGroup;

  /**
   * Security groups attached to all management functions. Use this with to provide access to GitHub Enterprise Server hosted inside a VPC.
   */
  readonly securityGroups?: ec2.ISecurityGroup[];

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
   * @default 5 minutes
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
   * You can also set this to `LambdaAccess.apiGateway({allowedVpc: vpc, allowedIps: ['GHES.IP.ADDRESS/32']})` if your GitHub Enterprise Server is hosted in a VPC. This will create an API Gateway endpoint that's only accessible from within the VPC.
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

  /**
   * Options to retry operation in case of failure like missing capacity, or API quota issues.
   *
   * GitHub jobs time out after not being able to get a runner for 24 hours. You should not retry for more than 24 hours.
   *
   * Total time spent waiting can be calculated with interval * (backoffRate ^ maxAttempts) / (backoffRate - 1).
   *
   * @default retry 23 times up to about 24 hours
   */
  readonly retryOptions?: ProviderRetryOptions;

  /**
   * Options for constructing step function execution names, which is also used as runner name.
   */
  readonly executionNameOptions?: ExecutionNameOptions;
}

/**
 * Defines options for constructing step function execution names.
 * 
 * By default the execution name is constructed as `<org>-<repo>-<webhook-guid>`, where
 * - `org` is the GitHub organization name
 * - `repo` is the GitHub repository name
 * - `webhook-guid` is a unique identifier for the webhook event
 * 
 * Note that the execution name is limited to 64 characters, so the org and repo names may be truncated.
 */
export interface ExecutionNameOptions {
  /**
   * Skip the organization name, and just include the repo name in the execution name.
   * 
   * @default false
   */
  readonly skipOrgName?: boolean;

  /**
   * Strip hyphens from the webhook GUID, to allow less truncation in repo name.
   * 
   * @default false
   */
  readonly stripHyphenFromGuid?: boolean;
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
 * const myProvider = new CodeBuildRunnerProvider(
 *   this, 'codebuild runner',
 *   {
 *      labels: ['my-codebuild'],
 *      vpc: vpc,
 *      securityGroups: [runnerSg],
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
export class GitHubRunners extends Construct implements ec2.IConnectable {
  /**
   * Configured runner providers.
   */
  readonly providers: IRunnerProvider[];

  /**
   * Secrets for GitHub communication including webhook secret and runner authentication.
   */
  readonly secrets: Secrets;

  /**
   * Manage the connections of all management functions. Use this to enable connections to your GitHub Enterprise Server in a VPC.
   *
   * This cannot be used to manage connections of the runners. Use the `connections` property of each runner provider to manage runner connections.
   */
  readonly connections: ec2.Connections;

  private readonly webhook: GithubWebhookHandler;
  private readonly orchestrator: stepfunctions.StateMachine;
  private readonly setupUrl: string;
  private readonly extraLambdaEnv: { [p: string]: string } = {};
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
      securityGroups: this.lambdaSecurityGroups(),
      layers: this.props?.extraCertificates ? [new lambda.LayerVersion(scope, 'Certificate Layer', {
        description: 'Layer containing GitHub Enterprise Server certificate for cdk-github-runners',
        code: lambda.Code.fromAsset(this.props.extraCertificates),
      })] : undefined,
    };
    this.connections = new ec2.Connections({ securityGroups: this.extraLambdaProps.securityGroups });
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

    if (this.providers.length == 0) {
      throw new Error('At least one runner provider is required');
    }

    this.checkIntersectingLabels();

    this.orchestrator = this.stateMachine(props);
    this.webhook = new GithubWebhookHandler(this, 'Webhook Handler', {
      orchestrator: this.orchestrator,
      secrets: this.secrets,
      access: this.props?.webhookAccess ?? LambdaAccess.lambdaUrl(),
      supportedLabels: this.providers.map(p => {
        return {
          provider: p.node.path,
          labels: p.labels,
        };
      }),
      requireSelfHostedLabel: this.props?.requireSelfHostedLabel ?? true,
      skipOrgName: this.props?.executionNameOptions?.skipOrgName ?? false,
      stripHyphenFromGuid: this.props?.executionNameOptions?.stripHyphenFromGuid ?? false,
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

    let deleteFailedRunnerFunction = this.deleteFailedRunner();
    const deleteFailedRunnerTask = new stepfunctions_tasks.LambdaInvoke(
      this,
      'Delete Failed Runner',
      {
        lambdaFunction: deleteFailedRunnerFunction,
        payloadResponseOnly: true,
        resultPath: '$.delete',
        payload: stepfunctions.TaskInput.fromObject({
          runnerName: stepfunctions.JsonPath.stringAt('$$.Execution.Name'),
          owner: stepfunctions.JsonPath.stringAt('$.owner'),
          repo: stepfunctions.JsonPath.stringAt('$.repo'),
          installationId: stepfunctions.JsonPath.numberAt('$.installationId'),
          error: stepfunctions.JsonPath.objectAt('$.error'),
        }),
      },
    );
    deleteFailedRunnerTask.addRetry({
      errors: [
        'RunnerBusy',
      ],
      interval: cdk.Duration.minutes(1),
      backoffRate: 1,
      maxAttempts: 60,
    });

    const idleReaper = this.idleReaper();
    const queueIdleReaperTask = new stepfunctions_tasks.SqsSendMessage(this, 'Queue Idle Reaper', {
      queue: this.idleReaperQueue(idleReaper),
      messageBody: stepfunctions.TaskInput.fromObject({
        executionArn: stepfunctions.JsonPath.stringAt('$$.Execution.Id'),
        runnerName: stepfunctions.JsonPath.stringAt('$$.Execution.Name'),
        owner: stepfunctions.JsonPath.stringAt('$.owner'),
        repo: stepfunctions.JsonPath.stringAt('$.repo'),
        installationId: stepfunctions.JsonPath.numberAt('$.installationId'),
        maxIdleSeconds: (props?.idleTimeout ?? cdk.Duration.minutes(5)).toSeconds(),
      }),
      resultPath: stepfunctions.JsonPath.DISCARD,
    });

    const providerChooser = new stepfunctions.Choice(this, 'Choose provider');
    for (const provider of this.providers) {
      const providerTask = provider.getStepFunctionTask(
        {
          runnerTokenPath: stepfunctions.JsonPath.stringAt('$.runner.token'),
          runnerNamePath: stepfunctions.JsonPath.stringAt('$$.Execution.Name'),
          githubDomainPath: stepfunctions.JsonPath.stringAt('$.runner.domain'),
          ownerPath: stepfunctions.JsonPath.stringAt('$.owner'),
          repoPath: stepfunctions.JsonPath.stringAt('$.repo'),
          registrationUrl: stepfunctions.JsonPath.stringAt('$.runner.registrationUrl'),
        },
      );
      providerChooser.when(
        stepfunctions.Condition.and(
          stepfunctions.Condition.stringEquals('$.provider', provider.node.path),
        ),
        providerTask,
      );
    }

    providerChooser.otherwise(new stepfunctions.Succeed(this, 'Unknown label'));

    const runProviders = new stepfunctions.Parallel(this, 'Run Providers').branch(
      new stepfunctions.Parallel(this, 'Error Handler').branch(
        // we get a token for every retry because the token can expire faster than the job can timeout
        tokenRetrieverTask.next(providerChooser),
      ).addCatch(
        // delete runner on failure as it won't remove itself and there is a limit on the number of registered runners
        deleteFailedRunnerTask,
        {
          resultPath: '$.error',
        },
      ),
    );

    if (props?.retryOptions?.retry ?? true) {
      const interval = props?.retryOptions?.interval ?? cdk.Duration.minutes(1);
      const maxAttempts = props?.retryOptions?.maxAttempts ?? 23;
      const backoffRate = props?.retryOptions?.backoffRate ?? 1.3;

      const totalSeconds = interval.toSeconds() * backoffRate ** maxAttempts / (backoffRate - 1);
      if (totalSeconds >= cdk.Duration.days(1).toSeconds()) {
        // https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners#usage-limits
        // "Job queue time - Each job for self-hosted runners can be queued for a maximum of 24 hours. If a self-hosted runner does not start executing the job within this limit, the job is terminated and fails to complete."
        Annotations.of(this).addWarning(`Total retry time is greater than 24 hours (${Math.floor(totalSeconds / 60 / 60)} hours). Jobs expire after 24 hours so it would be a waste of resources to retry further.`);
      }

      runProviders.addRetry({
        interval,
        maxAttempts,
        backoffRate,
        // we retry on everything
        // deleted idle runners will also fail, but the reaper will stop this step function to avoid endless retries
      });
    }

    let logOptions: cdk.aws_stepfunctions.LogOptions | undefined;
    if (this.props?.logOptions) {
      this.stateMachineLogGroup = new logs.LogGroup(this, 'Logs', {
        logGroupName: props?.logOptions?.logGroupName,
        retention: props?.logOptions?.logRetention ?? logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
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
        definitionBody: stepfunctions.DefinitionBody.fromChainable(queueIdleReaperTask.next(runProviders)),
        logs: logOptions,
      },
    );

    stateMachine.grantRead(idleReaper);
    stateMachine.grantExecution(idleReaper, 'states:StopExecution');
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
        logGroup: singletonLogGroup(this, SingletonLogType.ORCHESTRATOR),
        loggingFormat: lambda.LoggingFormat.JSON,
        ...this.extraLambdaProps,
      },
    );

    this.secrets.github.grantRead(func);
    this.secrets.githubPrivateKey.grantRead(func);

    return func;
  }

  private deleteFailedRunner() {
    const func = new DeleteFailedRunnerFunction(
      this,
      'delete-runner',
      {
        description: 'Delete failed GitHub Actions runner on error',
        environment: {
          GITHUB_SECRET_ARN: this.secrets.github.secretArn,
          GITHUB_PRIVATE_KEY_SECRET_ARN: this.secrets.githubPrivateKey.secretArn,
          ...this.extraLambdaEnv,
        },
        timeout: cdk.Duration.seconds(30),
        logGroup: singletonLogGroup(this, SingletonLogType.ORCHESTRATOR),
        loggingFormat: lambda.LoggingFormat.JSON,
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
        logGroup: singletonLogGroup(this, SingletonLogType.SETUP),
        loggingFormat: lambda.LoggingFormat.JSON,
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
    const url = access.bind(this, 'status access', statusFunction);

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
        logGroup: singletonLogGroup(this, SingletonLogType.SETUP),
        loggingFormat: lambda.LoggingFormat.JSON,
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
    return access.bind(this, 'setup access', setupFunction);
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

  private idleReaper() {
    return new IdleRunnerRepearFunction(this, 'Idle Reaper', {
      description: 'Stop idle GitHub runners to avoid paying for runners when the job was already canceled',
      environment: {
        GITHUB_SECRET_ARN: this.secrets.github.secretArn,
        GITHUB_PRIVATE_KEY_SECRET_ARN: this.secrets.githubPrivateKey.secretArn,
        ...this.extraLambdaEnv,
      },
      logGroup: singletonLogGroup(this, SingletonLogType.ORCHESTRATOR),
      loggingFormat: lambda.LoggingFormat.JSON,
      timeout: cdk.Duration.minutes(5),
      ...this.extraLambdaProps,
    });
  }

  private idleReaperQueue(reaper: lambda.Function) {
    // see this comment to understand why it's a queue that's out of the step function
    // https://github.com/CloudSnorkel/cdk-github-runners/pull/314#issuecomment-1528901192

    const queue = new sqs.Queue(this, 'Idle Reaper Queue', {
      deliveryDelay: cdk.Duration.minutes(10),
      visibilityTimeout: cdk.Duration.minutes(10),
    });

    reaper.addEventSource(new lambda_event_sources.SqsEventSource(queue, {
      reportBatchItemFailures: true,
    }));

    this.secrets.github.grantRead(reaper);
    this.secrets.githubPrivateKey.grantRead(reaper);

    return queue;
  }

  private lambdaSecurityGroups() {
    if (!this.props?.vpc) {
      if (this.props?.securityGroup) {
        cdk.Annotations.of(this).addWarning('securityGroup is specified, but vpc is not. securityGroup will be ignored');
      }
      if (this.props?.securityGroups) {
        cdk.Annotations.of(this).addWarning('securityGroups is specified, but vpc is not. securityGroups will be ignored');
      }

      return undefined;
    }

    if (this.props.securityGroups) {
      if (this.props.securityGroup) {
        cdk.Annotations.of(this).addWarning('Both securityGroup and securityGroups are specified. securityGroup will be ignored');
      }
      return this.props.securityGroups;
    }

    if (this.props.securityGroup) {
      return [this.props.securityGroup];
    }

    return [new ec2.SecurityGroup(this, 'Management Lambdas Security Group', { vpc: this.props.vpc })];
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

  /**
   * Creates a topic for notifications when a runner image build fails.
   *
   * Runner images are rebuilt every week by default. This provides the latest GitHub Runner version and software updates.
   *
   * If you want to be sure you are using the latest runner version, you can use this topic to be notified when a build fails.
   */
  public failedImageBuildsTopic() {
    const topic = new sns.Topic(this, 'Failed Runner Image Builds');
    const stack = cdk.Stack.of(this);
    cdk.Aspects.of(stack).add(new CodeBuildImageBuilderFailedBuildNotifier(topic));
    cdk.Aspects.of(stack).add(
      new AwsImageBuilderFailedBuildNotifier(
        AwsImageBuilderFailedBuildNotifier.createFilteringTopic(this, topic),
      ),
    );
    return topic;
  }

  /**
   * Creates CloudWatch Logs Insights saved queries that can be used to debug issues with the runners.
   *
   * * "Webhook errors" helps diagnose configuration issues with GitHub integration
   * * "Ignored webhook" helps understand why runners aren't started
   * * "Ignored jobs based on labels" helps debug label matching issues
   * * "Webhook started runners" helps understand which runners were started
   */
  public createLogsInsightsQueries() {
    new logs.QueryDefinition(this, 'Webhook errors', {
      queryDefinitionName: 'GitHub Runners/Webhook errors',
      logGroups: [this.webhook.handler.logGroup],
      queryString: new logs.QueryString({
        filterStatements: [
          `strcontains(@logStream, "${this.webhook.handler.functionName}")`,
          'level = "ERROR"',
        ],
        sort: '@timestamp desc',
        limit: 100,
      }),
    });

    new logs.QueryDefinition(this, 'Orchestration errors', {
      queryDefinitionName: 'GitHub Runners/Orchestration errors',
      logGroups: [singletonLogGroup(this, SingletonLogType.ORCHESTRATOR)],
      queryString: new logs.QueryString({
        filterStatements: [
          'level = "ERROR"',
        ],
        sort: '@timestamp desc',
        limit: 100,
      }),
    });

    new logs.QueryDefinition(this, 'Runner image build errors', {
      queryDefinitionName: 'GitHub Runners/Runner image build errors',
      logGroups: [singletonLogGroup(this, SingletonLogType.RUNNER_IMAGE_BUILD)],
      queryString: new logs.QueryString({
        filterStatements: [
          'strcontains(message, "error") or strcontains(message, "ERROR") or strcontains(message, "Error") or level = "ERROR"',
        ],
        sort: '@timestamp desc',
        limit: 100,
      }),
    });

    new logs.QueryDefinition(this, 'Ignored webhooks', {
      queryDefinitionName: 'GitHub Runners/Ignored webhooks',
      logGroups: [this.webhook.handler.logGroup],
      queryString: new logs.QueryString({
        fields: ['@timestamp', 'message.notice'],
        filterStatements: [
          `strcontains(@logStream, "${this.webhook.handler.functionName}")`,
          'strcontains(message.notice, "Ignoring")',
        ],
        sort: '@timestamp desc',
        limit: 100,
      }),
    });

    new logs.QueryDefinition(this, 'Ignored jobs based on labels', {
      queryDefinitionName: 'GitHub Runners/Ignored jobs based on labels',
      logGroups: [this.webhook.handler.logGroup],
      queryString: new logs.QueryString({
        fields: ['@timestamp', 'message.notice'],
        filterStatements: [
          `strcontains(@logStream, "${this.webhook.handler.functionName}")`,
          'strcontains(message.notice, "Ignoring labels")',
        ],
        sort: '@timestamp desc',
        limit: 100,
      }),
    });

    new logs.QueryDefinition(this, 'Webhook started runners', {
      queryDefinitionName: 'GitHub Runners/Webhook started runners',
      logGroups: [this.webhook.handler.logGroup],
      queryString: new logs.QueryString({
        fields: ['@timestamp', 'message.sfnInput.jobUrl', 'message.sfnInput.labels', 'message.sfnInput.provider'],
        filterStatements: [
          `strcontains(@logStream, "${this.webhook.handler.functionName}")`,
          'message.sfnInput.jobUrl like /http.*/',
        ],
        sort: '@timestamp desc',
        limit: 100,
      }),
    });
  }
}
