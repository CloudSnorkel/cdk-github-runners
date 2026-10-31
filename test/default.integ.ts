/*
 * DEPLOY COMMANDS:
 * (if new lambdas are added) projen
 * npm run bundle && npm run integ:default:deploy
 */

import * as cdk from 'aws-cdk-lib';
import {
  aws_cloudformation as cloudformation,
  aws_codebuild as codebuild,
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_events as events,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_sqs as sqs,
  aws_stepfunctions as stepfunctions,
  custom_resources as cr,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  Architecture,
  CodeBuildRunnerProvider,
  CompositeProvider,
  Ec2RunnerProvider,
  EcsRunnerProvider,
  FargateRunnerProvider,
  GitHubRunners,
  LambdaRunnerProvider,
  Os,
  RunnerImageComponent,
  ScheduledWarmRunner,
} from '../src';

// turn this on to test what happens if a stack fails deploying after an image was already built.
// we have an open issue where the new version of the image remains until the next scheduled build.
// after failing to deploy, run the integration tests. any provider that fails is using the new image which doesn't match the rolled back stack.
const testDeploymentFailureAfterImageBuilt = false;

// turn this on to test a half deployed stack. the step function only gets its new definition half an hour after everything else was updated.
// start jobs before deploying and during that half hour. old executions run with the new token retriever and the new runner scripts, and new
// executions don't exist yet. it's the state every deploy goes through briefly, and executions started before it stay in for up to a day.
const testDelayedStepFunctionUpdate = false;

// repository that runs the integration test workflows. change it to your fork to run them on your account.
const githubRepository = 'CloudSnorkel/cdk-github-runners';

// turn this on if your account doesn't have a GitHub OIDC provider yet. an account can only have one, so we use the existing one by default.
const createGitHubOidcProvider = false;

const app = new cdk.App();
const stack = new cdk.Stack(app, 'github-runners-test');

const vpc = new ec2.Vpc(stack, 'Vpc', {
  subnetConfiguration: [
    // just public so we don't need to waste money on VPC endpoints or NAT gateway
    {
      name: 'Public',
      subnetType: ec2.SubnetType.PUBLIC,
    },
  ],
});
const cluster = new ecs.Cluster(
  stack,
  'cluster',
  {
    enableFargateCapacityProviders: true,
    vpc: vpc,
  },
);

// one security group to save on resources
const sg = new ec2.SecurityGroup(stack, 'SG', {
  vpc,
});

// lets the integration test workflows check step function executions and ask if runners are still registered on GitHub.
// only workflows running on a branch of `githubRepository` can use it. pull requests, including ones from forks, can't.
const integRole = new iam.Role(stack, 'Integration Test Role', {
  assumedBy: new iam.WebIdentityPrincipal(
    createGitHubOidcProvider
      ? new iam.OidcProviderNative(stack, 'GitHub OIDC', {
        url: 'https://token.actions.githubusercontent.com',
        clientIds: ['sts.amazonaws.com'],
      }).oidcProviderArn
      : stack.formatArn({ service: 'iam', region: '', resource: 'oidc-provider', resourceName: 'token.actions.githubusercontent.com' }),
    {
      StringEquals: {
        'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
      },
      StringLike: {
        'token.actions.githubusercontent.com:sub': `repo:${githubRepository}:ref:refs/heads/*`,
      },
    },
  ),
});

const extraFilesComponentLinux = RunnerImageComponent.custom({
  commands: [
    testDeploymentFailureAfterImageBuilt ? 'echo skipping custom-file' : 'touch /custom-file',
    'mkdir /custom-dir',
    'mv FUNDING.yml /custom-dir',
  ],
  assets: [
    {
      source: '.github/FUNDING.yml',
      target: 'FUNDING.yml',
    },
  ],
});
const extraFilesComponentWindows = RunnerImageComponent.custom({
  commands: [
    testDeploymentFailureAfterImageBuilt ? 'echo skipping custom-file' : 'New-Item -ItemType file -Path / -Name custom-file',
    'New-Item -ItemType directory -Path / -Name custom-dir',
    'Move-Item FUNDING.yml /custom-dir',
  ],
  assets: [
    {
      source: '.github/FUNDING.yml',
      target: 'FUNDING.yml',
    },
  ],
});
const envComponent = RunnerImageComponent.environmentVariables({
  HELLO: 'world',
  FOO: 'bar',
});

