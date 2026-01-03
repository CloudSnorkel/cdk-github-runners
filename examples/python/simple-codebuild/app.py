#!/usr/bin/env python3
"""
Simple example using CodeBuild provider for GitHub self-hosted runners.

This example creates a basic GitHub runners setup with just a CodeBuild provider.
It's the simplest way to get started with self-hosted runners.
"""

import aws_cdk as cdk
from aws_cdk import Stack
from cloudsnorkel.cdk_github_runners import GitHubRunners, CodeBuildRunnerProvider


class SimpleCodeBuildStack(Stack):
    def __init__(self, scope, construct_id, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # Create a CodeBuild provider with default settings
        codebuild_provider = CodeBuildRunnerProvider(
            self, "CodeBuildProvider",
            labels=["codebuild", "linux", "x64"]
        )

        # Create the GitHub runners infrastructure
        GitHubRunners(
            self, "GitHubRunners",
            providers=[codebuild_provider]
        )


app = cdk.App()
SimpleCodeBuildStack(app, "SimpleCodeBuildExample")
app.synth()
