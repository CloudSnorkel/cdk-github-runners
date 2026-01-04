#!/usr/bin/env python3
"""
ECS provider example demonstrating ECS on EC2 runner configuration.

This example demonstrates:
- ECS provider with custom cluster configuration
- Spot instances for cost optimization
- Custom image builder with additional tools
- VPC and security group configuration
- Storage configuration with GP3 volumes
- Autoscaling configuration
"""

import aws_cdk as cdk
from aws_cdk import Stack, Size
from aws_cdk import aws_ec2 as ec2
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners,
    EcsRunnerProvider,
    RunnerImageComponent,
    Architecture,
    Os,
)


class EcsProviderStack(Stack):
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

        # Example: Allow runners to connect to external resources
        # Import an existing security group (e.g., for a database or SSH server)
        # external_sg = ec2.SecurityGroup.from_security_group_id(self, "ExternalSecurityGroup", "sg-1234567890abcdef0")
        #
        # Allow the ECS provider to connect to the external security group on port 22 (SSH)
        # This will be configured after the provider is created (see below)

        # Create a custom image builder with additional tools
        image_builder = EcsRunnerProvider.image_builder(
            self, "ImageBuilder",
            architecture=Architecture.X86_64,
            os=Os.LINUX_UBUNTU,
        )

        # Add custom components to the image
        # Note: Docker is already included by default in ECS providers
        image_builder.add_component(
            RunnerImageComponent.custom(
                name="Development Tools",
                commands=[
                    "apt-get update",
                    "apt-get install -y git-lfs curl jq build-essential python3 python3-pip",
                ]
            )
        )

        # ECS provider with spot instances for cost optimization
        ecs_spot_provider = EcsRunnerProvider(
            self, "EcsSpotProvider",
            labels=["ecs", "linux", "x64", "spot"],
            vpc=vpc,
            security_groups=[runner_sg],
            image_builder=image_builder,
            spot=True,  # Use spot instances for cost savings
            max_instances=5,
            min_instances=0,  # Scale down to zero when not in use
            storage_size=Size.gibibytes(40),
            storage_options={
                "volume_type": ec2.EbsDeviceVolumeType.GP3,
                "iops": 1500,
                "throughput": 150,
            },
        )

        # ECS provider with on-demand instances for reliability
        ecs_on_demand_provider = EcsRunnerProvider(
            self, "EcsOnDemandProvider",
            labels=["ecs", "linux", "x64", "on-demand"],
            vpc=vpc,
            security_groups=[runner_sg],
            image_builder=image_builder,
            spot=False,  # Use on-demand instances for critical workloads
            max_instances=3,
            min_instances=0,
            storage_size=Size.gibibytes(40),
        )

        # Create the GitHub runners infrastructure
        GitHubRunners(
            self, "GitHubRunners",
            providers=[
                ecs_spot_provider,
                ecs_on_demand_provider,
            ],
        )

        # Example: Allow providers to connect to external resources
        # Uncomment and modify the following to allow runners to connect to an external security group:
        #
        # # Import an existing security group (e.g., for SSH access to a bastion host)
        # bastion_sg = ec2.SecurityGroup.from_security_group_id(self, "BastionSecurityGroup", "sg-1234567890abcdef0")
        #
        # # Allow the ECS provider to connect to the bastion on port 22 (SSH)
        # bastion_sg.connections.allow_from(ecs_spot_provider.connections, ec2.Port.tcp(22), "Allow SSH from ECS runners")
        # bastion_sg.connections.allow_from(ecs_on_demand_provider.connections, ec2.Port.tcp(22), "Allow SSH from ECS runners")
        #
        # # You can also allow connections to other ports, e.g., database on port 5432:
        # # db_sg = ec2.SecurityGroup.from_security_group_id(self, "DatabaseSecurityGroup", "sg-abcdef1234567890")
        # # db_sg.connections.allow_from(ecs_spot_provider.connections, ec2.Port.tcp(5432), "Allow PostgreSQL from ECS runners")


app = cdk.App()
EcsProviderStack(app, "EcsProviderExample")
app.synth()
