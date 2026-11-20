#!/usr/bin/env python3
"""
Example: Compliance settings.

This example demonstrates how to encrypt everything with your own KMS keys,
limit Lambda concurrency, and log API requests.
"""

import aws_cdk as cdk
from aws_cdk import Stack, aws_apigateway as apigateway, aws_kms as kms, aws_logs as logs
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners,
    CodeBuildRunnerProvider,
    Compliance,
    LambdaAccess,
)


class ComplianceStack(Stack):
    def __init__(self, scope, construct_id, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # Encrypt everything with one key, except logs that get their own key
        key = kms.Key(self, "Key", enable_key_rotation=True)
        logs_key = kms.Key(self, "Logs Key", enable_key_rotation=True)
        Compliance.of(self).encrypt(key=key, logs=logs_key)

        # Limit Lambda concurrency, sized for up to 50 jobs starting at once
        Compliance.of(self).limit_lambda_concurrency(max_job_starts=50)

        # Create a CodeBuild provider
        codebuild_provider = CodeBuildRunnerProvider(
            self, "CodeBuildProvider",
            labels=["codebuild", "linux", "x64"]
        )

        # Create the GitHub runners infrastructure
        GitHubRunners(
            self, "GitHubRunners",
            providers=[codebuild_provider],
            webhook_access=LambdaAccess.api_gateway(
                allowed_ips=LambdaAccess.github_webhook_ips(),
                # Log webhook requests and errors
                access_log_group=logs.LogGroup(self, "Webhook Access Logs", encryption_key=logs_key),
                logging_level=apigateway.MethodLoggingLevel.ERROR,
            ),
        )


app = cdk.App()
ComplianceStack(app, "compliance-example")
app.synth()
