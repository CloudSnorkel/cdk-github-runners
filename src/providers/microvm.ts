import * as cdk from 'aws-cdk-lib';
import {
  aws_ec2 as ec2,
  aws_events as events,
  aws_events_targets as events_targets,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_s3 as s3,
  aws_stepfunctions as stepfunctions,
} from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import {
  Architecture,
  BaseProvider,
  IParameterizedRunnerProvider,
  IRunnerProvider,
  IRunnerProviderStatus,
  Os,
  providerParam,
  RUNNER_INPUT,
  RunnerConfig,
  runnerDefaultLabels,
  RunnerImage,
  RunnerProviderProps,
  RunnerVersion,
} from './common';
import { MicrovmImageFunction } from './microvm-image-function';
import { BaseContainerImage, IRunnerImageBuilder, RunnerImageBuilder, RunnerImageBuilderProps, RunnerImageComponent } from '../image-builders';
import { singletonLambda, singletonLogGroup, SingletonLogType } from '../utils';
import { SetupInput } from './microvm-image.lambda';

/**
 * Port {@link RunnerImageComponent.microVmEntrypoint} listens on for lifecycle hooks. Must match `microvm-hooks.js`.
 */
const HOOK_PORT = 9000;

/**
 * Payload we hand the run hook. Each `{}` is a variable coming from the step function, in the order the fragment
 * passes them to States.Format().
 */
const runHookPayloadTemplate = JSON.stringify({
  taskToken: '{}',
  jitConfigParameter: '{}',
  runnerName: '{}',
  label: '{}',
  githubDomain: '{}',
  owner: '{}',
  repo: '{}',
}).replace(/{/g, '\\{').replace(/}/g, '\\}').replace(/\\{\\}/g, '{}');

/**
 * @experimental
 */
export interface MicroVmRunnerProviderProps extends RunnerProviderProps {
  /**
   * Runner image builder used to build Docker images containing GitHub Runner and all requirements.
   *
   * The image builder must contain the {@link RunnerImageComponent.microVmEntrypoint} component.
   *
   * @default MicroVmRunnerProvider.imageBuilder()
   */
  readonly imageBuilder?: IRunnerImageBuilder;

  /**
   * GitHub Actions labels used for this provider.
   *
   * These labels are used to identify which provider should spawn a new on-demand runner. Every job sends a webhook with the labels it's looking for
   * based on runs-on. We match the labels from the webhook with the labels specified here. If all the labels specified here are present in the
   * job's labels, this provider will be chosen and spawn a new runner.
   *
   * @default ['microvm']
   */
  readonly labels?: string[];

  /**
   * GitHub Actions runner group name.
   *
   * If specified, the runner will be registered with this group name. Setting a runner group can help managing access to self-hosted runners. It
   * requires a paid GitHub account and organization level runner registration.
   *
   * The group must exist or the runner will not start.
   *
   * Users will still be able to trigger this runner with the correct labels. But the runner will only be able to run jobs from repos allowed to use the group.
   *
   * @default undefined
   */
  readonly group?: string;

  /**
   * Memory given to the MicroVM. CPU is allocated proportionally, about one vCPU for every 2 GiB.
   *
   * @default 4 GiB (and therefore 2 vCPU)
   */
  readonly memorySize?: cdk.Size;

  /**
   * Time after which the MicroVM is terminated, whether the job is done or not. Must be 8 hours or less.
   *
   * @default Duration.hours(1)
   */
  readonly timeout?: cdk.Duration;

  /**
   * VPC to send the runner's outbound traffic through. The network interfaces never get a public IP, so the subnets
   * need a NAT gateway (or VPC endpoints) to reach GitHub, ECR and CloudWatch. Public subnets won't work.
   *
   * @default no VPC, runners get public internet access
   */
  readonly vpc?: ec2.IVpc;

  /**
   * Where to place the network interfaces within the VPC.
   *
   * @default default subnets of the VPC
   */
  readonly subnetSelection?: ec2.SubnetSelection;

  /**
   * Security groups to assign to the outbound traffic.
   *
   * @default a new security group, if VPC is used
   */
  readonly securityGroups?: ec2.ISecurityGroup[];
}

/**
 * Runner config for the MicroVM family fragment.
 *
 * @internal
 */