const fargateX64Builder = FargateRunnerProvider.imageBuilder(stack, 'Fargate builder', {
  architecture: Architecture.X86_64,
});
fargateX64Builder.addComponent(extraFilesComponentLinux);
fargateX64Builder.addComponent(envComponent);

const fargateArm64Builder = FargateRunnerProvider.imageBuilder(stack, 'Fargate builder arm', {
  architecture: Architecture.ARM64,
});
fargateArm64Builder.addComponent(extraFilesComponentLinux);
fargateArm64Builder.addComponent(envComponent);

const lambdaImageBuilder = LambdaRunnerProvider.imageBuilder(stack, 'Lambda Image Builder x64', {
  architecture: Architecture.X86_64,
});
lambdaImageBuilder.addComponent(extraFilesComponentLinux);
lambdaImageBuilder.addComponent(envComponent);

const windowsImageBuilder = FargateRunnerProvider.imageBuilder(stack, 'Windows Image Builder', {
  os: Os.WINDOWS,
  vpc,
  subnetSelection: { subnetType: ec2.SubnetType.PUBLIC },
  securityGroups: [sg],
});
windowsImageBuilder.addComponent(extraFilesComponentWindows);
windowsImageBuilder.addComponent(envComponent);

const amiX64Builder = Ec2RunnerProvider.imageBuilder(stack, 'AMI Linux Builder', {
  vpc,
  securityGroups: [sg],
  awsImageBuilderOptions: {
    storageSize: cdk.Size.gibibytes(33),
  },
});
amiX64Builder.addComponent(extraFilesComponentLinux);
amiX64Builder.addComponent(envComponent);

const codeBuildImageBuilder = CodeBuildRunnerProvider.imageBuilder(stack, 'CodeBuild Image Builder');
codeBuildImageBuilder.addComponent(extraFilesComponentLinux);
codeBuildImageBuilder.addComponent(envComponent);
// integration test workflows get the role from runners of this image
codeBuildImageBuilder.addComponent(RunnerImageComponent.environmentVariables({ INTEG_ROLE_ARN: integRole.roleArn }));

const codeBuildUbuntu2404ImageBuilder = CodeBuildRunnerProvider.imageBuilder(stack, 'CodeBuild Ubuntu 2404 Image Builder', {
  os: Os.LINUX_UBUNTU_2404,
});
codeBuildUbuntu2404ImageBuilder.addComponent(extraFilesComponentLinux);
codeBuildUbuntu2404ImageBuilder.addComponent(envComponent);

const codeBuildArm64ImageBuilder = CodeBuildRunnerProvider.imageBuilder(stack, 'CodeBuild Image Builder arm', {
  architecture: Architecture.ARM64,
});
codeBuildArm64ImageBuilder.addComponent(extraFilesComponentLinux);
codeBuildArm64ImageBuilder.addComponent(envComponent);

const lambdaArm64ImageBuilder = LambdaRunnerProvider.imageBuilder(stack, 'Lambda Image Builderz', {
  architecture: Architecture.ARM64,
});
lambdaArm64ImageBuilder.addComponent(extraFilesComponentLinux);
lambdaArm64ImageBuilder.addComponent(envComponent);

const ec2ImageBuilder = Ec2RunnerProvider.imageBuilder(stack, 'AMI Linux arm64 Builder', {
  architecture: Architecture.ARM64,
  awsImageBuilderOptions: {
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.M6G, ec2.InstanceSize.LARGE),
  },
  vpc,
  securityGroups: [sg],
});
ec2ImageBuilder.addComponent(extraFilesComponentLinux);
ec2ImageBuilder.addComponent(envComponent);

