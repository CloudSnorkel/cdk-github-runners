#!/usr/bin/env python3
"""
Example: Spot instances for cost savings.

This example demonstrates how to use spot instances to reduce costs across
different provider types (EC2, Fargate, and ECS).
Spot instances are cheaper but can be interrupted, so they're best for
non-critical workloads that can tolerate interruptions.
"""

import aws_cdk as cdk
from aws_cdk import Stack, aws_ec2 as ec2
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners,
    Ec2RunnerProvider,
    FargateRunnerProvider,
    EcsRunnerProvider,
)


class SpotInstancesStack(Stack):
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

        # EC2 provider with spot instances
        # Spot instances can save up to 90% compared to on-demand pricing
        ec2_spot_provider = Ec2RunnerProvider(
            self, "Ec2SpotProvider",
            labels=["ec2", "linux", "x64", "spot"],
            vpc=vpc,
            spot=True,  # Enable spot instances
            # Optionally set a maximum price (default is current spot price)
            # spot_max_price="0.10",  # Maximum price per hour in USD
        )

        # Fargate provider with spot capacity
        # Fargate Spot can save up to 70% compared to Fargate on-demand
        fargate_spot_provider = FargateRunnerProvider(
            self, "FargateSpotProvider",
            labels=["fargate", "linux", "x64", "spot"],
            vpc=vpc,
            spot=True,  # Enable Fargate Spot
        )

        # ECS provider with spot instances
        # ECS spot instances can save up to 90% compared to on-demand pricing
        ecs_spot_provider = EcsRunnerProvider(
            self, "EcsSpotProvider",
            labels=["ecs", "linux", "x64", "spot"],
            vpc=vpc,
            spot=True,  # Enable spot instances
            # Optionally set a maximum price (default is current spot price)
            # spot_max_price="0.10",  # Maximum price per hour in USD
        )

        # Create the GitHub runners infrastructure
        GitHubRunners(
            self, "GitHubRunners",
            providers=[
                ec2_spot_provider,
                fargate_spot_provider,
                ecs_spot_provider,
            ]
        )


app = cdk.App()
SpotInstancesStack(app, "spot-instances-example")
app.synth()
