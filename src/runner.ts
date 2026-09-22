import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import {
  Annotations,
  aws_cloudwatch as cloudwatch,
  aws_ec2 as ec2,
  aws_lambda as lambda,
  aws_lambda_event_sources as lambda_event_sources,
  aws_logs as logs,
  aws_iam as iam,
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
  AnyRunnerConfig,
  AwsImageBuilderFailedBuildNotifier,
  CodeBuildImageBuilderFailedBuildNotifier,
  CodeBuildRunnerProvider,
  Ec2RunnerProvider,
  EcsRunnerProvider,
  FargateRunnerProvider,
  ICompositeProvider,
  IParameterizedRunnerProvider,
  IRunnerProvider,
  isParameterizedRunnerProvider,
  LambdaRunnerProvider,
  ProviderRetryOptions,
} from './providers';
import { Secrets } from './secrets';
import { SetupFunction } from './setup-function';
import { StatusFunction } from './status-function';
import { StolenRunnerDetector } from './stolen-runners';
import { TokenRetrieverFunction } from './token-retriever-function';
import { TokenRetrieverInput } from './token-retriever.lambda';
import { dedupeStateMachineTokens, discoverCertificateFiles, singletonLogGroup, SingletonLogType } from './utils';
import { WarmRunnerManagerFunction } from './warm-runner-manager-function';
import { GithubWebhookHandler } from './webhook';
import { GithubWebhookRedelivery } from './webhook-redelivery';

/**
 * One state machine fragment per runner family. Each fragment reads the provider config out of the execution state,
 * so the state machine doesn't grow with the number of providers.
 */
const FAMILY_FRAGMENTS = new Map<string, (scope: Construct) => stepfunctions.IChainable>([
  [CodeBuildRunnerProvider._FAMILY, CodeBuildRunnerProvider._stateMachineFragment],
  [Ec2RunnerProvider._FAMILY, Ec2RunnerProvider._stateMachineFragment],
  [EcsRunnerProvider._FAMILY, EcsRunnerProvider._stateMachineFragment],
  [FargateRunnerProvider._FAMILY, FargateRunnerProvider._stateMachineFragment],
  [LambdaRunnerProvider._FAMILY, LambdaRunnerProvider._stateMachineFragment],
]);


/**
 * JSONata expression that points `$.providerParams` at `configExpr` and merges the standard runner tags into its `tags` field. Also handles
 * distribution in one simple step.
 *
 * Tags are included even for provider that may not use them for debugging purposes. They are visible in the step function state.
 *
 * The standard tags only have values at runtime, so providers can't bake them in at synth time. Provider tags can override our tags.
 *
 * `GitHubRunners:Provider` should name the provider that actually runs the job, which is not `$.provider` when we got here through a composite, so
 * the config's own `provider` field wins when it has one.
 *
 * `runnerGroup` gets a default so an unknown provider, whose lookup finds nothing, still produces params the next states can read. Without it the
 * token retriever fails on a missing reference path instead of reaching `Unknown provider`.
 *
 * Labels are tagged as they come in, so the tag shows what the runner registers with, warm runner and provider selector labels included. Configs
 * that ask for `cleanLabels` get the same labels with spaces instead of the commas ECS rejects, and anything else it rejects as an underscore.
 */
function selectProviderParams(configExpr: string): string {
  return `$merge([
    $states.input,
    {'providerParams': (
      $selected := ${configExpr};
      $r := $random() * $selected.totalWeight;
      $config := $exists($selected.distribute) ? $selected.distribute[threshold > $r][0].config : $selected;
      $merge([{'family': 'provider not found', 'runnerGroup': ''}, $config, {'tags': $append(
        [
          {'Key': 'Name', 'Value': $states.context.Execution.Name},
          {'Key': 'GitHubRunners:Provider', 'Value': $config.provider},
          {'Key': 'GitHubRunners:Repo', 'Value': $states.input.owner & '/' & $states.input.repo},
          {'Key': 'GitHubRunners:Labels', 'Value': $config.cleanLabels ? $replace($join($split($states.input.labels, ','), ' '), /[^A-Za-z0-9 _.:\\/=+@-]/, '_') : $states.input.labels}
        ][$not(Key in $config.tags.Key)],
        $config.tags)}])
    )}
  ])`;
}

/**
 * Every family a provider config can reach, walking fallback chains and distribution lists.
 */
function configFamilies(config?: AnyRunnerConfig): string[] {
  if (!config) {
    return [];
  }
  if ('distribute' in config) {
    return config.distribute.flatMap(option => configFamilies(option.config));
  }
  return [config.family, ...configFamilies(config.fallback)];
}

/**
 * Big static strings the fragments read from `$.config`, like the EC2 userdata templates. They stay out of the
 * per-provider configs because every provider of the family shares them.
 */
const FAMILY_CONSTANTS = new Map<string, () => Record<string, string>>([
  [Ec2RunnerProvider._FAMILY, Ec2RunnerProvider._stateMachineConstants],
]);

/**
 * Properties for GitHubRunners
 */
export interface GitHubRunnersProps {
  /**
   * List of runner providers to use. At least one provider is required. Provider will be selected when its label matches the labels requested by the workflow job.
   *
   * @default CodeBuild, Lambda and Fargate runners with all the defaults (no VPC or default account VPC)
   */
  readonly providers?: (IRunnerProvider | ICompositeProvider)[];

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
   * **Note:** This only affects management functions that interact with GitHub. Lambda functions that help with runner image building and don't interact with GitHub are NOT affected by this setting and will run outside the VPC.
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
   *
   * **Note:** This only affects management functions that interact with GitHub. Lambda functions that help with runner image building and don't interact with GitHub are NOT affected by this setting.
   */
  readonly vpcSubnets?: ec2.SubnetSelection;

  /**
   * Allow management functions to run in public subnets. Lambda Functions in a public subnet can NOT access the internet.
   *
   * **Note:** This only affects management functions that interact with GitHub. Lambda functions that help with runner image building and don't interact with GitHub are NOT affected by this setting.
   *
   * @default false
   */
  readonly allowPublicSubnet?: boolean;