const ec2WindowsImageBuilder = Ec2RunnerProvider.imageBuilder(stack, 'Windows EC2 Builder', {
  os: Os.WINDOWS,
  vpc,
  securityGroups: [sg],
});
ec2WindowsImageBuilder.addComponent(extraFilesComponentWindows);
ec2WindowsImageBuilder.addComponent(envComponent);

// build but don't use AL2 image
// we build so we can confirm all the default components work
// we don't use because it's EOL
// node 24, required by all recent actions, doesn't even work there
// .../node: /lib64/libm.so.6: version `GLIBC_2.27' not found
FargateRunnerProvider.imageBuilder(stack, 'AL2 builder', {
  os: Os.LINUX_AMAZON_2,
}).bindDockerImage();

// only warm runners can take integ-warm jobs, so integ-warm.yml knows its job ran on one
const warmProvider = new CodeBuildRunnerProvider(stack, 'CodeBuild Warm', {
  labels: ['integ-warm'],
  imageBuilder: codeBuildImageBuilder,
});

const runners = new GitHubRunners(stack, 'runners', {
  providers: [
    new CodeBuildRunnerProvider(stack, 'CodeBuildx64', {
      label: 'codebuild-x64',
      imageBuilder: codeBuildImageBuilder,
    }),
    new CodeBuildRunnerProvider(stack, 'CodeBuildUbuntu2404x64', {
      labels: ['codebuild-ubuntu-2404-x64'],
      imageBuilder: codeBuildUbuntu2404ImageBuilder,
    }),
    new CodeBuildRunnerProvider(stack, 'CodeBuildARM', {
      labels: ['codebuild', 'linux', 'arm64'],
      computeType: codebuild.ComputeType.SMALL,
      imageBuilder: codeBuildArm64ImageBuilder,
    }),
    new CodeBuildRunnerProvider(stack, 'CodeBuildWindows', {
      labels: ['codebuild', 'windows', 'x64'],
      computeType: codebuild.ComputeType.MEDIUM,
      imageBuilder: windowsImageBuilder,
    }),
    CompositeProvider.fallback(stack, 'ECS Fallback', [
      new EcsRunnerProvider(stack, 'ECS Spot', {
        labels: ['ecs', 'linux', 'x64'],
        imageBuilder: codeBuildImageBuilder, // codebuild has dind
        cluster,
        vpc,
        securityGroups: [sg],
        maxInstances: 1,
        spot: true,
        storageSize: cdk.Size.gibibytes(40),
        storageOptions: {
          volumeType: ec2.EbsDeviceVolumeType.GP3,
          iops: 1500,
          throughput: 150,
        },
      }),
      new EcsRunnerProvider(stack, 'ECS Non-Spot', {
        labels: ['ecs', 'linux', 'x64'],
        imageBuilder: codeBuildImageBuilder, // codebuild has dind
        cluster,
        vpc,
        securityGroups: [sg],
        maxInstances: 1,
        spot: false, // only use spot if the first provider fails
        storageSize: cdk.Size.gibibytes(40),
        storageOptions: {
          volumeType: ec2.EbsDeviceVolumeType.GP3,
          iops: 1500,
          throughput: 150,
        },
      }),
    ]),
    new EcsRunnerProvider(stack, 'ECS Ubuntu 2404', {
      labels: ['ecs-ubuntu-2404', 'x64'],
      imageBuilder: codeBuildUbuntu2404ImageBuilder, // codebuild has dind
      cluster,
      vpc,
      securityGroups: [sg],
      maxInstances: 1,
      spot: true,
      storageSize: cdk.Size.gibibytes(40),
      storageOptions: {
        volumeType: ec2.EbsDeviceVolumeType.GP3,
        iops: 1500,
        throughput: 150,
      },
    }),
    new EcsRunnerProvider(stack, 'ECS ARM64', {
      labels: ['ecs', 'linux', 'arm64'],
      imageBuilder: codeBuildArm64ImageBuilder, // codebuild has dind
      cluster,
      vpc,
      securityGroups: [sg],
      maxInstances: 1,
    }),
    new EcsRunnerProvider(stack, 'ECS Windows', {
      labels: ['ecs', 'windows', 'x64'],
      imageBuilder: windowsImageBuilder,
      cluster,
      vpc,
      securityGroups: [sg],
      maxInstances: 1,
    }),
    new LambdaRunnerProvider(stack, 'Lambda', {
      labels: ['lambda', 'x64'],
      imageBuilder: lambdaImageBuilder,
    }),
    warmProvider,
    new LambdaRunnerProvider(stack, 'LambdaARM', {
      labels: ['lambda', 'arm64'],
      imageBuilder: lambdaArm64ImageBuilder,
    }),
    new FargateRunnerProvider(stack, 'Fargate', {
      labels: ['fargate', 'linux', 'x64'],
      cpu: 256,
      memoryLimitMiB: 512,
      imageBuilder: fargateX64Builder,
      cluster,
      vpc: cluster.vpc,
      securityGroups: [sg],
      assignPublicIp: true,
    }),
    CompositeProvider.distribute(stack, 'Fargate-x64-spot distribute', [
      {
        weight: 3,
        provider: new FargateRunnerProvider(stack, 'Fargate-x64-spot subnet 1', {
          labels: ['fargate-spot', 'linux', 'x64'],
          spot: true,
          cpu: 256,
          memoryLimitMiB: 512,
          imageBuilder: fargateX64Builder,
          cluster,
          vpc: cluster.vpc,
          securityGroups: [sg],
          assignPublicIp: true,
          subnetSelection: vpc.selectSubnets({
            subnetType: ec2.SubnetType.PUBLIC,
            availabilityZones: [vpc.availabilityZones[1]],
          }),
        }),
      },
      {
        weight: 2,
        provider: new FargateRunnerProvider(stack, 'Fargate-x64-spot subnet 2', {
          labels: ['fargate-spot', 'linux', 'x64'],
          spot: true,
          cpu: 256,
          memoryLimitMiB: 512,
          imageBuilder: fargateX64Builder,
          cluster,
          vpc: cluster.vpc,
          securityGroups: [sg],
          assignPublicIp: true,
          subnetSelection: vpc.selectSubnets({
            subnetType: ec2.SubnetType.PUBLIC,
            availabilityZones: [vpc.availabilityZones[0]],
          }),
        }),
      },
    ]),
    new FargateRunnerProvider(stack, 'Fargate-arm64', {
      labels: ['fargate', 'linux', 'arm64'],
      cpu: 256,
      memoryLimitMiB: 512,
      imageBuilder: fargateArm64Builder,
      cluster,
      vpc: cluster.vpc,
      securityGroups: [sg],
      assignPublicIp: true,
    }),
    new FargateRunnerProvider(stack, 'Fargate-arm64-spot', {
      labels: ['fargate-spot', 'linux', 'arm64'],
      spot: true,
      cpu: 256,
      memoryLimitMiB: 512,
      imageBuilder: fargateArm64Builder,
      cluster,
      vpc: cluster.vpc,
      securityGroups: [sg],
      assignPublicIp: true,
    }),
    new FargateRunnerProvider(stack, 'Fargate-Windows', {
      labels: ['fargate', 'windows', 'x64'],
      cpu: 1024,
      memoryLimitMiB: 2048,
      imageBuilder: windowsImageBuilder,
      cluster,
      vpc: cluster.vpc,
      securityGroups: [sg],
      assignPublicIp: true,
    }),
    CompositeProvider.fallback(stack, 'EC2 Fallback', [
      // test composite of ec2 (it has multiple step function states)
      new Ec2RunnerProvider(stack, 'EC2 Linux', {
        labels: ['ec2', 'linux', 'x64'],
        imageBuilder: amiX64Builder,
        vpc,
        securityGroups: [sg],
        storageSize: cdk.Size.gibibytes(40),
        storageOptions: {
          volumeType: ec2.EbsDeviceVolumeType.GP3,
          iops: 3000,
          throughput: 200,
        },
      }),
      new Ec2RunnerProvider(stack, 'EC2 Linux 2', {
        labels: ['ec2', 'linux', 'x64'],
        imageBuilder: amiX64Builder,
        vpc,
        securityGroups: [sg],
        storageSize: cdk.Size.gibibytes(40),
        storageOptions: {
          volumeType: ec2.EbsDeviceVolumeType.GP3,
          iops: 3000,
          throughput: 200,
        },
      }),
    ]),
    new Ec2RunnerProvider(stack, 'EC2 Spot Linux', {
      labels: ['ec2-spot', 'linux', 'x64'],
      imageBuilder: amiX64Builder,
      spot: true,
      vpc,
      securityGroups: [sg],
      storageSize: cdk.Size.gibibytes(40),
    }),
    new Ec2RunnerProvider(stack, 'EC2 Linux arm64', {
      labels: ['ec2', 'linux', 'arm64'],
      imageBuilder: ec2ImageBuilder,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.M6G, ec2.InstanceSize.LARGE),
      vpc,
      securityGroups: [sg],
    }),
    new Ec2RunnerProvider(stack, 'EC2 Windows', {
      labels: ['ec2', 'windows', 'x64'],
      imageBuilder: ec2WindowsImageBuilder,
      vpc,
      securityGroups: [sg],
    }),
  ],
  providerSelector: new lambda.Function(stack, 'Provider Selector', {
    runtime: lambda.Runtime.NODEJS_LATEST,
    handler: 'index.handler',
    // returns the default, except for the integration test workflows that need a runner of their own
    code: lambda.Code.fromInline(`
      exports.handler = async function(event) {
        console.log(JSON.stringify(event));
        // jobs of a called workflow are named "<caller job> / <job>"
        const jobName = event.payload.workflow_job.name.split(' / ').pop();
        if (event.payload.workflow_job.name.startsWith('unserved / ')) {
          // no provider means no runner, as if the webhook was off. runners started for other jobs will take these and get replaced.
          return {};
        }
        if (event.payload.workflow_job.labels.includes('steal-test')) {
          // the runner started for abandoned is missing a label, so it can never take it
          return {
            provider: Object.keys(event.providers).find(p => event.providers[p].includes('codebuild-x64')),
            labels: jobName == 'abandoned' ? ['self-hosted'] : ['self-hosted', 'steal-test'],
          };
        }
        if (event.payload.workflow_job.labels.includes('integ-warm')) {
          // only a warm runner may take this job
          return {};
        }
        if (event.payload.workflow_job.labels.includes('integ-redeliver')) {
          // fail the first delivery, so only our webhook redelivery can start a runner. GitHub doesn't retry on its own.
          if (Date.now() - Date.parse(event.payload.workflow_job.created_at) < 4 * 60 * 1000) {
            throw new Error('Failing delivery on purpose for integ-redelivery.yml');
          }
          return {
            provider: Object.keys(event.providers).find(p => event.providers[p].includes('lambda') && event.providers[p].includes('x64')),
            labels: ['self-hosted', 'integ-redeliver'],
          };
        }
        if (event.payload.workflow_job.labels.includes('integ-ec2-dies')) {
          // spot, like the interrupted runners of #1007. no other job can take this runner, so the one that dies is the one we're watching
          return {
            provider: Object.keys(event.providers).find(p => event.providers[p].includes('ec2-spot')),
            labels: ['self-hosted', 'integ-ec2-dies'],
          };
        }
        if (event.payload.workflow_job.labels.includes('integ-cancel')) {
          // EC2, where a cancelled job once left its instance running (#537)
          return {
            provider: Object.keys(event.providers).find(p => ['ec2', 'linux', 'arm64'].every(l => event.providers[p].includes(l))),
            labels: ['self-hosted', 'integ-cancel'],
          };
        }
        if (event.payload.workflow_job.labels.includes('integ-lambda-timeout')) {
          // no other job can take this runner, so the runner that times out is the one we're watching
          return {
            provider: Object.keys(event.providers).find(p => event.providers[p].includes('lambda') && event.providers[p].includes('x64')),
            labels: ['self-hosted', 'integ-lambda-timeout'],
          };
        }
        return {
          provider: event.defaultProvider,
          labels: event.defaultLabels,
        };
      }
    `),
    logGroup: new logs.LogGroup(stack, 'Provider Selector Logs', {
      retention: logs.RetentionDays.ONE_WEEK,
    }),
  }),
});

