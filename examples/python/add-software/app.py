#!/usr/bin/env python3
"""
Example: Add software to runners.

This example demonstrates how to add custom software to runner images
using custom image components.
"""

import aws_cdk as cdk
from aws_cdk import Stack, aws_ec2 as ec2
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners,
    FargateRunnerProvider,
    RunnerImageComponent,
    Architecture,
    Os,
)


class AddSoftwareStack(Stack):
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

        # Create a custom image builder
        image_builder = FargateRunnerProvider.image_builder(
            self, "ImageBuilder",
            architecture=Architecture.X86_64,
            os=Os.LINUX_UBUNTU
        )

        # Add custom software to the image
        # The installed software will be available for all workflows using this provider,
        # saving setup time since you don't need to install it in each workflow step
        image_builder.add_component(
            RunnerImageComponent.custom(
                name="Development Tools",
                commands=[
                    "apt-get update",
                    "apt-get install -y git-lfs curl jq build-essential python3 python3-pip"
                ]
            )
        )

        # Create a Fargate provider with the custom image
        fargate_provider = FargateRunnerProvider(
            self, "FargateProvider",
            labels=["fargate", "linux", "x64"],
            vpc=vpc,
            image_builder=image_builder
        )

        # Create the GitHub runners infrastructure
        GitHubRunners(
            self, "GitHubRunners",
            providers=[fargate_provider]
        )


app = cdk.App()
AddSoftwareStack(app, "add-software-example")
app.synth()
