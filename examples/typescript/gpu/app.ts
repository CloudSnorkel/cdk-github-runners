#!/usr/bin/env node
/**
 * Example: GPU support for GitHub Actions runners.
 *
 * Demonstrates nvidiaDrivers component across all provider types, CPU architectures,
 * and OSes to verify the component works for every supported config.
 * 
 * You probably don't want to use this example as-is. Instead, you should pick the provider type you want and comment out the others.
 *
 * Provider types: EC2 (all OSes), CodeBuild (x64), ECS (x64)
 * CPU types: x64, ARM64
 * OSes: Ubuntu, Amazon Linux 2, Amazon Linux 2023, Windows
 */

import { App, Stack, Size } from 'aws-cdk-lib';
import { Vpc, SubnetType, InstanceType, InstanceClass, InstanceSize } from 'aws-cdk-lib/aws-ec2';
import {
  GitHubRunners,
  Ec2RunnerProvider,
  CodeBuildRunnerProvider,
  EcsRunnerProvider,
  RunnerImageComponent,
  Os,
  Architecture,
} from '@cloudsnorkel/cdk-github-runners';

class GpuStack extends Stack {
  constructor(scope: App, id: string) {
    super(scope, id);

    const vpc = new Vpc(this, 'VPC', {
      maxAzs: 2,
      subnetConfiguration: [
        { name: 'Public', subnetType: SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'Private', subnetType: SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
      ],
    });

    const g4dn = InstanceType.of(InstanceClass.G4DN, InstanceSize.XLARGE);

    // EC2 Ubuntu x64
    const ec2UbuntuImageBuilder = Ec2RunnerProvider.imageBuilder(this, 'EC2UbuntuImageBuilder', {
      os: Os.LINUX_UBUNTU,
      architecture: Architecture.X86_64,
      vpc,
      awsImageBuilderOptions: { storageSize: Size.gibibytes(50) },
    });
    ec2UbuntuImageBuilder.addComponent(RunnerImageComponent.nvidiaDrivers());

    const ec2UbuntuProvider = new Ec2RunnerProvider(this, 'EC2UbuntuProvider', {
      labels: ['ec2', 'gpu', 'ubuntu', 'x64'],
      vpc,
      instanceType: g4dn,
      imageBuilder: ec2UbuntuImageBuilder,
      storageSize: Size.gibibytes(50),
    });

    // EC2 Ubuntu ARM64 (G5g)
    const ec2UbuntuArm64ImageBuilder = Ec2RunnerProvider.imageBuilder(this, 'EC2UbuntuArm64ImageBuilder', {
      os: Os.LINUX_UBUNTU,
      architecture: Architecture.ARM64,
      vpc,
      awsImageBuilderOptions: {
        instanceType: InstanceType.of(InstanceClass.M6G, InstanceSize.LARGE),
        storageSize: Size.gibibytes(50),
      },
    });
    ec2UbuntuArm64ImageBuilder.addComponent(RunnerImageComponent.nvidiaDrivers());

    const ec2UbuntuArm64Provider = new Ec2RunnerProvider(this, 'EC2UbuntuArm64Provider', {
      labels: ['ec2', 'gpu', 'ubuntu', 'arm64'],
      vpc,
      instanceType: InstanceType.of(InstanceClass.G5G, InstanceSize.XLARGE),
      imageBuilder: ec2UbuntuArm64ImageBuilder,
      storageSize: Size.gibibytes(50),
    });

    // EC2 Amazon Linux 2
    const ec2Al2ImageBuilder = Ec2RunnerProvider.imageBuilder(this, 'EC2Al2ImageBuilder', {
      os: Os.LINUX_AMAZON_2,
      architecture: Architecture.X86_64,
      vpc,
      awsImageBuilderOptions: { storageSize: Size.gibibytes(50) },
    });
    ec2Al2ImageBuilder.addComponent(RunnerImageComponent.nvidiaDrivers());

    const ec2Al2Provider = new Ec2RunnerProvider(this, 'EC2Al2Provider', {
      labels: ['ec2', 'gpu', 'al2'],
      vpc,
      instanceType: g4dn,
      imageBuilder: ec2Al2ImageBuilder,
      storageSize: Size.gibibytes(50),
    });

    // EC2 Amazon Linux 2023
    const ec2Al2023ImageBuilder = Ec2RunnerProvider.imageBuilder(this, 'EC2Al2023ImageBuilder', {
      os: Os.LINUX_AMAZON_2023,
      architecture: Architecture.X86_64,
      vpc,
      awsImageBuilderOptions: { storageSize: Size.gibibytes(50) },
    });
    ec2Al2023ImageBuilder.addComponent(RunnerImageComponent.nvidiaDrivers());

    const ec2Al2023Provider = new Ec2RunnerProvider(this, 'EC2Al2023Provider', {
      labels: ['ec2', 'gpu', 'al2023'],
      vpc,
      instanceType: g4dn,
      imageBuilder: ec2Al2023ImageBuilder,
      storageSize: Size.gibibytes(50),
    });

    // EC2 Windows
    const ec2WindowsImageBuilder = Ec2RunnerProvider.imageBuilder(this, 'EC2WindowsImageBuilder', {
      os: Os.WINDOWS,
      architecture: Architecture.X86_64,
      vpc,
      awsImageBuilderOptions: { storageSize: Size.gibibytes(80) },
    });
    ec2WindowsImageBuilder.addComponent(RunnerImageComponent.nvidiaDrivers());

    const ec2WindowsProvider = new Ec2RunnerProvider(this, 'EC2WindowsProvider', {
      labels: ['ec2', 'gpu', 'windows'],
      vpc,
      instanceType: g4dn,
      imageBuilder: ec2WindowsImageBuilder,
      storageSize: Size.gibibytes(80),
    });

    // CodeBuild
    const codebuildImageBuilder = CodeBuildRunnerProvider.imageBuilder(this, 'CodeBuildGpuImageBuilder', {
      os: Os.LINUX_UBUNTU,
      architecture: Architecture.X86_64,
    });
    codebuildImageBuilder.addComponent(RunnerImageComponent.nvidiaDrivers());

    const codebuildProvider = new CodeBuildRunnerProvider(this, 'CodeBuildProvider', {
      labels: ['codebuild', 'gpu'],
      imageBuilder: codebuildImageBuilder,
      gpu: true,
    });

    // ECS
    const ecsImageBuilder = EcsRunnerProvider.imageBuilder(this, 'EcsGpuImageBuilder', {
      os: Os.LINUX_UBUNTU,
      architecture: Architecture.X86_64,
    });
    ecsImageBuilder.addComponent(RunnerImageComponent.nvidiaDrivers());

    const ecsProvider = new EcsRunnerProvider(this, 'EcsProvider', {
      labels: ['ecs', 'gpu'],
      vpc,
      imageBuilder: ecsImageBuilder,
      gpu: 1,
    });

    new GitHubRunners(this, 'GitHubRunners', {
      providers: [
        ec2UbuntuProvider,
        ec2UbuntuArm64Provider,
        ec2Al2Provider,
        ec2Al2023Provider,
        ec2WindowsProvider,
        codebuildProvider,
        ecsProvider,
      ],
    });
  }
}

const app = new App();
new GpuStack(app, 'gpu-example');
app.synth();