  /**
   * Security group attached to all management functions. Use this with to provide access to GitHub Enterprise Server hosted inside a VPC.
   *
   * **Note:** This only affects management functions that interact with GitHub. Lambda functions that help with runner image building and don't interact with GitHub are NOT affected by this setting.
   *
   * @deprecated use {@link securityGroups} instead
   */
  readonly securityGroup?: ec2.ISecurityGroup;

  /**
   * Security groups attached to all management functions. Use this to provide outbound access from management functions to GitHub Enterprise Server hosted inside a VPC.
   *
   * **Note:** This only affects management functions that interact with GitHub. Lambda functions that help with runner image building and don't interact with GitHub are NOT affected by this setting.
   *
   * **Note:** Defining inbound rules on this security group does nothing. This security group only controls outbound access FROM the management functions. To limit access TO the webhook or setup functions, use {@link webhookAccess} and {@link setupAccess} instead.
   */
  readonly securityGroups?: ec2.ISecurityGroup[];

  /**
   * Path to a certificate file (.pem or .crt) or a directory containing certificate files (.pem or .crt) required to trust GitHub Enterprise Server. Use this when GitHub Enterprise Server certificates are self-signed.
   *
   * If a directory is provided, all .pem and .crt files in that directory will be used. The certificates will be concatenated into a single file for use by Node.js.
   *
   * You may also want to use custom images for your runner providers that contain the same certificates. See {@link RunnerImageComponent.extraCertificates}.
   *
   * ```typescript
   * const selfSignedCertificates = 'certs/ghes.pem'; // or 'path-to-my-extra-certs-folder' for a directory
   * const imageBuilder = CodeBuildRunnerProvider.imageBuilder(this, 'Image Builder with Certs');
   * imageBuilder.addComponent(RunnerImageComponent.extraCertificates(selfSignedCertificates, 'private-ca'));
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
   *     extraCertificates: selfSignedCertificates,
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
   * Retries use full jitter, so total time spent waiting is about half the sum of min(interval * backoffRate ^ attempt, maxDelay) over all attempts.
   *
   * @default retry 210 times over a bit more than 24 hours
   */
  readonly retryOptions?: ProviderRetryOptions;

  /**
   * Optional Lambda function to customize provider selection logic and label assignment.
   *
   * * The function receives the webhook payload along with default provider and its labels as {@link ProviderSelectorInput}
   * * The function returns a selected provider and its labels as {@link ProviderSelectorResult}
   * * You can decline to provision a runner by returning undefined as the provider selector result
   * * You can fully customize the labels for the about-to-be-provisioned runner (add, remove, modify, dynamic labels, etc.)
   * * Labels don't have to match the labels originally configured for the provider, but see warnings below
   * * This function will be called synchronously during webhook processing, so it should be fast and efficient (webhook limit is 30 seconds total)
   *
   * **WARNING: It is your responsibility to ensure the selected provider's labels match the job's required labels. If you return the wrong labels, the runner will be created but GitHub Actions will not assign the job to it.**
   *
   * **WARNING: Provider selection is not a guarantee that a specific provider will be assigned for the job. GitHub Actions may assign the job to any runner with matching labels. The provider selector only determines which provider's runner will be *created*, but GitHub Actions may route the job to any available runner with the required labels.**
   *
   * **For reliable provider assignment based on job characteristics, consider using repo-level runner registration where you can control which runners are available for specific repositories. This information is also available while using the setup wizard.
   *
   * @see https://github.com/CloudSnorkel/cdk-github-runners/blob/main/SETUP_GITHUB.md
   */
  readonly providerSelector?: lambda.IFunction;
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
  readonly providers: (IRunnerProvider | ICompositeProvider)[];

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
  private readonly redeliverer: GithubWebhookRedelivery;
  private readonly orchestrator: stepfunctions.StateMachine;
  private readonly stolenRunnerDetector: StolenRunnerDetector;
  private readonly setupUrl: string;
  private readonly extraLambdaEnv: { [p: string]: string } = {};
  private readonly extraLambdaProps: lambda.FunctionOptions;
  private stateMachineLogGroup?: logs.LogGroup;
  private readonly parameterizedProviders: IParameterizedRunnerProvider[] = [];
  private jobsCompletedMetricFiltersInitialized = false;
  private stolenRunnersMetricFilterInitialized = false;
  private warmRunnerManager?: lambda.Function;
  private warmRunnerQueue?: sqs.Queue;
  private warmConfigHashes: string[] = [];
  private deleteFailedRunnerFunction?: lambda.IFunction;
  private readonly managementFunctions: lambda.IFunction[] = [];

  constructor(scope: Construct, id: string, readonly props?: GitHubRunnersProps) {
    super(scope, id);

    this.secrets = new Secrets(this, 'Secrets');

    this.extraLambdaProps = {
      vpc: this.props?.vpc,
      vpcSubnets: this.props?.vpcSubnets,
      allowPublicSubnet: this.props?.allowPublicSubnet,
      securityGroups: this.lambdaSecurityGroups(),
      layers: [],
    };
    this.connections = new ec2.Connections({ securityGroups: this.extraLambdaProps.securityGroups });

    this.createCertificateLayer(scope);

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
      Annotations.of(this).addError('At least one runner provider is required');
    }

    this.checkIntersectingLabels();

    // the state machine only knows how to run the built-in providers
    // instanceof doesn't really work in CDK so duck-type instead
    for (const provider of this.providers) {
      if (!isParameterizedRunnerProvider(provider)) {
        Annotations.of(provider).addError(
          'Custom runner providers are not supported. Use the built-in providers, or open an issue describing your use case.',
        );
        continue;
      }
      this.parameterizedProviders.push(provider);
    }

