#!/usr/bin/env python3
"""
Example: Compliance settings.

This example demonstrates how to encrypt everything with your own KMS keys,
limit Lambda concurrency, and log API requests.
"""

import aws_cdk as cdk
from aws_cdk import Stack, aws_kms as kms
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners,
    CodeBuildRunnerProvider,
    Compliance,
    LambdaAccess,
)


class ComplianceStack(Stack):
    def __init__(self, scope, construct_id, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # Create a CodeBuild provider
        codebuild_provider = CodeBuildRunnerProvider(
            self, "CodeBuildProvider",
            labels=["codebuild", "linux", "x64"]
        )

        # Create the GitHub runners infrastructure
        runners = GitHubRunners(
            self, "GitHubRunners",
            providers=[codebuild_provider],
            webhook_access=LambdaAccess.api_gateway(
                allowed_ips=LambdaAccess.github_webhook_ips()
            ),
        )

        # Encrypt everything with one key, except logs that get their own key
        key = kms.Key(self, "Key", enable_key_rotation=True)
        logs_key = kms.Key(self, "Logs Key", enable_key_rotation=True)
        Compliance.of(runners).encrypt(key=key, logs=logs_key)

        # Limit Lambda concurrency, sized for up to 50 jobs starting at once
        Compliance.of(runners).limit_lambda_concurrency(max_job_starts=50)

        # Log webhook requests to API Gateway
        Compliance.of(runners).log_api_requests()


app = cdk.App()
ComplianceStack(app, "compliance-example")
app.synth()
