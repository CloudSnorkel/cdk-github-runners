import * as cdk from 'aws-cdk-lib';
import {
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_stepfunctions as stepfunctions,
  aws_stepfunctions_tasks as stepfunctions_tasks,
} from 'aws-cdk-lib';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
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
   * const imageBuilder = new CodeBuildImageBuilder(this, 'Image Builder with Certs', {
   *     dockerfilePath: CodeBuildRunner.LINUX_X64_DOCKERFILE_PATH,
   * });
   * imageBuilder.addExtraCertificates('path-to-my-extra-certs-folder');
   *
   * const provider = new CodeBuildRunner(this, 'CodeBuild', {
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
        new CodeBuildRunner(this, 'CodeBuild'),
        new LambdaRunner(this, 'Lambda'),
        new FargateRunner(this, 'Fargate'),
      ];
    }

    this.orchestrator = this.stateMachine(props);
    this.webhook = new GithubWebhookHandler(this, 'Webhook Handler', {
      orchestrator: this.orchestrator,
      secrets: this.secrets,
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
            label => stepfunctions.Condition.isPresent(`$.labels.${label}`),
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

    const check = new stepfunctions.Choice(this, 'Is self hosted?')
      .when(stepfunctions.Condition.isNotPresent('$.labels.self-hosted'), new stepfunctions.Succeed(this, 'No'))
      .otherwise(work);

    const stateMachine = new stepfunctions.StateMachine(
      this,
      'Runner Orchestrator',
      {
        definition: check,
      },
    );

    for (const provider of this.providers) {
      provider.grantStateMachine(stateMachine);
    }

    return stateMachine;
  }

  private tokenRetriever() {
    const func = new BundledNodejsFunction(
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
        ...this.extraLambdaProps,
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
        description: 'Delete GitHub Actions runner on error',
        environment: {
          GITHUB_SECRET_ARN: this.secrets.github.secretArn,
          GITHUB_PRIVATE_KEY_SECRET_ARN: this.secrets.githubPrivateKey.secretArn,
          ...this.extraLambdaEnv,
        },
        timeout: cdk.Duration.seconds(30),
        ...this.extraLambdaProps,
      },
    );

    this.secrets.github.grantRead(func);
    this.secrets.githubPrivateKey.grantRead(func);

    return func;
  }

  private statusFunction() {
    const statusFunction = new BundledNodejsFunction(
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
          SETUP_FUNCTION_URL: this.setupUrl,
          ...this.extraLambdaEnv,
        },
        timeout: cdk.Duration.minutes(3),
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
  }

  private setupFunction(): string {
    const setupFunction = new BundledNodejsFunction(
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

    return setupFunction.addFunctionUrl({ authType: FunctionUrlAuthType.NONE }).url;
  }
}
