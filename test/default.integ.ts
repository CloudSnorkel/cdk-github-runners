/*
 * DEPLOY COMMANDS:
 * (if new lambdas are added) projen
 * npm run compile && npm run integ:default:deploy
 */

import * as cdk from 'aws-cdk-lib';
import { aws_codebuild as codebuild, aws_ec2 as ec2, aws_ecs as ecs } from 'aws-cdk-lib';
import { Architecture, CodeBuildImageBuilder, CodeBuildRunner, ContainerImageBuilder, FargateRunner, GitHubRunners, LambdaRunner, Os } from '../src';
import { Ec2Runner } from '../src/providers/ec2';
import { AmiBuilder } from '../src/providers/image-builders/ami';

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
const fargateX64Builder = new CodeBuildImageBuilder(stack, 'Fargate builder', {
  dockerfilePath: FargateRunner.LINUX_X64_DOCKERFILE_PATH,
  architecture: Architecture.X86_64,
});
const fargateArm64Builder = new CodeBuildImageBuilder(stack, 'Fargate builder arm', {
  dockerfilePath: FargateRunner.LINUX_ARM64_DOCKERFILE_PATH,
  architecture: Architecture.ARM64,
});
const lambdaImageBuilder = new CodeBuildImageBuilder(stack, 'Lambda Image Builder x64', {
  dockerfilePath: LambdaRunner.LINUX_X64_DOCKERFILE_PATH,
  architecture: Architecture.X86_64,
});
const windowsImageBuilder = new ContainerImageBuilder(stack, 'Windows Image Builder', {
  architecture: Architecture.X86_64,
  os: Os.WINDOWS,
  vpc,
});
const amiX64Builder = new AmiBuilder(stack, 'AMI Linux Builder', {
  vpc,
});
new GitHubRunners(stack, 'runners', {
  providers: [
    new CodeBuildRunner(stack, 'CodeBuildx64', {
      label: 'codebuild-x64',
      imageBuilder: new CodeBuildImageBuilder(stack, 'CodeBuild Image Builder', {
        dockerfilePath: CodeBuildRunner.LINUX_X64_DOCKERFILE_PATH,
        architecture: Architecture.X86_64,
      }),
    }),
    new CodeBuildRunner(stack, 'CodeBuildARM', {
      labels: ['codebuild', 'linux', 'arm64'],
      computeType: codebuild.ComputeType.SMALL,
      imageBuilder: new CodeBuildImageBuilder(stack, 'CodeBuild Image Builder arm', {
        dockerfilePath: CodeBuildRunner.LINUX_ARM64_DOCKERFILE_PATH,
        architecture: Architecture.ARM64,
      }),
    }),
    new CodeBuildRunner(stack, 'CodeBuildWindows', {
      labels: ['codebuild', 'windows', 'x64'],
      computeType: codebuild.ComputeType.MEDIUM,
      imageBuilder: windowsImageBuilder,
    }),
    new LambdaRunner(stack, 'Lambda', {
      labels: ['lambda', 'x64'],
      imageBuilder: lambdaImageBuilder,
    }),
    new LambdaRunner(stack, 'LambdaARM', {
      labels: ['lambda', 'arm64'],
      imageBuilder: new CodeBuildImageBuilder(stack, 'Lambda Image Builderz', {
        dockerfilePath: LambdaRunner.LINUX_ARM64_DOCKERFILE_PATH,
        architecture: Architecture.ARM64,
      }),
    }),
    new FargateRunner(stack, 'Fargate', {
      labels: ['fargate', 'linux', 'x64'],
      cpu: 256,
      memoryLimitMiB: 512,
      imageBuilder: fargateX64Builder,
      cluster,
      vpc: cluster.vpc,
      assignPublicIp: true,
    }),
    new FargateRunner(stack, 'Fargate-x64-spot', {
      labels: ['fargate-spot', 'linux', 'x64'],
      spot: true,
      cpu: 256,
      memoryLimitMiB: 512,
      imageBuilder: fargateX64Builder,
      cluster,
      vpc: cluster.vpc,
      assignPublicIp: true,
    }),
    new FargateRunner(stack, 'Fargate-arm64', {
      labels: ['fargate', 'linux', 'arm64'],
      cpu: 256,
      memoryLimitMiB: 512,
      imageBuilder: fargateArm64Builder,
      cluster,
      vpc: cluster.vpc,
      assignPublicIp: true,
    }),
    new FargateRunner(stack, 'Fargate-arm64-spot', {
      labels: ['fargate-spot', 'linux', 'arm64'],
      // TODO never available -- spot: true,
      cpu: 256,
      memoryLimitMiB: 512,
      imageBuilder: fargateArm64Builder,
      cluster,
      vpc: cluster.vpc,
      assignPublicIp: true,
    }),
    new FargateRunner(stack, 'Fargate-Windows', {
      labels: ['fargate', 'windows', 'x64'],
      cpu: 1024,
      memoryLimitMiB: 2048,
      imageBuilder: windowsImageBuilder,
      cluster,
      vpc: cluster.vpc,
      assignPublicIp: true,
    }),
    new Ec2Runner(stack, 'EC2 Linux', {
      labels: ['ec2', 'linux', 'x64'],
      amiBuilder: amiX64Builder,
      vpc,
    }),
    new Ec2Runner(stack, 'EC2 Spot Linux', {
      labels: ['ec2-spot', 'linux', 'x64'],
      amiBuilder: amiX64Builder,
      spot: true,
      vpc,
    }),
    new Ec2Runner(stack, 'EC2 Linux arm64', {
      labels: ['ec2', 'linux', 'arm64'],
      amiBuilder: new AmiBuilder(stack, 'AMI Linux arm64 Builder', {
        architecture: Architecture.ARM64,
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.M6G, ec2.InstanceSize.LARGE),
        vpc,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.M6G, ec2.InstanceSize.LARGE),
      vpc,
    }),
    new Ec2Runner(stack, 'EC2 Windows', {
      labels: ['ec2', 'windows', 'x64'],
      amiBuilder: new AmiBuilder(stack, 'Windows EC2 Builder', {
        os: Os.WINDOWS,
        vpc,
      }),
      vpc,
    }),
  ],
});

app.synth();
