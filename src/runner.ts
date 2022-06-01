import * as cdk from 'aws-cdk-lib';
import { aws_iam as iam, aws_stepfunctions as stepfunctions, aws_stepfunctions_tasks as stepfunctions_tasks } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { CodeBuildRunner } from './providers/codebuild';
import { IRunnerProvider } from './providers/common';
import { FargateRunner } from './providers/fargate';
import { LambdaRunner } from './providers/lambda';
import { Secrets } from './secrets';
import { BundledNodejsFunction } from './utils';
import { GithubWebhookHandler } from './webhook';

/**
 * Properties for GitHubRunners
 */
export interface GitHubRunnersProps {

  /**
   * Label of default provider in case the workflow job doesn't specify any known label. A provider with that label must be configured.
   *
   * @default 'codebuild'
   */
  readonly defaultProviderLabel?: string;

  /**
   * List of runner providers to use. At least one provider is required. Provider will be selected when its label matches the labels requested by the workflow job.
   *
   * @default CodeBuild, Lambda and Fargate runners with all the defaults (no VPC or default account VPC)
   */
  readonly providers?: IRunnerProvider[];
}

/**
 * Create all the required infrastructure to provide self-hosted GitHub runners. It creates a webhook, secrets, and a step function to orchestrate all runs. Secrets are not automatically filled. See README.md for instructions on how to setup GitHub integration.
 *
 * By default, this will create a runner provider of each available type with the defaults. This is good enough for the initial setup stage when you just want to get GitHub integration working.
 *
 * ```typescript
 * new GitHubRunners(stack, 'runners', {});
 * ```
 *
 * Usually you'd want to configure the runner providers so the runners can run in a certain VPC or have certain permissions.
 *
 * ```typescript
 * const vpc = ec2.Vpc.fromLookup(stack, 'vpc', { vpcId: 'vpc-1234567' });
 * const runnerSg = new ec2.SecurityGroup(stack, 'runner security group', { vpc: vpc });
 * const dbSg = ec2.SecurityGroup.fromSecurityGroupId(stack, 'database security group', 'sg-1234567');
 * const bucket = new s3.Bucket(stack, 'runner bucket');
 *
 * // create a custom CodeBuild provider
 * const myProvider = new CodeBuildRunner(
 *   stack, 'codebuild runner',
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
 *   stack,
 *   'runners',
 *   {
 *     providers: [myProvider],
 *     defaultProviderLabel: 'my-codebuild',
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
   * Default provider as set by {@link GitHubRunnersProps.defaultProviderLabel}.
   */
  readonly defaultProvider: IRunnerProvider;

  /**
   * Secrets for GitHub communication including webhook secret and runner authentication.
   */
  readonly secrets: Secrets;

  private readonly webhook: GithubWebhookHandler;
  private readonly orchestrator: stepfunctions.StateMachine;

  constructor(scope: Construct, id: string, readonly props: GitHubRunnersProps) {
    super(scope, id);

    this.secrets = new Secrets(this, 'Secrets');

    if (this.props.providers) {
      this.providers = this.props.providers;
    } else {
      this.providers = [
        new CodeBuildRunner(this, 'CodeBuild', {}),
        new LambdaRunner(this, 'Lambda', {}),
        new FargateRunner(this, 'Fargate', {}),
      ];
    }

    const defaultProvider = this.getDefaultProvider();
    if (!defaultProvider) {
      throw new Error(`No provider was found for the default label "${this.props.defaultProviderLabel}"`);
    } else {
      this.defaultProvider = defaultProvider;
    }

    this.orchestrator = this.stateMachine();
    this.webhook = new GithubWebhookHandler(this, 'Webhook Handler', {
      orchestrator: this.orchestrator,
      secrets: this.secrets,
    });

    this.statusFunctions();
  }

  private getDefaultProvider(): IRunnerProvider | null {
    for (const provider of this.providers) {
      if ((this.props.defaultProviderLabel || 'codebuild') == provider.label) {
        return provider;
      }
    }

    return null;
  }

  private stateMachine() {
    const tokenRetrieverTask = new stepfunctions_tasks.LambdaInvoke(
      this,
      'Get Runner Token',
      {
        lambdaFunction: this.tokenRetriever(),
        payloadResponseOnly: true,
        resultPath: '$.runner',
      },
    );

    const deleteRunnerTask = new stepfunctions_tasks.LambdaInvoke(
      this,
      'Delete Runner',
      {
        lambdaFunction: this.deleteRunner(),
        payloadResponseOnly: true,
        resultPath: '$.delete',
        payload: stepfunctions.TaskInput.fromObject({
          runnerName: stepfunctions.JsonPath.stringAt('$$.Execution.Name'),
          owner: stepfunctions.JsonPath.stringAt('$.owner'),
          repo: stepfunctions.JsonPath.stringAt('$.repo'),
          runId: stepfunctions.JsonPath.stringAt('$.runId'),
          installationId: stepfunctions.JsonPath.stringAt('$.installationId'),
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
        stepfunctions.Condition.isPresent(`$.labels.${provider.label}`),
        providerTask,
      );
      if (this.defaultProvider == provider) {
        providerChooser.otherwise(providerTask);
      }
    }

    const work = tokenRetrieverTask.next(
      new stepfunctions.Parallel(this, 'Error Catcher', { resultPath: '$.result' })
        .branch(providerChooser)
        .addCatch(
          deleteRunnerTask
            .next(new stepfunctions.Fail(this, 'Runner Failed')),
          {
            resultPath: '$.error',
          },
        ),
    );

    const check = new stepfunctions.Choice(this, 'Is self hosted?')
      .when(stepfunctions.Condition.isNotPresent('$.labels.self-hosted'), new stepfunctions.Succeed(this, 'No'))
      .otherwise(work);

    return new stepfunctions.StateMachine(
      this,
      'Runner Orchestrator',
      {
        definition: check,
      },
    );
  }

  private tokenRetriever() {
    const func = new BundledNodejsFunction(
      this,
      'token-retriever',
      {
        environment: {
          GITHUB_SECRET_ARN: this.secrets.github.secretArn,
          GITHUB_PRIVATE_KEY_SECRET_ARN: this.secrets.githubPrivateKey.secretArn,
        },
        timeout: cdk.Duration.seconds(30),
      },
    );

    this.secrets.github.grantRead(func);
    this.secrets.githubPrivateKey.grantRead(func);

    return func;
  }

  private deleteRunner() {
    const func = new BundledNodejsFunction(
      this,
      'delete-runner',
      {
        environment: {
          GITHUB_SECRET_ARN: this.secrets.github.secretArn,
          GITHUB_PRIVATE_KEY_SECRET_ARN: this.secrets.githubPrivateKey.secretArn,
        },
        timeout: cdk.Duration.seconds(30),
      },
    );

    this.secrets.github.grantRead(func);
    this.secrets.githubPrivateKey.grantRead(func);

    return func;
  }

  private statusFunctions() {
    const func = this.providers.map(provider => {
      return {
        type: provider.constructor.name,
        label: provider.label,
        vpcArn: provider.vpc && provider.vpc.vpcArn,
        securityGroup: provider.securityGroup && provider.securityGroup.securityGroupId,
        roleArn: (provider.grantPrincipal.grantPrincipal as iam.Role).roleArn,
      };
    });

    const statusFunction = new BundledNodejsFunction(
      this,
      'status',
      {
        environment: {
          WEBHOOK_SECRET_ARN: this.secrets.webhook.secretArn,
          GITHUB_SECRET_ARN: this.secrets.github.secretArn,
          GITHUB_PRIVATE_KEY_SECRET_ARN: this.secrets.githubPrivateKey.secretArn,
          WEBHOOK_URL: this.webhook.url,
          PROVIDERS: JSON.stringify(func),
          WEBHOOK_HANDLER_ARN: this.webhook.handler.latestVersion.functionArn,
          STEP_FUNCTION_ARN: this.orchestrator.stateMachineArn,
        },
        timeout: cdk.Duration.minutes(3),
      },
    );

    this.secrets.webhook.grantRead(statusFunction);
    this.secrets.github.grantRead(statusFunction);
    this.secrets.githubPrivateKey.grantRead(statusFunction);
    this.orchestrator.grantRead(statusFunction);

    new cdk.CfnOutput(
      this,
      'status command',
      {
        value: `aws --region ${cdk.Stack.of(this).region} lambda invoke --function-name ${statusFunction.functionName} status.json`,
      },
    );
  }
}