    this.orchestrator = this.stateMachine(props);
    this.stolenRunnerDetector = new StolenRunnerDetector(this, 'Stolen Runners', {
      secrets: this.secrets,
      orchestrator: this.orchestrator,
      runnerLogGroups: [...this.extractUniqueSubProviders()].map(p => p.logGroup),
      extraLambdaProps: this.extraLambdaProps,
      extraLambdaEnv: this.extraLambdaEnv,
    });
    this.webhook = new GithubWebhookHandler(this, 'Webhook Handler', {
      orchestrator: this.orchestrator,
      secrets: this.secrets,
      access: this.props?.webhookAccess ?? LambdaAccess.lambdaUrl(),
      providers: this.providers.reduce<Record<string, string[]>>((acc, p) => {
        acc[p.node.path] = p.labels;
        return acc;
      }, {}),
      requireSelfHostedLabel: this.props?.requireSelfHostedLabel ?? true,
      providerSelector: this.props?.providerSelector,
      stolenRunnerQueue: this.stolenRunnerDetector.queue,
      extraLambdaProps: this.extraLambdaProps,
      extraLambdaEnv: this.extraLambdaEnv,
      idleTimeoutSeconds: this.props?.idleTimeout?.toSeconds(),
    });
    this.stolenRunnerDetector.grantRecordRunners(this.webhook.handler);
    this.redeliverer = new GithubWebhookRedelivery(this, 'Webhook Redelivery', {
      secrets: this.secrets,
      extraLambdaProps: this.extraLambdaProps,
      extraLambdaEnv: this.extraLambdaEnv,
    });

    this.managementFunctions.push(this.webhook.handler, this.redeliverer.handler, this.stolenRunnerDetector.handler);