export interface MicroVmRunnerConfig extends RunnerConfig {
  readonly imageArn: string;
  readonly executionRoleArn: string;
  readonly logGroupName: string;
  readonly egressNetworkConnectors: string[];
  readonly ingressNetworkConnectors: string[];
  readonly maxDurationSeconds: number;
  readonly jitConfigParameterPrefix: string;
}

/**
 * GitHub Actions runner provider using Lambda MicroVMs to execute jobs.
 *
 * MicroVMs sit between Lambda and EC2. They boot from a snapshot in about a second, they have a writable disk and a
 * real kernel, and they can run for up to eight hours.
 *
 * This construct is not meant to be used by itself. It should be passed in the providers property for GitHubRunners.
 *
 * This provider is experimental and may change in the future.
 *
 * @experimental
 */
export class MicroVmRunnerProvider extends BaseProvider implements IRunnerProvider, IParameterizedRunnerProvider {
  /** @internal */
  public static readonly _FAMILY = 'microvm';

  /**
   * The fragment that runs any MicroVM provider. Reads the config {@link _runnerConfig} generated for it from
   * `$.providerParams`.
   *
   * The runner reports back with the task token we put in the run hook payload, and then exits its hook server which
   * ends the MicroVM. Similar to what EC2 provider does.
   *
   * The run hook payload is limited to 4KB and a JIT config alone is about that big. We put it in an SSM parameter with
   * a random name, which the runner reads and deletes. It expires on its own in case the runner never gets to it.
   *
   * @internal
   */
  public static _stateMachineFragment(scope: Construct): stepfunctions.IChainable {
    const p = providerParam<MicroVmRunnerConfig>;
    const parameterName = new stepfunctions.Pass(scope, 'MicroVM JIT Config Name', {
      parameters: {
        'name.$': `States.Format('/{}/{}', ${p('jitConfigParameterPrefix')}, States.UUID())`,
      },
      resultPath: '$.jitConfigParameter',
    });

    const parameter = new stepfunctions.CustomState(scope, 'Store MicroVM JIT Config', {
      stateJson: {
        Type: 'Task',
        QueryLanguage: 'JSONata', // for the expiration time
        Resource: `arn:${cdk.Aws.PARTITION}:states:::aws-sdk:ssm:putParameter`,
        Arguments: {
          Name: '{% $states.input.jitConfigParameter.name %}',
          Value: '{% $states.input.runner.jitConfig %}',
          Type: 'SecureString',
          Tier: 'Advanced', // standard is limited to 4KB too, and has no expiration
          Policies: "{% $string([{'Type': 'Expiration', 'Version': '1.0', 'Attributes': {'Timestamp': $fromMillis($millis() + 15 * 60 * 1000)}}]) %}",
        },
        Output: '{% $states.input %}',
      },
    });

    const run = new stepfunctions.CustomState(scope, 'MicroVM Runner', {
      stateJson: {
        Type: 'Task',
        Resource: `arn:${cdk.Aws.PARTITION}:states:::aws-sdk:lambdamicrovms:runMicrovm.waitForTaskToken`,
        // the hook server sends a heartbeat every minute, so we notice a MicroVM that died without reporting back.
        // a MicroVM that never reports back is gone by the time its maximum duration is up.
        HeartbeatSeconds: cdk.Duration.minutes(10).toSeconds(),
        ResultPath: '$.microvm',
        // no IdlePolicy on purpose. Lambda calls a MicroVM idle when nothing calls its endpoint, but our runner never
        // serves traffic. Suspending the MicroVM mid-poll would drop the job we are running.
        Parameters: {
          'ImageIdentifier.$': p('imageArn'),
          'ExecutionRoleArn.$': p('executionRoleArn'),
          'MaximumDurationInSeconds.$': p('maxDurationSeconds'),
          'EgressNetworkConnectors.$': p('egressNetworkConnectors'),
          'IngressNetworkConnectors.$': p('ingressNetworkConnectors'),
          'Logging': {
            CloudWatch: {
              'LogGroup.$': p('logGroupName'),
              'LogStream.$': RUNNER_INPUT.name,
            },
          },
          'RunHookPayload.$': `States.Format('${runHookPayloadTemplate}', ` +
            `$$.Task.Token, $.jitConfigParameter.name, ${RUNNER_INPUT.name}, ${RUNNER_INPUT.labels}, ${RUNNER_INPUT.domain}, ` +
            `${RUNNER_INPUT.owner}, ${RUNNER_INPUT.repo})`,
        },
      },
    });

    return parameterName.next(parameter).next(run);
  }

