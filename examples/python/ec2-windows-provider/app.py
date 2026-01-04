#!/usr/bin/env python3
"""
EC2 Windows provider example demonstrating EC2 runner configuration for Windows.

This example demonstrates:
- EC2 provider with Windows runners
- Custom Windows image builder with additional tools
- VPC and security group configuration
"""

import aws_cdk as cdk
from aws_cdk import Stack
from aws_cdk import aws_ec2 as ec2
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners,
    Ec2RunnerProvider,
    RunnerImageComponent,
    Os,
)


class Ec2WindowsProviderStack(Stack):
    def __init__(self, scope, construct_id, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

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

        # Create security group for runners
        runner_sg = ec2.SecurityGroup(self, "RunnerSecurityGroup", vpc=vpc)
        runner_sg.add_egress_rule(ec2.Peer.any_ipv4(), ec2.Port.all_traffic())

        # Create a Windows image builder for EC2
        ec2_windows_image_builder = Ec2RunnerProvider.image_builder(
            self, "EC2WindowsImageBuilder",
            os=Os.WINDOWS,
            vpc=vpc,
        )

        # Add custom components to the Windows image
        ec2_windows_image_builder.add_component(
            RunnerImageComponent.custom(
                name="Windows Tools",
                commands=[
                    "choco install -y git-lfs python3",
                    "refreshenv",
                ]
            )
        )

        # EC2 provider with Windows
        ec2_windows_provider = Ec2RunnerProvider(
            self, "EC2WindowsProvider",
            labels=["ec2", "windows", "x64"],
            vpc=vpc,
            security_groups=[runner_sg],
            image_builder=ec2_windows_image_builder,
        )

        # Create the GitHub runners infrastructure
        GitHubRunners(
            self, "GitHubRunners",
            providers=[
                ec2_windows_provider,
            ],
        )


app = cdk.App()
Ec2WindowsProviderStack(app, "Ec2WindowsProviderExample")
app.synth()