    this.setupUrl = this.setupFunction();
    this.statusFunction();
  }

  private stateMachine(props?: GitHubRunnersProps) {
    // runs after the config is selected so it can check the selected config against the GitHub setup, and fail before any provider starts an
    // instance, a build, or a task
    const tokenRetrieverTask = new stepfunctions_tasks.LambdaInvoke(
      this,
      'Get Runner Token',
      {
        lambdaFunction: this.tokenRetriever(),
        payloadResponseOnly: true,
        resultPath: '$.runner',
        payload: stepfunctions.TaskInput.fromObject(<TokenRetrieverInput>{
          owner: stepfunctions.JsonPath.stringAt('$.owner'),
          repo: stepfunctions.JsonPath.stringAt('$.repo'),
          runnerName: stepfunctions.JsonPath.stringAt('$$.Execution.Name'),
          installationId: stepfunctions.JsonPath.numberAt('$.installationId'),
          group: stepfunctions.JsonPath.stringAt('$.providerParams.runnerGroup'),
        }),
      },
    );

    const idleReaper = this.idleReaper();
    const defaultIdleSeconds = (props?.idleTimeout ?? cdk.Duration.minutes(5)).toSeconds();

    const queueIdleReaperTask = new stepfunctions_tasks.SqsSendMessage(this, 'Queue Idle Reaper', {
      queue: this.idleReaperQueue(idleReaper),
      queryLanguage: stepfunctions.QueryLanguage.JSONATA,
      messageBody: stepfunctions.TaskInput.fromObject({
        executionArn: '{% $states.context.Execution.Id %}',
        runnerName: '{% $states.context.Execution.Name %}',
        owner: '{% $states.input.owner %}',
        repo: '{% $states.input.repo %}',
        installationId: '{% $states.input.installationId %}',
        maxIdleSeconds: `{% $exists($states.input.maxIdleSeconds) ? $states.input.maxIdleSeconds : ${defaultIdleSeconds} %}`,
      }),
      outputs: '{% $states.input %}', // discard
    });

    // we embed every provider's config in the definition and look it up by the provider path the webhook sends
    // the fragments then read it from $.providerParams, so one fragment per family runs any number of providers
    const providerConfigs: Record<string, AnyRunnerConfig> = {};
    const usedFamilies = new Set<string>();
    for (const provider of this.parameterizedProviders) {
      const providerConfig = provider._runnerConfig();
      providerConfigs[provider.node.path] = providerConfig;
      for (const family of configFamilies(providerConfig)) {
        if (!FAMILY_FRAGMENTS.has(family)) {
          Annotations.of(provider).addError(
            `Unknown runner family "${family}". Available families are: ${[...FAMILY_FRAGMENTS.keys()].sort().join(', ')}.`,
          );
          continue;
        }
        usedFamilies.add(family);
      }
    }
    const families = [...usedFamilies].sort();
    const providerConsts: Record<string, string> = {};
    for (const family of families) {
      Object.assign(providerConsts, FAMILY_CONSTANTS.get(family)?.() ?? {});
    }
    const configPass = new stepfunctions.Pass(this, 'Load Config', {
      // variables that don't need to be part of the state
      // states are limited to 256kb but variables can have up to 10mb
      // easier to debug with smaller states too
      assign: {
        providerConfigs,
        ...providerConsts,
      },
    });

    const selectConfig = new stepfunctions.Pass(this, 'Select Provider Config', {
      queryLanguage: stepfunctions.QueryLanguage.JSONATA,
      outputs: `{% ${selectProviderParams('$lookup($providerConfigs, $states.input.provider)')} %}`,
    });

    const providerFamilyChooser = new stepfunctions.Choice(this, 'Choose Provider Family');


    // one fragment per family in use, with stable construct IDs so adding or removing providers doesn't change the state machine
    for (const family of families) {
      const builder = FAMILY_FRAGMENTS.get(family)!;
      providerFamilyChooser.when(
        stepfunctions.Condition.stringEquals('$.providerParams.family', family),
        builder(this),
      );
    }

    providerFamilyChooser.otherwise(new stepfunctions.Succeed(this, 'Unknown provider'));

    // a config can chain a fallback to try when it fails (CompositeProvider.fallback, EC2 subnets)
    // this parallel catches the failure, cleans up the runner, and loops back with the next config
    const tryProvider = new stepfunctions.Parallel(this, 'Try Provider').branch(providerFamilyChooser);

    this.deleteFailedRunnerFunction ??= this.deleteFailedRunner();
    const fallbackCleanup = new stepfunctions_tasks.LambdaInvoke(this, 'Clean Up Failed Runner', {
      comment: 'Clean-up failed runner from GitHub Actions (if present)',
      lambdaFunction: this.deleteFailedRunnerFunction,
      payloadResponseOnly: true,
      resultPath: '$.delete',
      payload: stepfunctions.TaskInput.fromObject({
        runnerName: stepfunctions.JsonPath.stringAt('$$.Execution.Name'),
        owner: stepfunctions.JsonPath.stringAt('$.owner'),
        repo: stepfunctions.JsonPath.stringAt('$.repo'),
        installationId: stepfunctions.JsonPath.numberAt('$.installationId'),
      }),
    });
    fallbackCleanup.addRetry({
      errors: ['RunnerBusy'],
      interval: cdk.Duration.minutes(1),
      backoffRate: 1,
      maxAttempts: 60,
    });

    const fallbackChoice = new stepfunctions.Choice(this, 'Fallback Configured?');
    const useFallback = new stepfunctions.Pass(this, 'Use Fallback Config', {
      queryLanguage: stepfunctions.QueryLanguage.JSONATA,
      outputs: `{% ${selectProviderParams('$states.input.providerParams.fallback')} %}`,
    });
    const allFailed = new stepfunctions.Fail(this, 'All Attempts Failed', {
      // re-raise the last error so the outer catch and retry see the original failure
      // it's a state of its own so a red clean-up always means the clean-up itself broke (#989)
      comment: 'Fail the execution with the original error that stopped the runner',
      errorPath: stepfunctions.JsonPath.stringAt('$.error.Error'),
      causePath: stepfunctions.JsonPath.stringAt('$.error.Cause'),
    });

    tryProvider.addCatch(fallbackCleanup, { errors: [stepfunctions.Errors.ALL], resultPath: '$.error' });
    // the clean-up lambda reports what it did in $.delete instead of failing
    // either way we move on to the next fallback config
    fallbackCleanup.next(fallbackChoice);
    fallbackCleanup.addCatch(fallbackChoice, { errors: [stepfunctions.Errors.ALL], resultPath: stepfunctions.JsonPath.DISCARD });
    fallbackChoice.when(stepfunctions.Condition.isPresent('$.providerParams.fallback'), useFallback);
    fallbackChoice.otherwise(allFailed);
    useFallback.next(tryProvider);

    // one parallel is enough now: the fallback loop above already cleaned up the runner before it gave up
    // we used to need two nested ones just to clean up before the retry, because Retry runs before Catch
    const runProviders = new stepfunctions.Parallel(this, 'Run Providers').branch(
      // we get a token for every retry because the token can expire faster than the job can timeout
      selectConfig.next(tokenRetrieverTask).next(tryProvider),
    );

    if (props?.retryOptions?.retry ?? true) {
      // we aim to wait at most 24 hours because that's when github jobs time out
      const interval = props?.retryOptions?.interval ?? cdk.Duration.minutes(1);
      // a shorter maxDelay needs more attempts to cover the same 24 hours, and every attempt costs execution history
      // events that Step Functions caps at 25,000. measured on this state machine, a failed attempt costs 25 events
      // for a provider with no fallback and 73 for a four config fallback chain, so 210 attempts land around 15,000
      // while a 5 minute cap would need ~600 attempts and go right past it
      //
      // those are normal path numbers and not a ceiling. a longer fallback chain costs more, and an attempt whose
      // clean-up keeps hitting RunnerBusy costs 793, which no attempt count that still covers 24 hours can fit
      //
      // if the execution history limit does hit, we will end give up on this runner. this would only happen when we
      // are having lots of issues provisioning a runners. stolen runner detector may end up replacing it when the
      // errors finally stop.
      const maxDelay = props?.retryOptions?.maxDelay ?? cdk.Duration.minutes(15);
      const maxAttempts = props?.retryOptions?.maxAttempts ?? 210;
      const backoffRate = props?.retryOptions?.backoffRate ?? 2;

      // jitter picks a random wait between zero and the interval, so we wait half of it on average
      // we aim a bit over 24 hours so most jobs keep retrying for the whole day they can wait
      // if we do stop early, the job will steal another runner and the stolen runner detector will replace it
      //
      // the wait grows geometrically until it hits maxDelay and stays there, so the total is a geometric
      // series plus a flat tail. maxAttempts is a public option, so we don't want to loop over it
      const growingAttempts = backoffRate > 1
        ? Math.min(maxAttempts, Math.max(0, Math.ceil(Math.log(maxDelay.toSeconds() / interval.toSeconds()) / Math.log(backoffRate))))
        : (interval.toSeconds() < maxDelay.toSeconds() ? maxAttempts : 0);
      const growingSeconds = backoffRate === 1
        ? interval.toSeconds() * growingAttempts
        : interval.toSeconds() * (backoffRate ** growingAttempts - 1) / (backoffRate - 1);
      const totalSeconds = (growingSeconds + (maxAttempts - growingAttempts) * maxDelay.toSeconds()) / 2;

      // the default overshoots 24 hours on purpose, so only complain when it's clearly more than a job can use
      if (totalSeconds >= cdk.Duration.hours(30).toSeconds()) {
        // https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners#usage-limits
        // "Job queue time - Each job for self-hosted runners can be queued for a maximum of 24 hours. If a self-hosted runner does not start
        // executing the job within this limit, the job is terminated and fails to complete."
        Annotations.of(this).addWarning(`Average total retry time is ${Math.floor(totalSeconds / 60 / 60)} hours. Jobs expire after 24`
          + ' hours so it would be a waste of resources to retry further.');
      }

      runProviders.addRetry({
        interval,
        maxDelay,
        maxAttempts,
        backoffRate,
        // without jitter every runner that failed on the same missing capacity or API quota comes back at the exact same time
        jitterStrategy: stepfunctions.JitterType.FULL,
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
        definitionBody: stepfunctions.DefinitionBody.fromChainable(queueIdleReaperTask.next(configPass).next(runProviders)),
        definitionSubstitutions: dedupeStateMachineTokens(this, { providerConfigs, providerConsts }),
        logs: logOptions,
      },
    );

    stateMachine.grantRead(idleReaper);
    stateMachine.grantExecution(idleReaper, 'states:StopExecution');
    for (const provider of this.parameterizedProviders) {
      provider._grantStateMachine(stateMachine);
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

    this.managementFunctions.push(func);

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

    this.managementFunctions.push(func);

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

    // composite providers return an array of statuses, regular providers return a single status
    const providers = this.parameterizedProviders.flatMap(provider => provider._status(statusFunction));

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

    this.managementFunctions.push(statusFunction);

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

    this.managementFunctions.push(setupFunction);

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
            Annotations.of(this).addError(`Both ${p1.node.path} and ${p2.node.path} use the same labels [${p1.labels.join(', ')}]`);
            return;
          }
          Annotations.of(p1).addWarning(`Labels [${p1.labels.join(', ')}] intersect with another provider (${p2.node.path} -- [${p2.labels.join(', ')}]). If a workflow specifies the labels [${p1.labels.join(', ')}], it is not guaranteed which provider will be used. It is recommended you do not use intersecting labels`);
        }
      }
    }
  }

  private idleReaper() {
    const func = new IdleRunnerRepearFunction(this, 'Idle Reaper', {
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

    this.managementFunctions.push(func);

    return func;
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
      maxBatchingWindow: cdk.Duration.minutes(1),
      batchSize: 10,
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
   * Extracts all unique IRunnerProvider instances from providers and composite providers (one level only).
   * Uses a Set to ensure we don't process the same provider twice, even if it's used in multiple composites.
   *
   * @returns Set of unique IRunnerProvider instances
   */
  private extractUniqueSubProviders(): Set<IRunnerProvider> {
    const seen = new Set<IRunnerProvider>();
    for (const provider of this.providers) {
      // instanceof doesn't really work in CDK so use this hack instead
      if ('logGroup' in provider) {
        // Regular provider
        seen.add(provider);
      } else {
        // Composite provider - access the providers field
        for (const subProvider of provider.providers) {
          seen.add(subProvider);
        }
      }
    }
    return seen;
  }

  /**
   * Creates a Lambda layer with certificates if extraCertificates is specified.
   */
  private createCertificateLayer(scope: Construct): void {
    if (!this.props?.extraCertificates) {
      return;
    }

    const certificateFiles = discoverCertificateFiles(this.props.extraCertificates);

    // Concatenate all certificates into a single file for NODE_EXTRA_CA_CERTS
    let combinedCertContent = '';
    for (const certFile of certificateFiles) {
      const certContent = fs.readFileSync(certFile, 'utf8');
      combinedCertContent += certContent;
      // Ensure proper PEM format with newline between certificates
      if (!certContent.endsWith('\n')) {
        combinedCertContent += '\n';
      }
    }

    // Create a temporary directory, write the certificate file, create asset, then delete temp dir
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'certificate-layer-'));
    try {
      const certPath = path.join(workdir, 'certs.pem');
      fs.writeFileSync(certPath, combinedCertContent);

      // Set environment variable and create layer
      this.extraLambdaEnv.NODE_EXTRA_CA_CERTS = '/opt/certs.pem';
      this.extraLambdaProps.layers!.push(
        new lambda.LayerVersion(scope, 'Certificate Layer', {
          description: 'Layer containing GitHub Enterprise Server certificate(s) for cdk-github-runners',
          code: lambda.Code.fromAsset(workdir),
        }),
      );
    } finally {
      // Calling `fromAsset()` has copied files to the assembly, so we can delete the temporary directory.
      fs.rmSync(workdir, { recursive: true, force: true });
    }
  }

  /**
   * Metric for the number of GitHub Actions jobs completed. It has `ProviderLabels` and `Status` dimensions. The status can be one of "Succeeded", "SucceededWithIssues", "Failed", "Canceled", "Skipped", or "Abandoned".
   *
   * **WARNING:** this method creates a metric filter for each provider. Each metric has a status dimension with six possible values. These resources may incur cost.
   */
  public metricJobCompleted(props?: cloudwatch.MetricOptions): cloudwatch.Metric {
    if (!this.jobsCompletedMetricFiltersInitialized) {
      // we can't use logs.FilterPattern.spaceDelimited() because it has no support for ||
      // status list taken from https://github.com/actions/runner/blob/be9632302ceef50bfb36ea998cea9c94c75e5d4d/src/Sdk/DTWebApi/WebApi/TaskResult.cs
      // we need "..." for Lambda that prefixes some extra data to log lines
      const pattern = logs.FilterPattern.literal('[..., marker = "CDKGHA", job = "JOB", done = "DONE", labels, status = "Succeeded" || status = "SucceededWithIssues" || status = "Failed" || status = "Canceled" || status = "Skipped" || status = "Abandoned"]');

      // Extract all unique sub-providers from regular and composite providers
      // Build a set first to avoid filtering the same log twice
      for (const p of this.extractUniqueSubProviders()) {
        const metricFilter = p.logGroup.addMetricFilter(`${p.logGroup.node.id} filter`, {
          metricNamespace: 'GitHubRunners',
          metricName: 'JobCompleted',
          filterPattern: pattern,
          metricValue: '1',
          // can't with dimensions -- defaultValue: 0,
          dimensions: {
            ProviderLabels: '$labels',
            Status: '$status',
          },
        });

        if (metricFilter.node.defaultChild instanceof logs.CfnMetricFilter) {
          metricFilter.node.defaultChild.addPropertyOverride('MetricTransformations.0.Unit', 'Count');
        } else {
          Annotations.of(metricFilter).addWarning('Unable to set metric filter Unit to Count');
        }
      }
      this.jobsCompletedMetricFiltersInitialized = true;
    }

    return new cloudwatch.Metric({
      namespace: 'GitHubRunners',
      metricName: 'JobsCompleted',
      unit: cloudwatch.Unit.COUNT,
      statistic: cloudwatch.Stats.SUM,
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
  public metricSucceeded(props?: cloudwatch.MetricOptions): cloudwatch.Metric {
    return this.orchestrator.metricSucceeded(props);
  }

  /**
   * Metric for failed runner executions.
   *
   * A failed runner usually means the runner failed to start and so a job was never executed. It doesn't necessarily mean the job was executed and failed. For that, see {@link metricJobCompleted}.
   */
  public metricFailed(props?: cloudwatch.MetricOptions): cloudwatch.Metric {
    return this.orchestrator.metricFailed(props);
  }

  /**
   * Metric for the interval, in milliseconds, between the time the execution starts and the time it closes. This time may be longer than the time the runner took.
   */
  public metricTime(props?: cloudwatch.MetricOptions): cloudwatch.Metric {
    return this.orchestrator.metricTime(props);
  }

  /**
   * Metric for the number of runners that were stolen by a job that shouldn't have been assigned to them.
   *
   * A high number here means your runners are shared with jobs you didn't mean to serve. Use the "Stolen runners"
   * CloudWatch Logs Insights query created by {@link createLogsInsightsQueries} to see which repositories and jobs
   * are taking them.
   *
   * This metric has two dimensions:
   *  1. `Replaced` which is "true" or "false" indicating whether the stolen runner was replaced. A runner may not be replaced if it was stolen too
   *     many times in a row. The current limit is 3. When this is false, there is probably a bug in our detection or something misconfigured.
   *  2. `Provider` is the provider construct path of the runner that was stolen. You can check your code to see which labels it has that may cause
   *     it to be stolen. The logs insights queries can provide even more information about the stolen runners.
   *
   * **WARNING:** this method creates a metric filter. This resource may incur cost.
   */
  public metricStolenRunners(props?: cloudwatch.MetricOptions): cloudwatch.Metric {
    if (!this.stolenRunnersMetricFilterInitialized) {
      singletonLogGroup(this, SingletonLogType.ORCHESTRATOR).addMetricFilter('Stolen Runners filter', {
        metricNamespace: 'GitHubRunners',
        metricName: 'StolenRunners',
        filterPattern: logs.FilterPattern.stringValue('$.message.metric', '=', 'StolenRunnerDetected'),
        metricValue: '1',
        // can't with dimensions -- defaultValue: 0,
        dimensions: {
          Replaced: '$.message.replaced',
          Provider: '$.message.provider',
        },
      });
      this.stolenRunnersMetricFilterInitialized = true;
    }

    return new cloudwatch.Metric({
      namespace: 'GitHubRunners',
      metricName: 'StolenRunners',
      unit: cloudwatch.Unit.COUNT,
      statistic: cloudwatch.Stats.SUM,
      ...props,
    }).attachTo(this);
  }

  /**
   * Metric for the number of failed invocations of the management Lambda functions.
   *
   * These are the functions that handle webhooks, retrieve runner tokens, stop idle runners, replace stolen runners, etc. Anything over zero means
   * jobs may not have gotten a runner. You should use this metric to trigger an alarm.
   *
   * Only unhandled errors are counted here, as reported by Lambda itself. Errors that are handled and logged, like a webhook with a bad signature,
   * are not failed invocations. Use the "Webhook errors" and "Orchestration errors" queries created by {@link createLogsInsightsQueries} to find
   * those.
   *
   * Management functions created after this method is called are not included. Call it last if you use warm runners.
   */
  public metricLambdaErrors(props?: cloudwatch.MathExpressionOptions): cloudwatch.MathExpression {
    const errors: Record<string, cloudwatch.IMetric> = {};
    this.managementFunctions.forEach((f, i) => {
      errors[`e${i}`] = f.metricErrors();
    });

    return new cloudwatch.MathExpression({
      // SUM() and not e0+e1+... so periods where only some of the functions ran still get a value
      expression: `SUM([${Object.keys(errors).join(',')}])`,
      usingMetrics: errors,
      label: 'Errors',
      ...props,
    });
  }

  /**
   * Creates a topic for notifications when a runner image build fails.
   *
   * Runner images are rebuilt every week by default. This provides the latest GitHub Runner version and software updates.
   *
   * If you want to be sure you are using the latest runner version, you can use this topic to be notified when a build fails.
   *
   * When the image builder is defined in a separate stack (e.g. in a split-stacks setup), pass that stack or construct
   * as the optional scope so the topic and failure-notification aspects are created in the same stack as the image
   * builder. Otherwise the aspects may not find the image builder resources.
   *
   * @param scope Optional scope (e.g. the image builder stack) where the topic and aspects will be created. Defaults to this construct.
   */
  public failedImageBuildsTopic(scope?: Construct) {
    scope ??= this;
    const topic = new sns.Topic(scope, 'Failed Runner Image Builds');
    const stack = cdk.Stack.of(scope);
    cdk.Aspects.of(stack).add(new CodeBuildImageBuilderFailedBuildNotifier(topic));
    cdk.Aspects.of(stack).add(
      new AwsImageBuilderFailedBuildNotifier(
        AwsImageBuilderFailedBuildNotifier.createFilteringTopic(scope, topic),
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
   * * "Warm runner status" and "Warm runner errors" (when warm runners are configured)
   *
   * @param prefix Prefix for the query definitions. Defaults to "GitHub Runners".
   */
  public createLogsInsightsQueries(prefix = 'GitHub Runners') {
    new logs.QueryDefinition(this, 'Webhook errors', {
      queryDefinitionName: `${prefix}/Webhook errors`,
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
      queryDefinitionName: `${prefix}/Orchestration errors`,
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
      queryDefinitionName: `${prefix}/Runner image build errors`,
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
      queryDefinitionName: `${prefix}/Ignored webhooks`,
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
      queryDefinitionName: `${prefix}/Ignored jobs based on labels`,
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
      queryDefinitionName: `${prefix}/Webhook started runners`,
      logGroups: [this.webhook.handler.logGroup],
      queryString: new logs.QueryString({
        fields: ['@timestamp', 'message.sfnInput.jobUrl', 'message.sfnInput.jobLabels', 'message.sfnInput.labels', 'message.sfnInput.provider'],
        filterStatements: [
          `strcontains(@logStream, "${this.webhook.handler.functionName}")`,
          'message.sfnInput.jobUrl like /http.*/',
        ],
        sort: '@timestamp desc',
        limit: 100,
      }),
    });

    new logs.QueryDefinition(this, 'Webhook redeliveries', {
      queryDefinitionName: `${prefix}/Webhook redeliveries`,
      logGroups: [this.redeliverer.handler.logGroup],
      queryString: new logs.QueryString({
        fields: ['@timestamp', 'message.notice', 'message.deliveryId', 'message.guid'],
        filterStatements: [
          'isPresent(message.deliveryId)',
        ],
        sort: '@timestamp desc',
        limit: 100,
      }),
    });

    new logs.QueryDefinition(this, 'Stolen runners', {
      queryDefinitionName: `${prefix}/Stolen runners`,
      logGroups: [singletonLogGroup(this, SingletonLogType.ORCHESTRATOR)],
      queryString: new logs.QueryString({
        fields: [
          '@timestamp', 'message.notice', 'message.stolenRunnerName', 'message.runnerName', 'message.stolenByJobId',
          'message.jobUrl', 'message.owner', 'message.repo', 'message.provider',
        ],
        filterStatements: [
          'isPresent(message.metric) and strcontains(message.metric, "Stolen")',
        ],
        sort: '@timestamp desc',
        limit: 100,
      }),
    });

    new logs.QueryDefinition(this, 'Warm runner status', {
      queryDefinitionName: `${prefix}/Warm runner status`,
      logGroups: [singletonLogGroup(this, SingletonLogType.ORCHESTRATOR)],
      queryString: new logs.QueryString({
        fields: ['@timestamp', 'message.notice', 'message.input.runnerName', 'message.input.providerPath', 'message.started', 'message.stillRunning', 'message.runnerBusy'],
        filterStatements: [
          cdk.Lazy.string({
            produce: () => {
              if (this.warmRunnerManager) {
                return `strcontains(@logStream, "${this.warmRunnerManager.functionName}")`;
              } else {
                return 'WARM RUNNERS NOT ENABLED';
              }
            },
          }),
        ],
        sort: '@timestamp desc',
        limit: 200,
      }),
    });

    new logs.QueryDefinition(this, 'Warm runner errors', {
      queryDefinitionName: `${prefix}/Warm runner errors`,
      logGroups: [singletonLogGroup(this, SingletonLogType.ORCHESTRATOR)],
      queryString: new logs.QueryString({
        fields: ['@timestamp', 'message.notice', 'message.input.runnerName', 'message.error'],
        filterStatements: [
          cdk.Lazy.string({
            produce: () => {
              if (this.warmRunnerManager) {
                return `strcontains(@logStream, "${this.warmRunnerManager.functionName}")`;
              } else {
                return 'WARM RUNNERS NOT ENABLED';
              }
            },
          }),
          'level = "ERROR"',
        ],
        sort: '@timestamp desc',
        limit: 100,
      }),
    });
  }

  /**
   * Creates a CloudWatch dashboard with the metrics you need to know if your runners are healthy.
   *
   * It answers the questions you're most likely to ask:
   *
   * * Are jobs running and passing? See "Jobs completed by status".
   * * Which runner is broken? See "Failed jobs by runner label".
   * * Are jobs stuck because runners fail to start? See "Runner executions".
   * * How long do runners take (and therefore cost)? See "Runner time".
   * * Is GitHub reaching the webhook at all? See "Webhook".
   * * Is any of our code failing? See "Lambda errors".
   * * What exactly went wrong? See "Recent errors".
   *
   * **WARNING:** this method calls {@link metricJobCompleted} and {@link metricStolenRunners} which create metric filters.
   * These resources may incur cost.
   *
   * This dashboard is very basic. Pull requests and issues are welcome to improve it.
   *
   * @param name Name of the dashboard. Defaults to "GitHub-Runners".
   */
  public createDashboard(name = 'GitHub-Runners'): cloudwatch.Dashboard {
    // create the metric filters behind these metrics
    this.metricJobCompleted();
    this.metricStolenRunners();

    // our log metric filters add dimensions, and a metric with dimensions can only be read with those dimensions.
    // search expressions let us sum them all up without listing every dimension value.
    const search = (label: string, metricName: string, dimensions?: string) => {
      const query = ['Namespace="GitHubRunners"', `MetricName="${metricName}"`, dimensions].filter(q => q).join(' ');
      return new cloudwatch.MathExpression({
        expression: `SUM(SEARCH('${query}', 'Sum'))`,
        label,
        usingMetrics: {},
      });
    };
    const jobs = (status: string, label: string) => search(label, 'JobCompleted', `Status="${status}"`);

    const dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: name,
      defaultInterval: cdk.Duration.days(1),
    });

    dashboard.addWidgets(new cloudwatch.SingleValueWidget({
      title: 'Summary',
      metrics: [
        jobs('Succeeded', 'Jobs succeeded'),
        jobs('Failed', 'Jobs failed'),
        this.metricFailed({ label: 'Runners failed to start' }),
        search('Stolen runners', 'StolenRunners'),
        this.metricLambdaErrors({ label: 'Lambda errors' }),
      ],
      // totals for the dashboard time range instead of just the last period
      setPeriodToTimeRange: true,
      width: 24,
      height: 4,
    }));

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Jobs completed by status',
        // status list taken from https://github.com/actions/runner/blob/be9632302ceef50bfb36ea998cea9c94c75e5d4d/src/Sdk/DTWebApi/WebApi/TaskResult.cs
        left: ['Succeeded', 'SucceededWithIssues', 'Failed', 'Canceled', 'Skipped', 'Abandoned'].map(s => jobs(s, s)),
        stacked: true,
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Failed jobs by runner label',
        // a search expression can't be labeled per provider, so list the providers to keep the legend readable. this
        // misses labels coming from a custom providerSelector, but "Jobs completed by status" still counts those.
        left: [...this.extractUniqueSubProviders()].map(p => new cloudwatch.Metric({
          namespace: 'GitHubRunners',
          metricName: 'JobCompleted',
          dimensionsMap: {
            ProviderLabels: p.labels.join(','),
            Status: 'Failed',
          },
          label: p.labels.join(', '),
          statistic: cloudwatch.Stats.SUM,
        })),
        stacked: true,
        width: 12,
      }),
    );

    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Runner executions',
        left: [
          this.metricSucceeded({ label: 'Succeeded' }),
          this.metricFailed({ label: 'Failed' }),
          this.orchestrator.metricTimedOut({ label: 'Timed out' }),
        ],
        stacked: true,
        width: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Runner time (including start-up)',
        left: [
          this.metricTime({ statistic: cloudwatch.Stats.p(50), label: 'p50' }),
          this.metricTime({ statistic: cloudwatch.Stats.p(90), label: 'p90' }),
          this.metricTime({ statistic: cloudwatch.Stats.MAXIMUM, label: 'max' }),
        ],
        width: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Webhook',
        left: [
          this.webhook.handler.metricInvocations({ label: 'Requests' }),
          this.webhook.handler.metricErrors({ label: 'Errors' }),
        ],
        width: 6,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda errors',
        // one series per function, so a spike points at the function that needs looking at
        left: this.managementFunctions.map(f => f.metricErrors({
          label: f.node.path.slice(this.node.path.length + 1),
        })),
        stacked: true,
        width: 6,
      }),
    );

    // the orchestrator, webhook and runner management functions log here, setup and status log separately
    dashboard.addWidgets(new cloudwatch.LogQueryWidget({
      title: 'Recent errors',
      logGroupNames: [
        singletonLogGroup(this, SingletonLogType.ORCHESTRATOR).logGroupName,
        singletonLogGroup(this, SingletonLogType.SETUP).logGroupName,
      ],
      view: cloudwatch.LogQueryVisualizationType.TABLE,
      queryString: new logs.QueryString({
        // we log JSON, so `message` is an object and shows up as an empty column. pick out the human readable part of
        // the errors we log ourselves and of the ones Lambda logs for us, and keep the raw record for the details.
        fields: [
          '@timestamp',
          '@logStream',
          'coalesce(message.notice, message.errorMessage, message.name) as error',
          '@message',
        ],
        filterStatements: [
          'level = "ERROR"',
        ],
        sort: '@timestamp desc',
        limit: 20,
      }).toString(),
      width: 24,
      height: 6,
    }));

    return dashboard;
  }

  /**
   * Register a warm runner config hash. All registered hashes are passed to the
   * manager Lambda via WARM_CONFIG_HASHES env var so keepers can detect stale configs.
   *
   * @internal
   */
  public _registerWarmConfigHash(hash: string): void {
    this.warmConfigHashes.push(hash);
  }

  /**
   * Lazily create shared warm runner infrastructure (Lambda, SQS queue).
   * Returns the manager Lambda and queue for use as EventBridge targets.
   *
   * @internal
   */
  public _ensureWarmRunnerInfra(): { lambda: lambda.Function; queue: sqs.Queue } {
    if (this.warmRunnerManager && this.warmRunnerQueue) {
      return { lambda: this.warmRunnerManager, queue: this.warmRunnerQueue };
    }

    this.warmRunnerQueue = new sqs.Queue(this, 'Warm Runner Queue', {
      visibilityTimeout: cdk.Duration.minutes(1),
    });

    this.warmRunnerManager = new WarmRunnerManagerFunction(this, 'Warm Runner Manager', {
      description: 'Manage warm GitHub runners: fill on invoke, keep alive via SQS',
      environment: {
        GITHUB_SECRET_ARN: this.secrets.github.secretArn,
        GITHUB_PRIVATE_KEY_SECRET_ARN: this.secrets.githubPrivateKey.secretArn,
        STEP_FUNCTION_ARN: this.orchestrator.stateMachineArn,
        WARM_RUNNER_QUEUE_URL: this.warmRunnerQueue.queueUrl,
        WARM_CONFIG_HASHES: cdk.Lazy.string({ produce: () => this.warmConfigHashes.join(',') }),
        ...this.extraLambdaEnv,
      },
      timeout: cdk.Duration.seconds(50),
      logGroup: singletonLogGroup(this, SingletonLogType.ORCHESTRATOR),
      loggingFormat: lambda.LoggingFormat.JSON,
      ...this.extraLambdaProps,
    });

    this.managementFunctions.push(this.warmRunnerManager);

    this.secrets.github.grantRead(this.warmRunnerManager);
    this.secrets.githubPrivateKey.grantRead(this.warmRunnerManager);
    this.orchestrator.grantRead(this.warmRunnerManager);
    this.orchestrator.grantStartExecution(this.warmRunnerManager);
    this.orchestrator.grantExecution(this.warmRunnerManager, 'states:StopExecution');

    this.warmRunnerManager.addEventSource(new lambda_event_sources.SqsEventSource(this.warmRunnerQueue, {
      reportBatchItemFailures: true,
      maxBatchingWindow: cdk.Duration.seconds(10),
      batchSize: 10,
    }));
    this.warmRunnerQueue.grantSendMessages(this.warmRunnerManager);

    return { lambda: this.warmRunnerManager, queue: this.warmRunnerQueue };
  }
}
