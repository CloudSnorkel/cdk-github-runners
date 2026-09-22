#!/usr/bin/env node
/**
 * Example: Custom CPU and instance type configurations.
 *
 * This example demonstrates how to configure CPU, memory, and instance types
 * for different provider types to match your workload requirements.
 */

import { App, Stack, Size } from 'aws-cdk-lib';
import { Vpc, SubnetType, InstanceType, InstanceClass, InstanceSize } from 'aws-cdk-lib/aws-ec2';
import { ComputeType } from 'aws-cdk-lib/aws-codebuild';
import {
  GitHubRunners,
  FargateRunnerProvider,
  CodeBuildRunnerProvider,
  LambdaRunnerProvider,
  Ec2RunnerProvider,
  EcsRunnerProvider,
} from '@cloudsnorkel/cdk-github-runners';

class ComputeOptionsStack extends Stack {
  constructor(scope: App, id: string) {
    super(scope, id);

    // Note: Creating a VPC is not required. Providers can use the default VPC or an existing VPC.
    // We create one here to make this example self-contained and testable.
    // Create a VPC with public and private subnets
    const vpc = new Vpc(this, 'VPC', {
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });

    // Fargate provider with custom CPU and memory
    // CPU and memory must match Fargate's valid combinations
    // 2048 (2 vCPU) with 4096 (4 GB) memory
    const fargateProvider = new FargateRunnerProvider(this, 'FargateProvider', {
      labels: ['fargate', 'linux', 'x64'],
      vpc: vpc,
      cpu: 2048, // 2 vCPU
      memoryLimitMiB: 4096, // 4 GB
    });

    // CodeBuild provider with custom compute type
    // Compute types: SMALL (2 vCPU, 3 GB), MEDIUM (4 vCPU, 7 GB), LARGE (8 vCPU, 15 GB), X2_LARGE (72 vCPU, 145 GB)
    const codebuildProvider = new CodeBuildRunnerProvider(this, 'CodeBuildProvider', {
      labels: ['codebuild', 'linux', 'x64'],
      computeType: ComputeType.LARGE, // 8 vCPU, 15 GB RAM
    });

    // Lambda provider with custom memory
    // Memory determines CPU allocation: 128 MB to 10 GB
    // More memory = more CPU power proportionally
    const lambdaProvider = new LambdaRunnerProvider(this, 'LambdaProvider', {
      labels: ['lambda', 'linux', 'x64'],
      memorySize: 3008, // 3 GB memory (provides ~1.8 vCPU)
      ephemeralStorageSize: Size.gibibytes(10), // 10 GB /tmp storage
    });

    // EC2 provider with custom instance type
    // Choose instance types based on CPU, memory, and network requirements
    const ec2Provider = new Ec2RunnerProvider(this, 'Ec2Provider', {
      labels: ['ec2', 'linux', 'x64'],
      vpc: vpc,
      instanceType: InstanceType.of(InstanceClass.M6I, InstanceSize.XLARGE), // 4 vCPU, 16 GB RAM
    });

    // ECS provider with custom instance type and task CPU/memory
    // Instance type for cluster instances, CPU/memory for runner tasks
    const ecsProvider = new EcsRunnerProvider(this, 'EcsProvider', {
      labels: ['ecs', 'linux', 'x64'],
      vpc: vpc,
      instanceType: InstanceType.of(InstanceClass.M6I, InstanceSize.LARGE), // 2 vCPU, 8 GB RAM per instance
      cpu: 1024, // 1 vCPU per task
      memoryLimitMiB: 2048, // 2 GB per task
    });

    // Create the GitHub runners infrastructure
    new GitHubRunners(this, 'GitHubRunners', {
      providers: [
        fargateProvider,
        codebuildProvider,
        lambdaProvider,
        ec2Provider,
        ecsProvider,
      ],
    });
  }
}

const app = new App();
new ComputeOptionsStack(app, 'compute-options-example');
app.synth();
