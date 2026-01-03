#!/usr/bin/env python3
"""
ECS Windows provider example demonstrating ECS on EC2 runner configuration for Windows.

This example demonstrates:
- ECS provider with Windows runners
- Custom Windows image builder with additional tools
- VPC and security group configuration
- Autoscaling configuration
"""

import aws_cdk as cdk
from aws_cdk import Stack
from aws_cdk import aws_ec2 as ec2
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners,
    EcsRunnerProvider,
    RunnerImageComponent,
    Os,
)


class EcsWindowsProviderStack(Stack):
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

        # Create a Windows image builder for ECS
        windows_image_builder = EcsRunnerProvider.image_builder(
            self, "WindowsImageBuilder",
            os=Os.WINDOWS,
            vpc=vpc,
            subnet_selection=ec2.SubnetSelection(subnet_type=ec2.SubnetType.PUBLIC),
        )

        # Add custom components to the Windows image
        windows_image_builder.add_component(
            RunnerImageComponent.custom(
                name="Windows Tools",
                commands=[
                    "choco install -y git docker-desktop",
                    "refreshenv",
                ]
            )
        )

        # ECS provider with Windows
        ecs_windows_provider = EcsRunnerProvider(
            self, "EcsWindowsProvider",
            labels=["ecs", "windows", "x64"],
            vpc=vpc,
            security_groups=[runner_sg],
            image_builder=windows_image_builder,
            max_instances=3,
            min_instances=0,
        )

        # Create the GitHub runners infrastructure
        GitHubRunners(
            self, "GitHubRunners",
            providers=[
                ecs_windows_provider,
            ],
        )


app = cdk.App()
EcsWindowsProviderStack(app, "EcsWindowsProviderExample")
app.synth()
