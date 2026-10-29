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
  aws_lambda as lambda,
  aws_logs as logs,
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
} from '../src';

// turn this on to test what happens if a stack fails deploying after an image was already built.
// we have an open issue where the new version of the image remains until the next scheduled build.
// after failing to deploy, run the integration tests. any provider that fails is using the new image which doesn't match the rolled back stack.
const testDeploymentFailureAfterImageBuilt = false;

// turn this on to test a half deployed stack. the step function only gets its new definition half an hour after everything else was updated.
// start jobs before deploying and during that half hour. old executions run with the new token retriever and the new runner scripts, and new
// executions don't exist yet. it's the state every deploy goes through briefly, and executions started before it stay in for up to a day.
const testDelayedStepFunctionUpdate = false;

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
    // returns the default, except for the stolen runner test in TESTING.md
    code: lambda.Code.fromInline(`
      exports.handler = async function(event) {
        console.log(JSON.stringify(event));
        if (event.payload.workflow_job.labels.includes('steal-test')) {
          // the runner started for abandoned is missing a label, so it can never take it
          return {
            provider: Object.keys(event.providers).find(p => event.providers[p].includes('codebuild-x64')),
            labels: event.payload.workflow_job.name == 'abandoned' ? ['self-hosted'] : ['self-hosted', 'steal-test'],
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

runners.metricJobCompleted();
runners.failedImageBuildsTopic();
runners.metricStolenRunners();
runners.createLogsInsightsQueries();
runners.createDashboard();

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
