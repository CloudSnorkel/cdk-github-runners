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


        # If GitHub Enterprise Server uses a self-signed certificate, you need to:
        # 1. Add the certificate to the runner image
        # 2. Add the certificate to the management functions
        # You can provide either a single certificate file (.pem or .crt) or a directory containing certificate files
        self_signed_certificate_path = None  # e.g. 'path-to-cert.pem' or 'path-to-certs-directory'

        # Create an image builder with (optionally) the certificates
        image_builder = CodeBuildRunnerProvider.image_builder(self, "ImageBuilder")
        if self_signed_certificate_path:
            from cloudsnorkel.cdk_github_runners import RunnerImageComponent
            image_builder.add_component(
                RunnerImageComponent.extra_certificates(self_signed_certificate_path, "ghes-ca")
            )

        # Create a CodeBuild provider in the GHES VPC
        # Runners need to be in the same VPC as GHES to communicate with it
        codebuild_provider = CodeBuildRunnerProvider(
            self, "CodeBuildProvider",
            labels=["codebuild", "linux", "x64"],
            vpc=vpc,  # Runners must be in the GHES VPC to communicate with GHES
            image_builder=image_builder if self_signed_certificate_path else None
        )

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
            # If GHES uses a self-signed certificate, provide the path to the certificate file or directory
            # Can be a single .pem/.crt file or a directory containing multiple certificate files
            extra_certificates=self_signed_certificate_path,
        )


app = cdk.App()
GhesStack(app, "ghes-example")
app.synth()
