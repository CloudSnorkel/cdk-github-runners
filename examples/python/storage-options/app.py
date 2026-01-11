#!/usr/bin/env python3
"""
Example: Custom storage options for EC2 runners.

This example demonstrates how to configure custom EBS storage options
for EC2 runners, including volume type, IOPS, and throughput.
"""

import aws_cdk as cdk
from aws_cdk import Stack, aws_ec2 as ec2, Size
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners,
    Ec2RunnerProvider,
    StorageOptions,
)


class StorageOptionsStack(Stack):
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

        # Create EC2 provider with custom storage options
        # GP3 volumes offer better price/performance than GP2
        ec2_provider = Ec2RunnerProvider(
            self, "Ec2Provider",
            labels=["ec2", "linux", "x64"],
            vpc=vpc,
            storage_size=Size.gibibytes(100),  # 100 GB storage
            storage_options=StorageOptions(
                volume_type=ec2.EbsDeviceVolumeType.GP3,  # Use GP3 for better performance
                iops=3000,  # 3000 IOPS (GP3 supports 3000-16000 IOPS)
                throughput=125,  # 125 MiB/s throughput (GP3 supports 125-1000 MiB/s)
            )
        )

        # Create the GitHub runners infrastructure
        GitHubRunners(
            self, "GitHubRunners",
            providers=[ec2_provider]
        )


app = cdk.App()
StorageOptionsStack(app, "storage-options-example")
app.synth()
