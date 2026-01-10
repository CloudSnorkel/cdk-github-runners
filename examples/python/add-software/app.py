#!/usr/bin/env python3
"""
Example: Add software to runners.

This example demonstrates how to add custom software to runner images
using custom image components.
"""

import aws_cdk as cdk
from aws_cdk import Stack
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
