#!/usr/bin/env python3
"""
Example: Network access with security groups.

This example demonstrates how to configure network access for runners
using VPCs and security groups, allowing them to connect to resources
like databases or other services in your VPC.
"""

import aws_cdk as cdk
from aws_cdk import Stack, aws_ec2 as ec2
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners,
    FargateRunnerProvider,
)


class NetworkAccessStack(Stack):
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

        # Create a dummy security group for a database (or other resource)
        # In a real scenario, you would import an existing security group:
        # db_sg = ec2.SecurityGroup.from_security_group_id(self, "DatabaseSecurityGroup", "sg-1234567890abcdef0")
        db_sg = ec2.SecurityGroup(
            self, "DatabaseSecurityGroup",
            vpc=vpc,
            description="Security group for database (example)"
        )

        # Create a Fargate provider in the VPC
        # IMPORTANT: Any job/workflow that runs on these runners will have this network access.
        # The VPC and security group rules determine what network resources all workflows can access.
        fargate_provider = FargateRunnerProvider(
            self, "FargateProvider",
            labels=["fargate", "linux", "x64"],
            vpc=vpc
        )

        # Allow the provider to connect to the database
        # This will allow ALL workflows running on these runners to access the database
        # Only grant the minimum network access necessary for your use case
        db_sg.connections.allow_from(
            fargate_provider.connections,
            ec2.Port.tcp(3306),
            "Allow runners to connect to MySQL database"
        )

        # Create the GitHub runners infrastructure
        GitHubRunners(
            self, "GitHubRunners",
            providers=[fargate_provider]
        )


app = cdk.App()
NetworkAccessStack(app, "network-access-example")
app.synth()
