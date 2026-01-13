#!/usr/bin/env python3
"""
Example: Custom storage options for EC2 runners and image builders.

This example demonstrates how to configure custom EBS storage options
for EC2 runners, including volume type, IOPS, and throughput.
It also shows how to increase storage for AMI builders and Docker image builders.
"""

import aws_cdk as cdk
from aws_cdk import Stack, aws_ec2 as ec2, aws_codebuild as codebuild, Size
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners,
    Ec2RunnerProvider,
    CodeBuildRunnerProvider,
    StorageOptions,
)


class StorageOptionsStack(Stack):
    def __init__(self, scope, construct_id, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # Note: Creating a VPC is not required. Providers can use the default VPC or an existing VPC.
        # We create one here to make this example self-contained and testable.
        # Create a VPC with public and private subnets
        vpc = ec2.Vpc(
            self, "VPC",
            max_azs=2,
            subnet_configuration=[
                ec2.SubnetConfiguration(
                    name="Public",
                    subnet_type=ec2.SubnetType.PUBLIC,
                    cidr_mask=24
                ),
                ec2.SubnetConfiguration(
                    name="Private",
                    subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS,
                    cidr_mask=24
                )
            ]
        )

        # Create EC2 provider with custom storage options
        # GP3 volumes offer better price/performance than GP2
        ec2_provider = Ec2RunnerProvider(
            self, "Ec2Provider",
            labels=["ec2", "linux", "x64"],
            vpc=vpc,
            storage_size=Size.gibibytes(100),  # 100 GB storage
            storage_options=StorageOptions(
                volume_type=ec2.EbsDeviceVolumeType.GP3,  # Use GP3 for better performance
                iops=3000,  # 3000 IOPS (GP3 supports 3000-16000 IOPS)
                throughput=125,  # 125 MiB/s throughput (GP3 supports 125-1000 MiB/s)
            ),
            # Increase storage for AMI builder to support larger images
            # The runner storage size must be at least as large as the AMI builder storage size
            ami_builder=Ec2RunnerProvider.image_builder(
                self, "Ami Builder",
                vpc=vpc,
                aws_image_builder_options={
                    "storage_size": Size.gibibytes(50),  # 50 GB for AMI builder (default is usually 30GB for Linux)
                }
            )
        )

        # CodeBuild provider with increased storage via compute type
        # Larger compute types provide more disk space:
        # - SMALL: 64 GB
        # - MEDIUM: 128 GB
        # - LARGE: 128 GB
        # - X2_LARGE: 256 GB (Linux) or 824 GB (Windows)
        # Use a larger compute type when building Docker images that require more disk space
        codebuild_provider = CodeBuildRunnerProvider(
            self, "CodeBuildProvider",
            labels=["codebuild", "linux", "x64"],
            compute_type=codebuild.ComputeType.X2_LARGE,  # 256 GB disk space for Linux (vs 64 GB for SMALL)
            # Alternatively, configure the image builder directly:
            image_builder=CodeBuildRunnerProvider.image_builder(
                self, "Docker Image Builder",
                code_build_options={
                    "compute_type": codebuild.ComputeType.X2_LARGE,  # More disk space for building larger Docker images
                }
            )
        )

        # Create the GitHub runners infrastructure
        GitHubRunners(
            self, "GitHubRunners",
            providers=[ec2_provider, codebuild_provider]
        )


app = cdk.App()
StorageOptionsStack(app, "storage-options-example")
app.synth()
