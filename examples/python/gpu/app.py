#!/usr/bin/env python3
"""
Example: GPU support for GitHub Actions runners.

When testing or copying this, you probably want just one provider and not all of them.

Supported: EC2 (Ubuntu x64/ARM64, AL2023, Windows), CodeBuild, ECS.
Note: EC2 AL2 is NOT supported (nvidia rpms require a newer rpm lib than available in AL2).

For EC2 Ubuntu x64, the default builder auto-selects a GPU base image (DLAMI).
For EC2 Ubuntu ARM64 or AL2023, use a custom builder: base_ami=BaseImage.from_gpu_base(os, architecture)
For EC2 Windows, subscribe at https://aws.amazon.com/marketplace/pp/prodview-f4reygwmtxipu then use
  base_ami=BaseImage.from_marketplace_product_id('prod-77u2eeb33lmrm')
For CodeBuild/ECS, use a custom builder with an ECR Public deep learning container base image
  (e.g. BaseContainerImage.from_ecr_public('deep-learning-containers', 'base', '<tag>'))
  or BaseContainerImage.from_docker_hub('nvidia/cuda', '<tag>') (Docker Hub may throttle).
"""

import aws_cdk as cdk
from aws_cdk import Stack, aws_ec2 as ec2, Size
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners,
    Ec2RunnerProvider,
    CodeBuildRunnerProvider,
    EcsRunnerProvider,
    BaseImage,
    BaseContainerImage,
    AwsImageBuilderRunnerImageBuilderProps,
    Os,
    Architecture,
)


