#!/usr/bin/env python3
"""
Example: Run a script before every job using GitHub Actions runner hooks.

GitHub's self-hosted runner can run a script before (or after) every job by
setting the ACTIONS_RUNNER_HOOK_JOB_STARTED (or ACTIONS_RUNNER_HOOK_JOB_COMPLETED)
environment variable. This is handy for anything that needs to happen once per
job, such as logging job metadata, sending notifications, or preparing the
workspace.

The hook script is added to the runner image as an asset, so it's versioned
alongside this stack instead of being echoed into a file at deploy time.
"""

import os

import aws_cdk as cdk
from aws_cdk import Stack, aws_ec2 as ec2
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners,
    Ec2RunnerProvider,
    RunnerImageComponent,
)


class JobHooksStack(Stack):
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

        # Create an image builder so we can add the hook scripts.
        image_builder = Ec2RunnerProvider.image_builder(
            self, "ImageBuilder",
            vpc=vpc,
        )

        # Point the runner at local script files. Each helper copies the script into
        # the image, marks it executable, and sets the matching environment variable
        # so the runner runs it before/after every job. The scripts live in real,
        # version-controlled files instead of being echoed into the image.
        # See https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/running-scripts-before-or-after-a-job
        image_builder.add_component(
            RunnerImageComponent.job_started_hook(os.path.join(os.path.dirname(__file__), "job-started.sh"))
        )
        image_builder.add_component(
            RunnerImageComponent.job_completed_hook(os.path.join(os.path.dirname(__file__), "job-completed.sh"))
        )

        # Create an EC2 provider using the custom image.
        ec2_provider = Ec2RunnerProvider(
            self, "Ec2Provider",
            labels=["ec2", "linux", "x64"],
            vpc=vpc,
            image_builder=image_builder
        )

        # Create the GitHub runners infrastructure
        GitHubRunners(
            self, "GitHubRunners",
            providers=[ec2_provider]
        )


app = cdk.App()
JobHooksStack(app, "job-hooks-example")
app.synth()