// integ-warm.yml fills this pool itself when it runs, so warm runners don't run all week
const [githubOwner, githubRepo] = githubRepository.split('/');
const warmRunner = new ScheduledWarmRunner(stack, 'Integration Test Warm Runner', {
  runners,
  provider: warmProvider,
  count: 1,
  owner: githubOwner,
  repo: githubRepo,
  schedule: events.Schedule.cron({ month: '1', day: '1', hour: '0', minute: '0' }),
  duration: cdk.Duration.minutes(30),
});

runners.metricJobCompleted();
runners.failedImageBuildsTopic();
runners.metricStolenRunners();
runners.createLogsInsightsQueries();
runners.createDashboard();

// tells the integration test workflows whether a runner is still registered on GitHub, so they never see the app key
const runnerCheck = new lambda.Function(stack, 'Integration Test Runner Check', {
  description: 'Check if GitHub runner is registered for integration tests',
  runtime: lambda.Runtime.NODEJS_LATEST,
  handler: 'index.handler',
  timeout: cdk.Duration.seconds(30),
  code: lambda.Code.fromInline(`
    const crypto = require('crypto');
    const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
    const sm = new SecretsManagerClient();
    const secret = async id => (await sm.send(new GetSecretValueCommand({ SecretId: id }))).SecretString;
    const call = async (url, options) => {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(url + ' returned ' + response.status + ': ' + await response.text());
      }
      return response.json();
    };

    // event is the execution input with the runner name added
    exports.handler = async function(event) {
      const github = JSON.parse(await secret(process.env.GITHUB_SECRET_ARN));
      const api = github.domain == 'github.com' ? 'https://api.github.com' : 'https://' + github.domain + '/api/v3';
      const org = github.runnerLevel == 'org';
      let token = github.personalAuthToken;
      if (!token) {
        const now = Math.floor(Date.now() / 1000);
        const encode = o => Buffer.from(JSON.stringify(o)).toString('base64url');
        const unsigned = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + encode({ iat: now - 60, exp: now + 300, iss: github.appId });
        const signature = crypto.sign('sha256', Buffer.from(unsigned), await secret(process.env.GITHUB_PRIVATE_KEY_SECRET_ARN));
        token = (await call(api + '/app/installations/' + event.installationId + '/access_tokens', {
          method: 'POST',
          headers: { authorization: 'Bearer ' + unsigned + '.' + signature.toString('base64url') },
          // all we need is to list runners
          body: JSON.stringify({ permissions: org ? { organization_self_hosted_runners: 'read' } : { administration: 'read' } }),
        })).token;
      }
      const runners = (org ? '/orgs/' + event.owner : '/repos/' + event.owner + '/' + event.repo) + '/actions/runners?name=' + encodeURIComponent(event.runnerName);
      return (await call(api + runners, { headers: { authorization: 'Bearer ' + token } })).total_count > 0;
    };
  `),
  environment: {
    GITHUB_SECRET_ARN: runners.secrets.github.secretArn,
    GITHUB_PRIVATE_KEY_SECRET_ARN: runners.secrets.githubPrivateKey.secretArn,
  },
  logGroup: new logs.LogGroup(stack, 'Integration Test Runner Check Logs', {
    retention: logs.RetentionDays.ONE_WEEK,
  }),
});
runners.secrets.github.grantRead(runnerCheck);
runners.secrets.githubPrivateKey.grantRead(runnerCheck);

