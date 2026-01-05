#!/usr/bin/env python3
"""
Multi-provider example with custom runner image configuration.

This example demonstrates:
- Multiple providers (CodeBuild and Fargate)
- Custom runner image with additional software
- Different labels for different use cases
- VPC configuration for Fargate provider
"""

import aws_cdk as cdk
from aws_cdk import Stack, aws_ec2 as ec2, aws_codebuild as codebuild
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners, 
    CodeBuildRunnerProvider, 
    FargateRunnerProvider,
    RunnerImageComponent,
    Architecture,
    Os
)


class MultiProviderStack(Stack):
    def __init__(self, scope, construct_id, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # Create a VPC for the Fargate provider
        vpc = ec2.Vpc(self, "VPC", max_azs=2)

        # Create a custom image builder for Fargate with additional tools
        fargate_image_builder = FargateRunnerProvider.image_builder(
            self, "FargateImageBuilder",
            architecture=Architecture.X86_64,
            os=Os.LINUX_UBUNTU
        )
        
        # Add custom components to the image
        # Note: FargateRunnerProvider doesn't include Docker by default (unlike EC2/ECS providers)
        # So we add it here. We also add git-lfs as an additional tool.
        fargate_image_builder.add_component(
            RunnerImageComponent.docker()
        )
        fargate_image_builder.add_component(
            RunnerImageComponent.custom(
                name="Git LFS",
                commands=[
                    "apt-get update",
                    "apt-get install -y git-lfs",
                ]
            )
        )

        # Create CodeBuild provider for quick builds
        codebuild_provider = CodeBuildRunnerProvider(
            self, "CodeBuildProvider",
            labels=["codebuild", "quick", "linux"],
            compute_type=codebuild.ComputeType.SMALL
        )

        # Create Fargate provider for longer-running jobs with custom image
        fargate_provider = FargateRunnerProvider(
            self, "FargateProvider",
            labels=["fargate", "docker", "linux"],
            vpc=vpc,
            image_builder=fargate_image_builder,
            cpu=1024,  # 1 vCPU
            memory_limit_mib=2048  # 2 GB RAM
        )

        # Create the GitHub runners infrastructure with both providers
        GitHubRunners(
            self, "GitHubRunners",
            providers=[codebuild_provider, fargate_provider]
        )


app = cdk.App()
MultiProviderStack(app, "multi-provider-example")
app.synth()