  /**
   * Create new image builder that builds MicroVM specific runner images.
   *
   * You can customize the OS, architecture, VPC, subnet, security groups, etc. by passing in props.
   *
   * You can add components to the image builder by calling `imageBuilder.addComponent()`.
   *
   * The default OS is Amazon Linux 2023 running on x64 architecture.
   *
   * The default base image is Lambda's own, which is the only one guaranteed to survive being snapshotted. Among
   * other things it carries an AWS-patched OpenSSL, so don't change it unless you know your image is snapshot
   * compatible.
   *
   * Included components:
   *  * `RunnerImageComponent.requiredPackages()`
   *  * `RunnerImageComponent.runnerUser()`
   *  * `RunnerImageComponent.git()`
   *  * `RunnerImageComponent.githubCli()`
   *  * `RunnerImageComponent.awsCli()`
   *  * `RunnerImageComponent.githubRunner()`
   *  * `RunnerImageComponent.microVmEntrypoint()`
   */
  public static imageBuilder(scope: Construct, id: string, props?: RunnerImageBuilderProps) {
    return RunnerImageBuilder.new(scope, id, {
      os: Os.LINUX_AMAZON_2023,
      architecture: Architecture.X86_64,
      baseDockerImage: BaseContainerImage.fromEcrPublic('lambda', 'microvms', 'al2023-minimal'),
      components: [
        RunnerImageComponent.requiredPackages(),
        RunnerImageComponent.runnerUser(),
        RunnerImageComponent.git(),
        RunnerImageComponent.githubCli(),
        RunnerImageComponent.awsCli(),
        RunnerImageComponent.githubRunner(props?.runnerVersion ?? RunnerVersion.latest()),
        RunnerImageComponent.microVmEntrypoint(),
      ],
      ...props,
    });
  }

  /**
   * Labels associated with this provider.
   */
  readonly labels: string[];

  /**
   * Grant principal used to add permissions to the runner role.
   */
  readonly grantPrincipal: iam.IPrincipal;

  /**
   * Log group where provided runners will save their logs.
   *
   * Note that this is not the job log, but the runner itself. It will not contain output from the GitHub Action but only metadata on its execution.
   */
  readonly logGroup: logs.ILogGroup;

  private readonly image: lambda.CfnMicrovmImage;
  private readonly runnerImage: RunnerImage;
  private readonly role: iam.Role;
  private readonly group?: string;
  private readonly defaultLabels: boolean;
  private readonly timeout: cdk.Duration;
  private readonly vpc?: ec2.IVpc;
  private readonly securityGroups?: ec2.ISecurityGroup[];
  private readonly egressNetworkConnectors: string[];
  private readonly jitConfigParameterPrefix: string;
  private readonly jitConfigParameterArns: string;
  private readonly ingressNetworkConnectors: string[];

  constructor(scope: Construct, id: string, props?: MicroVmRunnerProviderProps) {
    super(scope, id, props);

    this.labels = props?.labels ?? ['microvm'];
    this.group = props?.group;
    this.defaultLabels = props?.defaultLabels ?? true;
    this.timeout = props?.timeout ?? cdk.Duration.hours(1);
    this.vpc = props?.vpc;
    this.egressNetworkConnectors = [];
    if (this.vpc) {
      this.securityGroups = props?.securityGroups ?? [new ec2.SecurityGroup(this, 'SG', { vpc: this.vpc })];
      const connector = new lambda.CfnNetworkConnector(this, 'Network Connector', {
        configuration: {
          vpcEgressConfiguration: {
            subnetIds: this.vpc.selectSubnets(props?.subnetSelection).subnetIds,
            securityGroupIds: this.securityGroups.map(sg => sg.securityGroupId),
            associatedComputeResourceTypes: ['MicroVm'],
            networkProtocol: 'IPv4',
          },
        },
        operatorRole: new iam.Role(this, 'Network Connector Role', {
          assumedBy: new iam.ServicePrincipal('network-connectors.lambda.amazonaws.com'),
          managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('AWSLambdaNetworkConnectorOperatorPolicy')],
        }).roleArn,
      });
      this.egressNetworkConnectors.push(connector.attrArn);
    }
    this.jitConfigParameterPrefix = `cdk-github-runners/microvm/${this.node.addr}`;
    this.jitConfigParameterArns = cdk.Stack.of(this).formatArn({
      service: 'ssm',
      resource: 'parameter',
      resourceName: `${this.jitConfigParameterPrefix}/*`,
    });
    this.ingressNetworkConnectors = [cdk.Stack.of(this).formatArn({
      service: 'lambda',
      account: 'aws',
      resource: 'network-connector',
      resourceName: 'aws-network-connector:SHELL_INGRESS',
      arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
    })];