// integration test role can look at executions, start one without a job, ask if a runner is still registered, look for leftover instances, and fill the warm runner pool
const orchestrator = runners.node.findChild('Runner Orchestrator') as stepfunctions.StateMachine;
orchestrator.grantRead(integRole);
orchestrator.grantStartExecution(integRole);
runnerCheck.grantInvoke(integRole);
integRole.addToPolicy(new iam.PolicyStatement({
  actions: ['cloudformation:ListStackResources'],
  resources: [stack.stackId],
}));
(runners.node.findChild('Warm Runner Queue') as sqs.Queue).grantSendMessages(integRole);
integRole.addToPolicy(new iam.PolicyStatement({
  actions: ['events:ListTargetsByRule'],
  resources: [(warmRunner.node.findChild('Schedule') as events.Rule).ruleArn],
}));
integRole.addToPolicy(new iam.PolicyStatement({
  actions: ['ec2:DescribeInstances'],
  resources: ['*'], // doesn't support resource-level permissions
}));

if (testDeploymentFailureAfterImageBuilt) {
  const rollbackTestHandle = new cloudformation.CfnWaitConditionHandle(stack, 'Rollback Test Handle');
  const rollbackTestFailure = new cloudformation.CfnWaitCondition(stack, 'Rollback Test Failure', {
    handle: rollbackTestHandle.ref,
    timeout: '60', // nobody ever signals this, so it times out and fails the update
    count: 1,
  });
  for (const dependency of [
    fargateX64Builder,
    fargateArm64Builder,
    lambdaImageBuilder,
    windowsImageBuilder,
    amiX64Builder,
    codeBuildImageBuilder,
    codeBuildUbuntu2404ImageBuilder,
    codeBuildArm64ImageBuilder,
    lambdaArm64ImageBuilder,
    ec2ImageBuilder,
    ec2WindowsImageBuilder,
    runners,
  ]) {
    if (Construct.isConstruct(dependency)) {
      rollbackTestFailure.node.addDependency(dependency);
    }
  }
}

