#!/usr/bin/env python3
"""
Example: Access control configuration.

This example demonstrates how to configure access to the webhook and
setup functions using API Gateway with IP restrictions.
"""

import aws_cdk as cdk
from aws_cdk import Stack
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners,
    CodeBuildRunnerProvider,
    LambdaAccess,
)


class AccessControlStack(Stack):
    def __init__(self, scope, construct_id, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # Create a CodeBuild provider
        codebuild_provider = CodeBuildRunnerProvider(
            self, "CodeBuildProvider",
            labels=["codebuild", "linux", "x64"]
        )

        # Create the GitHub runners infrastructure with custom access control
        GitHubRunners(
            self, "GitHubRunners",
            providers=[codebuild_provider],
            # Webhook access: Use API Gateway with GitHub webhook IPs
            # This is more secure than the default Lambda URL
            webhook_access=LambdaAccess.api_gateway(
                allowed_ips=LambdaAccess.github_webhook_ips()  # Allow GitHub.com webhook IPs
            ),
            # Setup access: Disable after initial setup is complete
            # This prevents unauthorized access to the setup function
            setup_access=LambdaAccess.no_access()
        )


app = cdk.App()
AccessControlStack(app, "access-control-example")
app.synth()