    if (this.timeout.toSeconds() > cdk.Duration.hours(8).toSeconds()) {
      cdk.Annotations.of(this).addError(`MicroVM timeout must be 8 hours or less, but is ${this.timeout.toHumanString()}`);
    }

    const imageBuilder = props?.imageBuilder ?? MicroVmRunnerProvider.imageBuilder(this, 'Image Builder');
    const image = this.runnerImage = imageBuilder.bindDockerImage();

    if (!image.os.isIn(Os._ALL_LINUX_VERSIONS)) {
      cdk.Annotations.of(this).addError(`MicroVMs only run Linux and not ${image.os.name}`);
    }

    if (!image._dependable) {
      // same as the Lambda provider: we point Lambda at an image tag, so the image has to be there before we build on top of it
      cdk.Annotations.of(this).addError('MicroVM provider can only work with images built by CodeBuild and not AWS Image Builder. `waitOnDeploy: false` is also not supported.');
    }

    this.logGroup = new logs.LogGroup(this, 'Logs', {
      retention: props?.logRetention ?? RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    this.grantPrincipal = this.role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    this.role.addToPrincipalPolicy(new iam.PolicyStatement({ // report status
      actions: ['states:SendTaskFailure', 'states:SendTaskSuccess', 'states:SendTaskHeartbeat'],
      resources: ['*'], // no support for stateMachine.stateMachineArn but task tokens are very long and totally random so not the end of the world
    }));
    this.logGroup.grantWrite(this.role);
    // only JIT configs of this provider, whose runners already share this role. no listing, so a runner can only find its own by the random name.
    this.role.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter', 'ssm:DeleteParameter'],
      resources: [this.jitConfigParameterArns],
    }));

    // the same role builds the MicroVM image. all it needs is the runner image, which the MicroVM runs anyway.
    const codeArtifact = this.codeArtifact(image);
    codeArtifact.bucket.grantRead(this.role);
    image.imageRepository.grantPull(this.role);

    // everything but the name, so the rebuild below can send the same configuration as-is and not trigger changes
    const imageConfig: lambda.CfnMicrovmImageProps = {
      name: '',
      environmentVariables: [],
      description: `GitHub Actions runner for labels ${this.labels}`,
      // the managed environment our runner image runs in, not the `FROM` of the Dockerfile
      baseImageArn: `arn:${cdk.Aws.PARTITION}:lambda:${cdk.Aws.REGION}:aws:microvm-image:al2023-1`,
      baseImageVersion: '3', // first version with x64. rebuilds use the latest version. TODO custom resource to get latest?
      buildRoleArn: this.role.roleArn,
      codeArtifact: { uri: codeArtifact.uri },
      cpuConfigurations: [{ architecture: image.architecture.is(Architecture.ARM64) ? 'ARM_64' : 'X86_64' }],
      resources: [{ minimumMemoryInMiB: (props?.memorySize ?? cdk.Size.gibibytes(4)).toMebibytes() }],
      additionalOsCapabilities: [],
      egressNetworkConnectors: [], // no need for vpc setting on build as it's just copying over the image from ECR
      logging: { cloudWatch: { logGroup: this.logGroup.logGroupName } },
      hooks: {
        port: HOOK_PORT,
        microvmHooks: {
          run: 'ENABLED',
          runTimeoutInSeconds: 60,
        },
        // required whenever any lifecycle hook is enabled. it tells Lambda the hook server is up, so the snapshot is
        // taken with it ready to take a job.
        microvmImageHooks: {
          ready: 'ENABLED',
          readyTimeoutInSeconds: 60,
        },
      },
    };

    this.image = new lambda.CfnMicrovmImage(this, 'Image', {
      ...imageConfig,
      // name is sadly required
      name: cdk.Names.uniqueResourceName(this, { maxLength: 64, separator: '-', allowedSpecialCharacters: '_-' }),
    });
    this.image.node.addDependency(codeArtifact.resource);
    if (image._dependable) {
      this.image.node.addDependency(image._dependable);
    }

    this.addImageUpdater({
      ...imageConfig,
      name: undefined,
      imageIdentifier: this.image.attrImageArn,
      environmentVariables: {},
    });

    // TODO cleaner that removes old image versions
  }

  /**
   * The network connections associated with this resource.
   *
   * These security groups only apply to outbound traffic through the VPC. Inbound access to the MicroVM goes through
   * Lambda's endpoint with an auth token, and not through the VPC.
   */
  public get connections(): ec2.Connections {
    return new ec2.Connections({ securityGroups: this.securityGroups });
  }

  /**
   * MicroVM images are built by Lambda out of a zipped Dockerfile in S3, and not out of a container image. The runner
   * image repository is only known at deploy time, so a custom resource writes the Dockerfile for us.
   *
   * All MicroVM providers in the stack share one bucket, each with its own key.
   */
  private codeArtifact(image: RunnerImage) {
    const stack = cdk.Stack.of(this);
    const bucketNodeName = 'MicroVM Image Artifacts dcc036c8-876b-451e-a2c1-552f9e06e9e1';
    const bucket = stack.node.tryFindChild(bucketNodeName) as s3.Bucket ?? new s3.Bucket(stack, bucketNodeName, {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // the custom resources delete their objects, so the bucket is empty by then
    });
    const key = `${this.node.addr}.zip`;

    const resource = new cdk.CustomResource(this, 'Image Artifact Writer', {
      serviceToken: this.imageFunction().functionArn,
      resourceType: 'Custom::MicroVmImageArtifact',
      properties: <SetupInput>{
        Bucket: bucket.bucketName,
        Key: key,
        Dockerfile: `FROM ${image.imageRepository.repositoryUri}:${image.imageTag}\n`, // the only reason we're doing all this...
      },
    });

    // so the grant is still there when the custom resource deletes its object
    resource.node.addDependency(bucket.grants.readWrite(this.imageFunction()));

    return {
      bucket,
      uri: bucket.s3UrlForObject(key),
      resource,
    };
  }

  /**
   * Lambda resolves the image tag when the MicroVM image is built, and then sticks to that image. Whenever the runner
   * image is rebuilt, we have to explicitly tell Lambda to build a new MicroVM image version out of it.
   */
  private addImageUpdater(image: Record<string, unknown>) {
    const updater = this.imageFunction();

    // a policy of its own and not the role's default policy. the image depends on the code artifact custom resource
    // which depends on this function, so the function itself can't depend on the image.
    new iam.Policy(this, 'Image Updater Policy', {
      roles: [updater.role!],
      statements: [
        new iam.PolicyStatement({
          actions: ['lambda:UpdateMicrovmImage', 'lambda:DeleteMicrovmImageVersion', 'lambda:GetMicrovmImage', 'lambda:ListMicrovmImageVersions'],
          resources: [this.image.attrImageArn],
        }),
        new iam.PolicyStatement({
          actions: ['cloudformation:DescribeStacks'],
          resources: [cdk.Stack.of(this).stackId],
        }),
        new iam.PolicyStatement({
          actions: ['ecr:DescribeImages'],
          resources: [this.runnerImage.imageRepository.repositoryArn],
        }),
        new iam.PolicyStatement({
          actions: ['lambda:ListManagedMicrovmImageVersions'],
          resources: [image.baseImageArn as string],
        }),
        // no iam:PassedToService condition as Lambda doesn't set it
        new iam.PolicyStatement({
          actions: ['iam:PassRole'],
          resources: [this.role.roleArn],
        }),
        // the image builds with internet access even when we don't ask for any egress
        new iam.PolicyStatement({
          actions: ['lambda:PassNetworkConnector'],
          resources: [
            cdk.Stack.of(this).formatArn({
              service: 'lambda',
              account: 'aws',
              resource: 'network-connector',
              resourceName: 'aws-network-connector:INTERNET_EGRESS',
              arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
            }),
            ...this.egressNetworkConnectors,
          ],
        }),
      ],
    });

    const target = new events_targets.LambdaFunction(updater, {
      event: events.RuleTargetInput.fromObject({
        image,
        stackId: cdk.Stack.of(this).stackId,
        repositoryName: this.runnerImage.imageRepository.repositoryName,
        imageTag: this.runnerImage.imageTag,
      }),
    });

    const rule = this.runnerImage.imageRepository.onEvent('Push rule', {
      crossStackScope: this, // allow provider and image builder to be in different stacks
      description: 'Build a new GitHub Actions runner MicroVM image version on ECR image push',
      eventPattern: {
        detailType: ['ECR Image Action'],
        detail: {
          'action-type': ['PUSH'],
          'repository-name': [this.runnerImage.imageRepository.repositoryName],
          'image-tag': [this.runnerImage.imageTag],
          'result': ['SUCCESS'],
        },
      },
      target,
    });

    // the event never triggers without this - not sure why
    (rule.node.defaultChild as events.CfnRule).addDeletionOverride('Properties.EventPattern.resources');

    // the updater leaves the image alone while CloudFormation deploys, as CloudFormation fails to update an image that's
    // already building. so we try again once it's done, in case the runner image was pushed in the middle of it.
    new events.Rule(this, 'Stack rule', {
      description: 'Build a new GitHub Actions runner MicroVM image version if the runner image was pushed during deployment',
      eventPattern: {
        source: ['aws.cloudformation'],
        detailType: ['CloudFormation Stack Status Change'],
        detail: {
          'stack-id': [cdk.Stack.of(this).stackId],
          'status-details': {
            status: ['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'UPDATE_ROLLBACK_COMPLETE'],
          },
        },
      },
      targets: [target],
    });
  }

  private imageFunction() {
    return singletonLambda(MicrovmImageFunction, this, 'microvm-image', {
      description: 'Function that writes the Dockerfile MicroVM images are built from, and rebuilds them when the runner image changes',
      timeout: cdk.Duration.minutes(5),
      logGroup: singletonLogGroup(this, SingletonLogType.RUNNER_IMAGE_BUILD),
      loggingFormat: lambda.LoggingFormat.JSON,
    });
  }

  /**
   * Config for the shared MicroVM fragment.
   *
   * @internal
   */
  _runnerConfig(): MicroVmRunnerConfig {
    return {
      family: MicroVmRunnerProvider._FAMILY,
      provider: this.node.path,
      imageArn: this.image.attrImageArn,
      executionRoleArn: this.role.roleArn,
      logGroupName: this.logGroup.logGroupName,
      egressNetworkConnectors: this.egressNetworkConnectors,
      ingressNetworkConnectors: this.ingressNetworkConnectors,
      maxDurationSeconds: this.timeout.toSeconds(),
      jitConfigParameterPrefix: this.jitConfigParameterPrefix,
      runnerGroup: this.group ?? '',
      defaultLabels: runnerDefaultLabels(this.runnerImage.os, this.runnerImage.architecture, this.defaultLabels),
    };
  }

  /**
   * @internal
   */
  _grantStateMachine(stateMachineRole: iam.IGrantable) {
    stateMachineRole.grantPrincipal.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['ssm:PutParameter'],
      resources: [this.jitConfigParameterArns],
    }));

    stateMachineRole.grantPrincipal.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['lambda:RunMicrovm'],
      resources: [this.image.attrImageArn],
    }));

    stateMachineRole.grantPrincipal.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [this.role.roleArn],
    }));

    stateMachineRole.grantPrincipal.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['lambda:PassNetworkConnector'],
      resources: [
        cdk.Stack.of(this).formatArn({
          service: 'lambda',
          account: 'aws',
          resource: 'network-connector',
          resourceName: 'aws-network-connector:INTERNET_EGRESS',
          arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
        }),
        ...this.egressNetworkConnectors,
        ...this.ingressNetworkConnectors,
      ],
    }));
  }

  /**
   * @internal
   */
  _status(statusFunctionRole: iam.IGrantable): IRunnerProviderStatus {
    this.runnerImage.imageRepository.grant(statusFunctionRole, 'ecr:DescribeImages');

    return {
      type: this.constructor.name,
      labels: this.labels,
      constructPath: this.node.path,
      vpcArn: this.vpc?.vpcArn,
      securityGroups: this.securityGroups?.map(sg => sg.securityGroupId),
      roleArn: this.role.roleArn,
      logGroup: this.logGroup.logGroupName,
      image: {
        imageRepository: this.runnerImage.imageRepository.repositoryUri,
        imageTag: this.runnerImage.imageTag,
        imageBuilderLogGroup: this.runnerImage.logGroup?.logGroupName,
      },
    };
  }
}