if (testDelayedStepFunctionUpdate) {
  // waits half an hour after everything it depends on was updated. it runs again on every deploy because deployTime changes on every synth.
  const delayFunctionProps = {
    runtime: lambda.Runtime.NODEJS_LATEST,
    handler: 'index.handler',
    logGroup: new logs.LogGroup(stack, 'Delay Logs', { retention: logs.RetentionDays.ONE_WEEK }),
  };
  const delayProvider = new cr.Provider(stack, 'Delay Provider', {
    onEventHandler: new lambda.Function(stack, 'Delay Start', {
      ...delayFunctionProps,
      code: lambda.Code.fromInline('exports.handler = async () => ({ Data: { start: Date.now() } });'),
    }),
    isCompleteHandler: new lambda.Function(stack, 'Delay Check', {
      ...delayFunctionProps,
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => ({
          // onEvent's data should be here, but fall back to synth time instead of never finishing
          IsComplete: event.RequestType === 'Delete' ||
            Date.now() - Number(event.Data?.start ?? event.ResourceProperties.deployTime) >= 30 * 60 * 1000,
        });
      `),
    }),
    queryInterval: cdk.Duration.minutes(1),
    totalTimeout: cdk.Duration.hours(1),
  });
  const delay = new cdk.CustomResource(stack, 'Delay', {
    serviceToken: delayProvider.serviceToken,
    properties: { deployTime: Date.now().toString() },
  });

  // everything the runner scripts and the token retriever come from goes first, the step function goes last
  // composite providers don't contain their sub-providers
  for (const provider of runners.providers.flatMap(p => 'providers' in p ? p.providers : [p])) {
    delay.node.addDependency(provider);
  }
  delay.node.addDependency(runners.node.findChild('token-retriever'));
  runners.node.findChild('Runner Orchestrator').node.addDependency(delay);
}

app.synth();
