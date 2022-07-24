/*
 * DEPLOY COMMANDS:
 * (if new lambdas are added) projen
 * npm run compile && npm run integ:default:deploy
 */

import * as cdk from 'aws-cdk-lib';
import { aws_codebuild as codebuild, aws_ecs as ecs } from 'aws-cdk-lib';
import { CodeBuildRunner } from '../lib/providers/codebuild';
import { Architecture } from '../lib/providers/common';
import { FargateRunner } from '../lib/providers/fargate';
import { CodeBuildImageBuilder } from '../lib/providers/image-builders/codebuild';
import { LambdaRunner } from '../lib/providers/lambda';
import { GitHubRunners } from '../lib/runner';

const app = new cdk.App();
const stack = new cdk.Stack(app, 'github-runners-test');

const cluster = new ecs.Cluster(
  stack,
  'cluster',
  {
    enableFargateCapacityProviders: true,
  },
);
const fargateX64Builder = new CodeBuildImageBuilder(stack, 'Fargate builder', {
  dockerfilePath: FargateRunner.LINUX_X64_DOCKERFILE_PATH,
  architecture: Architecture.X86_64,
});
fargateX64Builder.addExtraCertificates('certs');
const fargateArm64Builder = new CodeBuildImageBuilder(stack, 'Fargate builder arm', {
  dockerfilePath: FargateRunner.LINUX_ARM64_DOCKERFILE_PATH,
  architecture: Architecture.ARM64,
});
let lambdaImageBuilder = new CodeBuildImageBuilder(stack, 'Lambda Image Builder x64', {
  dockerfilePath: LambdaRunner.LINUX_X64_DOCKERFILE_PATH,
  architecture: Architecture.X86_64,
});
lambdaImageBuilder.addExtraCertificates('certs');
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
      label: 'codebuild-arm64',
      computeType: codebuild.ComputeType.SMALL,
      imageBuilder: new CodeBuildImageBuilder(stack, 'CodeBuild Image Builder arm', {
        dockerfilePath: CodeBuildRunner.LINUX_ARM64_DOCKERFILE_PATH,
        architecture: Architecture.ARM64,
      }),
    }),
    // new CodeBuildRunner(stack, 'CodeBuildWindows', {
    //   label: 'codebuild-windows-x64',
    //   computeType: codebuild.ComputeType.MEDIUM,
    //   imageBuilder: new ContainerImageBuilder(stack, 'Windows Image Builder', {
    //     dockerfilePath: CodeBuildRunner.WINDOWS_X64_DOCKERFILE_PATH,
    //     architecture: Architecture.X86_64,
    //     os: Os.WINDOWS,
    //   }),
    // }),
    new LambdaRunner(stack, 'Lambda', {
      label: 'lambda-x64',
      imageBuilder: lambdaImageBuilder,
    }),
    new LambdaRunner(stack, 'LambdaARM', {
      label: 'lambda-arm64',
      imageBuilder: new CodeBuildImageBuilder(stack, 'Lambda Image Builderz', {
        dockerfilePath: LambdaRunner.LINUX_ARM64_DOCKERFILE_PATH,
        architecture: Architecture.ARM64,
      }),
    }),
    new FargateRunner(stack, 'Fargate', {
      label: 'fargate-x64',
      cpu: 256,
      memoryLimitMiB: 512,
      imageBuilder: fargateX64Builder,
      cluster,
      vpc: cluster.vpc,
    }),
    new FargateRunner(stack, 'Fargate-x64-spot', {
      label: 'fargate-x64-spot',
      spot: true,
      cpu: 256,
      memoryLimitMiB: 512,
      imageBuilder: fargateX64Builder,
      cluster,
      vpc: cluster.vpc,
    }),
    new FargateRunner(stack, 'Fargate-arm64', {
      label: 'fargate-arm64',
      cpu: 256,
      memoryLimitMiB: 512,
      imageBuilder: fargateArm64Builder,
      cluster,
      vpc: cluster.vpc,
    }),
    new FargateRunner(stack, 'Fargate-arm64-spot', {
      label: 'fargate-arm64-spot',
      // TODO never available -- spot: true,
      cpu: 256,
      memoryLimitMiB: 512,
      imageBuilder: fargateArm64Builder,
      cluster,
      vpc: cluster.vpc,
    }),
  ],
});

app.synth();
