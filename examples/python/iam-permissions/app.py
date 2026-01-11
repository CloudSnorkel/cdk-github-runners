#!/usr/bin/env python3
"""
Example: Grant IAM permissions to runners.

This example demonstrates how to grant AWS IAM permissions to runners,
allowing them to access AWS services like S3 buckets.
"""

import aws_cdk as cdk
from aws_cdk import Stack, aws_s3 as s3
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners,
    CodeBuildRunnerProvider,
)


class IamPermissionsStack(Stack):
    def __init__(self, scope, construct_id, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # Create an S3 bucket for artifacts
        artifacts_bucket = s3.Bucket(
            self, "ArtifactsBucket",
            encryption=s3.BucketEncryption.S3_MANAGED,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL
        )

        # Create a CodeBuild provider
        codebuild_provider = CodeBuildRunnerProvider(
            self, "CodeBuildProvider",
            labels=["codebuild", "linux", "x64"]
        )

        # Grant read/write permissions to the provider
        # The provider will pass these permissions to all runners it creates.
        # IMPORTANT: Any job/workflow that runs on these runners will have these permissions.
        # Only grant the minimum permissions necessary for your use case.
        artifacts_bucket.grant_read_write(codebuild_provider)

        # Create the GitHub runners infrastructure
        GitHubRunners(
            self, "GitHubRunners",
            providers=[codebuild_provider]
        )


app = cdk.App()
IamPermissionsStack(app, "iam-permissions-example")
app.synth()
