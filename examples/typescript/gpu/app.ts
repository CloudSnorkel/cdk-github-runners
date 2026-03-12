#!/usr/bin/env node
/**
 * Example: GPU support for GitHub Actions runners.
 *
 * Supported: EC2 (Ubuntu x64/ARM64, AL2023, Windows), CodeBuild, ECS.
 * Note: EC2 AL2 is NOT supported (nvidia rpms require a newer rpm lib than available in AL2).
 *
 * For EC2 Ubuntu x64, the default builder auto-selects a GPU base image (DLAMI).
 * For EC2 Ubuntu ARM64 or AL2023, use a custom builder: baseAmi: BaseImage.fromGpuBase(os, architecture)
 * For EC2 Windows, subscribe at https://aws.amazon.com/marketplace/pp/prodview-f4reygwmtxipu then use
 *   baseAmi: BaseImage.fromMarketplaceProductId('prod-77u2eeb33lmrm')
 * For CodeBuild/ECS, use a custom builder with an ECR Public deep learning container base image
 *   (e.g. BaseContainerImage.fromEcrPublic('deep-learning-containers', 'base', '<tag>'))
 *   or BaseContainerImage.fromDockerHub('nvidia/cuda', '<tag>') (Docker Hub may throttle).
 */

import { App, Size, Stack } from 'aws-cdk-lib';
import { InstanceClass, InstanceSize, InstanceType, SubnetType, Vpc } from 'aws-cdk-lib/aws-ec2';
import {
  Architecture,
  BaseContainerImage,
  BaseImage,
  CodeBuildRunnerProvider,
  Ec2RunnerProvider,
  EcsRunnerProvider,
  GitHubRunners,
  Os,
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

    // EC2 Ubuntu x64 - default builder auto-uses GPU base (DLAMI)
    // To customize the image builder, use:
    //
    //   const imageBuilder = Ec2RunnerProvider.imageBuilder(this, 'ImageBuilder', {
    //     baseAmi: BaseImage.fromGpuBase(Os.LINUX_UBUNTU, Architecture.X86_64),
    //   });
    //   imageBuilder.addComponent(...);
    //   const provider = new Ec2RunnerProvider(this, 'Provider', {
    //     imageBuilder: imageBuilder,
    //     instanceType: InstanceType.of(InstanceClass.G4DN, InstanceSize.XLARGE),
    //   });
    const ec2UbuntuProvider = new Ec2RunnerProvider(this, 'EC2 Ubuntu x64', {
      labels: ['ec2', 'gpu', 'ubuntu', 'x64'],
      vpc,
      instanceType: g4dn,
      storageSize: Size.gibibytes(100), // base image is bigger than default 30GB
    });

    // EC2 Ubuntu ARM64 (G5g) - default builder auto-uses GPU base
    // To customize the image builder, use:
    //
    //   const imageBuilder = Ec2RunnerProvider.imageBuilder(this, 'ImageBuilder', {
    //     baseAmi: BaseImage.fromGpuBase(Os.LINUX_UBUNTU, Architecture.ARM64),
    //   });
    //   imageBuilder.addComponent(...);
    //   const provider = new Ec2RunnerProvider(this, 'Provider', {
    //     imageBuilder: imageBuilder,
    //     instanceType: InstanceType.of(InstanceClass.G5G, InstanceSize.XLARGE),
    //   });
    const ec2UbuntuArm64Provider = new Ec2RunnerProvider(this, 'EC2 Ubuntu ARM64', {
      labels: ['ec2', 'gpu', 'ubuntu', 'arm64'],
      vpc,
      instanceType: InstanceType.of(InstanceClass.G5G, InstanceSize.XLARGE),
      storageSize: Size.gibibytes(100), // base image is bigger than default 30GB
    });

    // EC2 Amazon Linux 2 - custom builder required (default is Ubuntu)
    //  --- fails because nvidia rpms require newer rpm lib than available in AL2
    /*
    const ec2Al2Provider = new Ec2RunnerProvider(this, 'EC2 Amazon Linux 2', {
      labels: ['ec2', 'gpu', 'al2'],
      vpc,
      instanceType: g4dn,
      imageBuilder: Ec2RunnerProvider.imageBuilder(this, 'Amazon Linux 2 Image Builder', {
        vpc,
        os: Os.LINUX_AMAZON_2,
        baseAmi: BaseImage.fromGpuBase(Os.LINUX_AMAZON_2, Architecture.X86_64),
      }),
    });
    */

    // EC2 Amazon Linux 2023 - custom builder required
    const ec2Al2023Provider = new Ec2RunnerProvider(this, 'EC2 Amazon Linux 2023', {
      labels: ['ec2', 'gpu', 'al2023'],
      vpc,
      instanceType: g4dn,
      storageSize: Size.gibibytes(100), // base image is bigger than default 30GB
      imageBuilder: Ec2RunnerProvider.imageBuilder(this, 'Amazon Linux 2023 Image Builder', {
        vpc,
        os: Os.LINUX_AMAZON_2023,
        baseAmi: BaseImage.fromGpuBase(Os.LINUX_AMAZON_2023, Architecture.X86_64),
      }),
    });

    // EC2 Windows - subscribe first to NVIDIA RTX Virtual Workstation at
    // https://aws.amazon.com/marketplace/pp/prodview-f4reygwmtxipu, then this example will work.
    // You can also any other AMI with NVIDIA drivers installed. It's also possible to use a custom
    // image builder and install the drivers using RunnerImageComponent.custom(). Usually this will
    // require the builder itself to be running on a GPU instance.
    const ec2WindowsProvider = new Ec2RunnerProvider(this, 'EC2 Windows', {
      labels: ['ec2', 'gpu', 'windows'],
      vpc,
      instanceType: g4dn,
      storageSize: Size.gibibytes(100), // base image is bigger than default 30GB
      imageBuilder: Ec2RunnerProvider.imageBuilder(this, 'Windows Image Builder', {
        vpc,
        os: Os.WINDOWS,
        baseAmi: BaseImage.fromMarketplaceProductId('prod-77u2eeb33lmrm'),
        awsImageBuilderOptions: {
          instanceType: g4dn, // AMI requires it
        },
      }),
    });

    // --- Container based runners ---

    // For container based runners, you need to pick the base image that works for your usecase.
    // There is sadly not an easy way to always pick the latest.
    // For this example, we'll use the latest Deep Learning Containers base image.
    // Find more versions at https://gallery.ecr.aws/deep-learning-containers/base
    // You can also use `BaseContainerImage.fromDockerHub('nvidia/cuda', '13.0.2-runtime-ubuntu22.04')` but Docker Hub always throttles

    // CodeBuild - default builder auto-uses nvidia/cuda base when gpu: true
    const codebuildProvider = new CodeBuildRunnerProvider(this, 'CodeBuild', {
      labels: ['codebuild', 'gpu'],
      gpu: true,
      imageBuilder: CodeBuildRunnerProvider.imageBuilder(this, 'CodeBuild Image Builder', {
        vpc,
        os: Os.LINUX_UBUNTU_2204,
        baseDockerImage: BaseContainerImage.fromEcrPublic('deep-learning-containers', 'base', '13.0.2-gpu-py313-ubuntu22.04-ec2'),
      }),
    });

    // ECS - default builder auto-uses nvidia/cuda base when gpu > 0
    const ecsProvider = new EcsRunnerProvider(this, 'ECS', {
      labels: ['ecs', 'gpu'],
      vpc,
      gpu: 1,
      imageBuilder: EcsRunnerProvider.imageBuilder(this, 'ECS Image Builder', {
        vpc,
        os: Os.LINUX_UBUNTU_2204,
        baseDockerImage: BaseContainerImage.fromEcrPublic('deep-learning-containers', 'base', '13.0.2-gpu-py313-ubuntu22.04-ec2'),
      }),
    });

    new GitHubRunners(this, 'GitHubRunners', {
      providers: [
        ec2UbuntuProvider,
        ec2UbuntuArm64Provider,
        // ec2Al2Provider,
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
