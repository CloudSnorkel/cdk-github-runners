#!/usr/bin/env python3
"""
Example: GPU support for GitHub Actions runners.

Demonstrates nvidia_drivers component across all provider types, CPU architectures,
and OSes to verify the component works for every supported config.

You probably don't want to use this example as-is. Instead, you should pick the
provider type you want and comment out the others.

Provider types: EC2 (all OSes), CodeBuild (x64), ECS (x64)
CPU types: x64, ARM64
OSes: Ubuntu, Amazon Linux 2, Amazon Linux 2023, Windows
"""

import aws_cdk as cdk
from aws_cdk import Stack, aws_ec2 as ec2, Size
from cloudsnorkel.cdk_github_runners import (
    AwsImageBuilderRunnerImageBuilderProps,
    CodeBuildRunnerImageBuilderProps,
    GitHubRunners,
    Ec2RunnerProvider,
    CodeBuildRunnerProvider,
    EcsRunnerProvider,
    RunnerImageComponent,
    Os,
    Architecture,
)


class GpuStack(Stack):
    def __init__(self, scope, construct_id, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        vpc = ec2.Vpc(
            self, "VPC",
            max_azs=2,
            subnet_configuration=[
                ec2.SubnetConfiguration(name="Public", subnet_type=ec2.SubnetType.PUBLIC, cidr_mask=24),
                ec2.SubnetConfiguration(name="Private", subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS, cidr_mask=24),
            ]
        )

        g4dn = ec2.InstanceType.of(ec2.InstanceClass.G4DN, ec2.InstanceSize.XLARGE)

        # EC2 Ubuntu x64
        ec2_ubuntu_image_builder = Ec2RunnerProvider.image_builder(
            self, "EC2UbuntuImageBuilder",
            os=Os.LINUX_UBUNTU,
            architecture=Architecture.X86_64,
            vpc=vpc,
            aws_image_builder_options=AwsImageBuilderRunnerImageBuilderProps(storage_size=Size.gibibytes(50)),
        )
        ec2_ubuntu_image_builder.add_component(RunnerImageComponent.nvidia_drivers())

        ec2_ubuntu_provider = Ec2RunnerProvider(
            self, "EC2UbuntuProvider",
            labels=["ec2", "gpu", "ubuntu", "x64"],
            vpc=vpc,
            instance_type=g4dn,
            image_builder=ec2_ubuntu_image_builder,
            storage_size=Size.gibibytes(50),
        )

        # EC2 Ubuntu ARM64 (G5g)
        ec2_ubuntu_arm64_image_builder = Ec2RunnerProvider.image_builder(
            self, "EC2UbuntuArm64ImageBuilder",
            os=Os.LINUX_UBUNTU,
            architecture=Architecture.ARM64,
            vpc=vpc,
            aws_image_builder_options=AwsImageBuilderRunnerImageBuilderProps(
                instance_type=ec2.InstanceType.of(ec2.InstanceClass.M6G, ec2.InstanceSize.LARGE),
                storage_size=Size.gibibytes(50),
            ),
        )
        ec2_ubuntu_arm64_image_builder.add_component(RunnerImageComponent.nvidia_drivers())

        ec2_ubuntu_arm64_provider = Ec2RunnerProvider(
            self, "EC2UbuntuArm64Provider",
            labels=["ec2", "gpu", "ubuntu", "arm64"],
            vpc=vpc,
            instance_type=ec2.InstanceType.of(ec2.InstanceClass.G5G, ec2.InstanceSize.XLARGE),
            image_builder=ec2_ubuntu_arm64_image_builder,
            storage_size=Size.gibibytes(50),
        )

        # EC2 Amazon Linux 2
        ec2_al2_image_builder = Ec2RunnerProvider.image_builder(
            self, "EC2Al2ImageBuilder",
            os=Os.LINUX_AMAZON_2,
            architecture=Architecture.X86_64,
            vpc=vpc,
            aws_image_builder_options=AwsImageBuilderRunnerImageBuilderProps(storage_size=Size.gibibytes(50)),
        )
        ec2_al2_image_builder.add_component(RunnerImageComponent.nvidia_drivers())

        ec2_al2_provider = Ec2RunnerProvider(
            self, "EC2Al2Provider",
            labels=["ec2", "gpu", "al2"],
            vpc=vpc,
            instance_type=g4dn,
            image_builder=ec2_al2_image_builder,
            storage_size=Size.gibibytes(50),
        )

        # EC2 Amazon Linux 2023
        ec2_al2023_image_builder = Ec2RunnerProvider.image_builder(
            self, "EC2Al2023ImageBuilder",
            os=Os.LINUX_AMAZON_2023,
            architecture=Architecture.X86_64,
            vpc=vpc,
            aws_image_builder_options=AwsImageBuilderRunnerImageBuilderProps(storage_size=Size.gibibytes(50)),
        )
        ec2_al2023_image_builder.add_component(RunnerImageComponent.nvidia_drivers())

        ec2_al2023_provider = Ec2RunnerProvider(
            self, "EC2Al2023Provider",
            labels=["ec2", "gpu", "al2023"],
            vpc=vpc,
            instance_type=g4dn,
            image_builder=ec2_al2023_image_builder,
            storage_size=Size.gibibytes(50),
        )

        # EC2 Windows
        ec2_windows_image_builder = Ec2RunnerProvider.image_builder(
            self, "EC2WindowsImageBuilder",
            os=Os.WINDOWS,
            architecture=Architecture.X86_64,
            vpc=vpc,
            aws_image_builder_options=AwsImageBuilderRunnerImageBuilderProps(storage_size=Size.gibibytes(80)),
        )
        ec2_windows_image_builder.add_component(RunnerImageComponent.nvidia_drivers())

        ec2_windows_provider = Ec2RunnerProvider(
            self, "EC2WindowsProvider",
            labels=["ec2", "gpu", "windows"],
            vpc=vpc,
            instance_type=g4dn,
            image_builder=ec2_windows_image_builder,
            storage_size=Size.gibibytes(80),
        )

        # CodeBuild
        codebuild_image_builder = CodeBuildRunnerProvider.image_builder(
            self, "CodeBuildGpuImageBuilder",
            os=Os.LINUX_UBUNTU,
            architecture=Architecture.X86_64,
        )
        codebuild_image_builder.add_component(RunnerImageComponent.nvidia_drivers())

        codebuild_provider = CodeBuildRunnerProvider(
            self, "CodeBuildProvider",
            labels=["codebuild", "gpu"],
            image_builder=codebuild_image_builder,
            gpu=True,
        )

        # ECS
        ecs_image_builder = EcsRunnerProvider.image_builder(
            self, "EcsGpuImageBuilder",
            os=Os.LINUX_UBUNTU,
            architecture=Architecture.X86_64,
        )
        ecs_image_builder.add_component(RunnerImageComponent.nvidia_drivers())

        ecs_provider = EcsRunnerProvider(
            self, "EcsProvider",
            labels=["ecs", "gpu"],
            vpc=vpc,
            image_builder=ecs_image_builder,
            gpu=1,
        )

        GitHubRunners(
            self, "GitHubRunners",
            providers=[
                ec2_ubuntu_provider,
                ec2_ubuntu_arm64_provider,
                ec2_al2_provider,
                ec2_al2023_provider,
                ec2_windows_provider,
                codebuild_provider,
                ecs_provider,
            ]
        )


app = cdk.App()
GpuStack(app, "gpu-example")
app.synth()
