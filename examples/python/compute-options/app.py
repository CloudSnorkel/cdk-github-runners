#!/usr/bin/env python3
"""
Example: Custom CPU and instance type configurations.

This example demonstrates how to configure CPU, memory, and instance types
for different provider types to match your workload requirements.
"""

import aws_cdk as cdk
from aws_cdk import Stack, aws_ec2 as ec2, aws_codebuild as codebuild, Size
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners,
    FargateRunnerProvider,
    CodeBuildRunnerProvider,
    LambdaRunnerProvider,
    Ec2RunnerProvider,
    EcsRunnerProvider,
)


class ComputeOptionsStack(Stack):
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

        # Fargate provider with custom CPU and memory
        # CPU and memory must match Fargate's valid combinations
        # 2048 (2 vCPU) with 4096 (4 GB) memory
        fargate_provider = FargateRunnerProvider(
            self, "FargateProvider",
            labels=["fargate", "linux", "x64"],
            vpc=vpc,
            cpu=2048,  # 2 vCPU
            memory_limit_mib=4096  # 4 GB
        )

        # CodeBuild provider with custom compute type
        # Compute types: SMALL (2 vCPU, 3 GB), MEDIUM (4 vCPU, 7 GB), LARGE (8 vCPU, 15 GB), X2_LARGE (72 vCPU, 145 GB)
        codebuild_provider = CodeBuildRunnerProvider(
            self, "CodeBuildProvider",
            labels=["codebuild", "linux", "x64"],
            compute_type=codebuild.ComputeType.LARGE  # 8 vCPU, 15 GB RAM
        )

        # Lambda provider with custom memory
        # Memory determines CPU allocation: 128 MB to 10 GB
        # More memory = more CPU power proportionally
        lambda_provider = LambdaRunnerProvider(
            self, "LambdaProvider",
            labels=["lambda", "linux", "x64"],
            memory_size=3008,  # 3 GB memory (provides ~1.8 vCPU)
            ephemeral_storage_size=Size.gibibytes(10)  # 10 GB /tmp storage
        )

        # EC2 provider with custom instance type
        # Choose instance types based on CPU, memory, and network requirements
        ec2_provider = Ec2RunnerProvider(
            self, "Ec2Provider",
            labels=["ec2", "linux", "x64"],
            vpc=vpc,
            instance_type=ec2.InstanceType.of(ec2.InstanceClass.M6I, ec2.InstanceSize.XLARGE)  # 4 vCPU, 16 GB RAM
        )

        # ECS provider with custom instance type and task CPU/memory
        # Instance type for cluster instances, CPU/memory for runner tasks
        ecs_provider = EcsRunnerProvider(
            self, "EcsProvider",
            labels=["ecs", "linux", "x64"],
            vpc=vpc,
            instance_type=ec2.InstanceType.of(ec2.InstanceClass.M6I, ec2.InstanceSize.LARGE),  # 2 vCPU, 8 GB RAM per instance
            cpu=1024,  # 1 vCPU per task
            memory_limit_mib=2048  # 2 GB per task
        )

        # Create the GitHub runners infrastructure
        GitHubRunners(
            self, "GitHubRunners",
            providers=[
                fargate_provider,
                codebuild_provider,
                lambda_provider,
                ec2_provider,
                ecs_provider,
            ]
        )


app = cdk.App()
ComputeOptionsStack(app, "compute-options-example")
app.synth()
