#!/usr/bin/env node
/**
 * Advanced example with comprehensive runner configuration.
 *
 * This example demonstrates:
 * - Multiple providers (CodeBuild, Fargate, Lambda, EC2)
 * - Custom runner images for different architectures
 * - VPC configuration with security groups
 * - S3 bucket integration
 * - Monitoring and alerting
 * - Different retry strategies
 * - Custom labels and runner groups
 */

import { App, Stack, Duration, Size, CfnOutput } from 'aws-cdk-lib';
import { Vpc, SubnetType, SecurityGroup, Peer, Port, InstanceType, InstanceClass, InstanceSize } from 'aws-cdk-lib/aws-ec2';
import { Bucket, BucketEncryption, BlockPublicAccess } from 'aws-cdk-lib/aws-s3';
import { ComputeType } from 'aws-cdk-lib/aws-codebuild';
import {
  GitHubRunners,
  CodeBuildRunnerProvider,
  FargateRunnerProvider,
  LambdaRunnerProvider,
  Ec2RunnerProvider,
  RunnerImageComponent,
  Architecture,
  Os,
  LambdaAccess,
} from '@cloudsnorkel/cdk-github-runners';

class AdvancedStack extends Stack {
  constructor(scope: App, id: string) {
    super(scope, id);

    // Create VPC with public and private subnets
    const vpc = new Vpc(this, 'VPC', {
      maxAzs: 3,
      natGateways: 2,
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

    // Create security groups
    const runnerSg = new SecurityGroup(this, 'RunnerSecurityGroup', { vpc });
    runnerSg.addEgressRule(Peer.anyIpv4(), Port.allTraffic());

    // Create S3 bucket for artifacts
    const artifactsBucket = new Bucket(this, 'ArtifactsBucket', {
      versioned: true,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    // Create custom image builders for different architectures
    const linuxX64Builder = FargateRunnerProvider.imageBuilder(
      this, 'LinuxX64Builder',
      {
        architecture: Architecture.X86_64,
        os: Os.LINUX_UBUNTU,
        vpc: vpc,
      },
    );
    linuxX64Builder.addComponent(
      RunnerImageComponent.custom({
        name: 'Development Tools',
        commands: [
          'apt-get update',
          'apt-get install -y git-lfs curl jq',
        ],
      }),
    );

    const linuxArm64Builder = FargateRunnerProvider.imageBuilder(
      this, 'LinuxArm64Builder',
      {
        architecture: Architecture.ARM64,
        os: Os.LINUX_UBUNTU,
        vpc: vpc,
      },
    );
    linuxArm64Builder.addComponent(
      RunnerImageComponent.custom({
        name: 'ARM64 Tools',
        commands: [
          'apt-get update',
          'apt-get install -y git-lfs curl jq',
        ],
      }),
    );

    const windowsBuilder = FargateRunnerProvider.imageBuilder(
      this, 'WindowsBuilder',
      {
        architecture: Architecture.X86_64,
        os: Os.WINDOWS,
        vpc: vpc,
        subnetSelection: { subnetType: SubnetType.PUBLIC },
      },
    );
    windowsBuilder.addComponent(
      RunnerImageComponent.custom({
        name: 'Windows Tools',
        commands: [
          'choco install -y git-lfs python3',
          'refreshenv',
        ],
      }),
    );

    // CodeBuild provider for quick builds
    const codebuildProvider = new CodeBuildRunnerProvider(this, 'CodeBuildProvider', {
      labels: ['codebuild', 'quick', 'linux', 'x64'],
      computeType: ComputeType.SMALL,
    });

    // Fargate providers for different architectures
    const fargateX64Provider = new FargateRunnerProvider(this, 'FargateX64Provider', {
      labels: ['fargate', 'docker', 'linux', 'x64'],
      vpc: vpc,
      securityGroups: [runnerSg],
      imageBuilder: linuxX64Builder,
      cpu: 2048,  // 2 vCPU
      memoryLimitMiB: 4096,  // 4 GB RAM
      retryOptions: {
        maxAttempts: 5,
        interval: Duration.minutes(5),
        backoffRate: 2.0,
      },
    });

    const fargateArm64Provider = new FargateRunnerProvider(this, 'FargateArm64Provider', {
      labels: ['fargate', 'docker', 'linux', 'arm64'],
      vpc: vpc,
      securityGroups: [runnerSg],
      imageBuilder: linuxArm64Builder,
      cpu: 2048,  // 2 vCPU
      memoryLimitMiB: 4096,  // 4 GB RAM
      retryOptions: {
        maxAttempts: 3,
        interval: Duration.minutes(10),
        backoffRate: 1.5,
      },
    });

    const fargateWindowsProvider = new FargateRunnerProvider(this, 'FargateWindowsProvider', {
      labels: ['fargate', 'windows', 'x64'],
      vpc: vpc,
      securityGroups: [runnerSg],
      imageBuilder: windowsBuilder,
      cpu: 2048,  // 2 vCPU
      memoryLimitMiB: 4096,  // 4 GB RAM
      retryOptions: {
        maxAttempts: 3,
        interval: Duration.minutes(10),
        backoffRate: 1.5,
      },
    });

    // Lambda provider for short tasks
    const lambdaProvider = new LambdaRunnerProvider(this, 'LambdaProvider', {
      labels: ['lambda', 'short', 'linux'],
      timeout: Duration.minutes(10),
      memorySize: 1024,
      retryOptions: {
        maxAttempts: 2,
        interval: Duration.minutes(1),
        backoffRate: 2.0,
      },
    });

    // EC2 provider for long-running tasks
    const ec2Provider = new Ec2RunnerProvider(this, 'Ec2Provider', {
      labels: ['ec2', 'long-running', 'linux', 'x64'],
      vpc: vpc,
      securityGroups: [runnerSg],
      instanceType: InstanceType.of(InstanceClass.M5, InstanceSize.LARGE),
      storageSize: Size.gibibytes(100),
      retryOptions: {
        maxAttempts: 3,
        interval: Duration.minutes(5),
        backoffRate: 1.5,
      },
    });

    // Grant permissions to providers
    artifactsBucket.grantReadWrite(codebuildProvider);
    artifactsBucket.grantReadWrite(fargateX64Provider);
    artifactsBucket.grantReadWrite(fargateArm64Provider);
    artifactsBucket.grantReadWrite(fargateWindowsProvider);
    artifactsBucket.grantReadWrite(ec2Provider);

    // Create the GitHub runners infrastructure
    const runners = new GitHubRunners(this, 'GitHubRunners', {
      providers: [
        codebuildProvider,
        fargateX64Provider,
        fargateArm64Provider,
        fargateWindowsProvider,
        lambdaProvider,
        ec2Provider,
      ],
      // Configure access
      // Use API Gateway with GitHub webhook IPs - can be IP restricted (more secure than default Lambda URL)
      webhookAccess: LambdaAccess.apiGateway({
        allowedIps: LambdaAccess.githubWebhookIps(),
      }),
      // Status endpoint returns sensitive information - limit to specific IPs or disable
      statusAccess: LambdaAccess.apiGateway({
        allowedIps: ['1.2.3.4/32'], // Replace with your IP address
      }),
      // Disable setup access after initial setup is complete
      setupAccess: LambdaAccess.noAccess(),
      // Configure retry options
      retryOptions: {
        maxAttempts: 10,
        interval: Duration.minutes(5),
        backoffRate: 1.5,
      },
    });

    // Create CloudWatch alarms for monitoring
    runners.metricFailed().createAlarm(this, 'FailedRunnersAlarm', {
      threshold: 5,
      evaluationPeriods: 2,
      alarmDescription: 'Alert when runner starts fail',
    });

    // Output important information
    new CfnOutput(this, 'ArtifactsBucketName', {
      value: artifactsBucket.bucketName,
      description: 'S3 bucket for storing build artifacts',
    });

    new CfnOutput(this, 'VPCId', {
      value: vpc.vpcId,
      description: 'VPC ID for the runners',
    });
  }
}

const app = new App();
new AdvancedStack(app, 'AdvancedExample');
app.synth();
