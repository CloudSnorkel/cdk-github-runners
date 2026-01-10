#!/usr/bin/env python3
"""
Example: GitHub Enterprise Server (GHES) configuration.

This example demonstrates how to configure runners for GitHub Enterprise Server
hosted in a VPC, using API Gateway with VPC-only access.

Important: Runners must be in the same VPC as GHES to communicate with it.
If GHES uses a self-signed certificate, you'll need to configure extra_certificates
for both the runner image and the management functions.
"""

import aws_cdk as cdk
from aws_cdk import Stack, aws_ec2 as ec2
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners,
    CodeBuildRunnerProvider,
    LambdaAccess,
    RunnerImageComponent,
)


class GhesStack(Stack):
    def __init__(self, scope, construct_id, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # Note: Creating a VPC is not required. Providers can use the default VPC or an existing VPC.
        # We create one here to make this example self-contained and testable.
        # In a real scenario, you might import an existing VPC where GitHub Enterprise Server is hosted
        vpc = ec2.Vpc(
            self, "VPC",
            max_azs=2,
            subnet_configuration=[
                ec2.SubnetConfiguration(
                    name="Private",
                    subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS,
                    cidr_mask=24
                )
            ]
        )

        # Create a CodeBuild provider in the GHES VPC
        # Runners need to be in the same VPC as GHES to communicate with it
        codebuild_provider = CodeBuildRunnerProvider(
            self, "CodeBuildProvider",
            labels=["codebuild", "linux", "x64"],
            vpc=vpc  # Runners must be in the GHES VPC to communicate with GHES
        )

        # If GitHub Enterprise Server uses a self-signed certificate, you need to:
        # 1. Add the certificate to the runner image
        # 2. Add the certificate to the management functions
        #
        # Example for self-signed certificates:
        # image_builder = CodeBuildRunnerProvider.image_builder(self, "ImageBuilder")
        # image_builder.add_component(
        #     RunnerImageComponent.extra_certificates("path-to-certs/certs.pem", "ghes-ca")
        # )
        # codebuild_provider = CodeBuildRunnerProvider(
        #     self, "CodeBuildProvider",
        #     labels=["codebuild", "linux", "x64"],
        #     vpc=vpc,
        #     image_builder=image_builder
        # )
        #
        # Then add extra_certificates to GitHubRunners:
        # extra_certificates="path-to-certs",  # Directory containing certs.pem

        # Create the GitHub runners infrastructure
        # Configure webhookAccess to use API Gateway accessible only from within the VPC
        # This allows GitHub Enterprise Server (hosted in the VPC) to send webhooks
        GitHubRunners(
            self, "GitHubRunners",
            providers=[codebuild_provider],
            # VPC for management functions (webhook, status, etc.) and runners
            vpc=vpc,
            # Configure webhook access to be accessible only from within the VPC
            # GitHub Enterprise Server in the VPC can send webhooks to this endpoint
            webhook_access=LambdaAccess.api_gateway(
                allowed_vpc=vpc,
                # Optionally, you can also restrict to specific IPs if GHES has a known IP
                # allowed_ips=["10.0.1.100/32"],  # Replace with your GHES IP
            ),
            # If GHES uses a self-signed certificate, uncomment and provide the path:
            # extra_certificates="path-to-certs",  # Directory containing certs.pem file
        )


app = cdk.App()
GhesStack(app, "ghes-example")
app.synth()