class GpuStack(Stack):
    def __init__(self, scope, construct_id, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # Note: Creating a VPC is not required. Providers can use the default VPC or an existing VPC.
        # We create one here to make this example self-contained and testable.
        # Create a VPC with public and private subnets
        vpc = ec2.Vpc(
            self, "VPC",
            max_azs=2,
            subnet_configuration=[
                ec2.SubnetConfiguration(name="Public", subnet_type=ec2.SubnetType.PUBLIC, cidr_mask=24),
                ec2.SubnetConfiguration(name="Private", subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS, cidr_mask=24),
            ]
        )

        g4dn = ec2.InstanceType.of(ec2.InstanceClass.G4DN, ec2.InstanceSize.XLARGE)

        # EC2 Ubuntu x64 - default builder auto-uses GPU base (DLAMI)
        # To customize the image builder, use:
        #
        #   image_builder = Ec2RunnerProvider.image_builder(self, "ImageBuilder", base_ami=BaseImage.from_gpu_base(Os.LINUX_UBUNTU, Architecture.X86_64))
        #   image_builder.add_component(...)
        #   provider = Ec2RunnerProvider(self, "Provider", instance_type=InstanceType.of(InstanceClass.G4DN, InstanceSize.XLARGE), image_builder=image_builder)
        ec2_ubuntu_provider = Ec2RunnerProvider(
            self, "EC2 Ubuntu x64",
            labels=["ec2", "gpu", "ubuntu", "x64"],
            vpc=vpc,
            instance_type=g4dn,
            storage_size=Size.gibibytes(100),  # base image is bigger than default 30GB
        )

        # EC2 Ubuntu ARM64 (G5g) - default builder auto-uses GPU base
        # To customize the image builder, use:
        #
        #   image_builder = Ec2RunnerProvider.image_builder(self, "ImageBuilder", base_ami=BaseImage.from_gpu_base(Os.LINUX_UBUNTU, Architecture.ARM64))
        #   image_builder.add_component(...)
        #   provider = Ec2RunnerProvider(self, "Provider", instance_type=InstanceType.of(InstanceClass.G5G, InstanceSize.XLARGE), image_builder=image_builder)
        ec2_ubuntu_arm64_provider = Ec2RunnerProvider(
            self, "EC2 Ubuntu ARM64",
            labels=["ec2", "gpu", "ubuntu", "arm64"],
            vpc=vpc,
            instance_type=ec2.InstanceType.of(ec2.InstanceClass.G5G, ec2.InstanceSize.XLARGE),
            storage_size=Size.gibibytes(100),  # base image is bigger than default 30GB
        )

        # EC2 Amazon Linux 2 - custom builder required (default is Ubuntu)
        # --- fails because nvidia rpms require newer rpm lib than available in AL2
        # ec2_al2_provider = Ec2RunnerProvider(
        #     self, "EC2 Amazon Linux 2",
        #     labels=["ec2", "gpu", "al2"],
        #     vpc=vpc,
        #     instance_type=g4dn,
        #     image_builder=Ec2RunnerProvider.image_builder(
        #         self, "Amazon Linux 2 Image Builder",
        #         vpc=vpc,
        #         os=Os.LINUX_AMAZON_2,
        #         base_ami=BaseImage.from_gpu_base(Os.LINUX_AMAZON_2, Architecture.X86_64),
        #     ),
        # )

        # EC2 Amazon Linux 2023 - custom builder required
        ec2_al2023_provider = Ec2RunnerProvider(
            self, "EC2 Amazon Linux 2023",
            labels=["ec2", "gpu", "al2023"],
            vpc=vpc,
            instance_type=g4dn,
            storage_size=Size.gibibytes(100),  # base image is bigger than default 30GB
            image_builder=Ec2RunnerProvider.image_builder(
                self, "Amazon Linux 2023 Image Builder",
                vpc=vpc,
                os=Os.LINUX_AMAZON_2023,
                base_ami=BaseImage.from_gpu_base(Os.LINUX_AMAZON_2023, Architecture.X86_64),
            ),
        )

        # EC2 Windows - subscribe first to NVIDIA RTX Virtual Workstation at
        # https://aws.amazon.com/marketplace/pp/prodview-f4reygwmtxipu, then this example will work.
        # You can also any other AMI with NVIDIA drivers installed. It's also possible to use a custom
        # image builder and install the drivers using RunnerImageComponent.custom(). Usually this will
        # require the builder itself to be running on a GPU instance.
        ec2_windows_provider = Ec2RunnerProvider(
            self, "EC2 Windows",
            labels=["ec2", "gpu", "windows"],
            vpc=vpc,
            instance_type=g4dn,
            storage_size=Size.gibibytes(100),  # base image is bigger than default 30GB
            image_builder=Ec2RunnerProvider.image_builder(
                self, "Windows Image Builder",
                vpc=vpc,
                os=Os.WINDOWS,
                base_ami=BaseImage.from_marketplace_product_id("prod-77u2eeb33lmrm"),
                aws_image_builder_options=AwsImageBuilderRunnerImageBuilderProps(
                    instance_type=g4dn,  # AMI requires it
                ),
            ),
        )

        # --- Container based runners ---
        #
        # For container based runners, you need to pick the base image that works for your usecase.
        # There is sadly not an easy way to always pick the latest.
        # For this example, we'll use the latest Deep Learning Containers base image.
        # Find more versions at https://gallery.ecr.aws/deep-learning-containers/base
        # You can also use BaseContainerImage.from_docker_hub('nvidia/cuda', '13.0.2-runtime-ubuntu22.04') but Docker Hub always throttles

        # CodeBuild - this example explicitly configures a GPU-enabled deep learning container base image when gpu=True
        codebuild_provider = CodeBuildRunnerProvider(
            self, "CodeBuild",
            labels=["codebuild", "gpu"],
            gpu=True,
            image_builder=CodeBuildRunnerProvider.image_builder(
                self, "CodeBuild Image Builder",
                vpc=vpc,
                os=Os.LINUX_UBUNTU_2204,
                base_docker_image=BaseContainerImage.from_ecr_public("deep-learning-containers", "base", "13.0.2-gpu-py313-ubuntu22.04-ec2"),
            ),
        )

        # ECS - this example explicitly configures a GPU-enabled deep learning container base image when gpu > 0
        ecs_provider = EcsRunnerProvider(
            self, "ECS",
            labels=["ecs", "gpu"],
            vpc=vpc,
            gpu=1,
            image_builder=EcsRunnerProvider.image_builder(
                self, "ECS Image Builder",
                vpc=vpc,
                os=Os.LINUX_UBUNTU_2204,
                base_docker_image=BaseContainerImage.from_ecr_public("deep-learning-containers", "base", "13.0.2-gpu-py313-ubuntu22.04-ec2"),
            ),
        )

        GitHubRunners(
            self, "GitHubRunners",
            providers=[
                ec2_ubuntu_provider,
                ec2_ubuntu_arm64_provider,
                # ec2_al2_provider,
                ec2_al2023_provider,
                ec2_windows_provider,
                codebuild_provider,
                ecs_provider,
            ]
        )


app = cdk.App()
GpuStack(app, "gpu-example")
app.synth()
