#!/usr/bin/env python3
"""
Composite provider example demonstrating fallback and weighted distribution strategies.

This example demonstrates:
- Fallback strategy: Try spot instances first, fall back to on-demand if spot is unavailable
- Weighted distribution: Distribute load across multiple availability zones
- Composite providers allow combining multiple providers with different strategies
"""

import aws_cdk as cdk
from aws_cdk import Stack, aws_ec2 as ec2
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners,
    Ec2RunnerProvider,
    FargateRunnerProvider,
    CompositeProvider,
)


class CompositeProviderStack(Stack):
    def __init__(self, scope, construct_id, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # Create a VPC for the providers
        vpc = ec2.Vpc(
            self, "VPC",
            max_azs=2,
            subnet_configuration=[
                ec2.SubnetConfiguration(
                    name="Public",
                    subnet_type=ec2.SubnetType.PUBLIC,
                    cidr_mask=24,
                ),
                ec2.SubnetConfiguration(
                    name="Private",
                    subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS,
                    cidr_mask=24,
                )
            ]
        )

        # ============================================
        # Example 1: Fallback Strategy
        # ============================================
        # Try spot instances first, fall back to on-demand if spot is unavailable
        # This helps reduce costs while maintaining reliability
        
        ec2_fallback = CompositeProvider.fallback(self, "EC2 Fallback", [
            # Try spot instances first (cheaper, but may be interrupted)
            Ec2RunnerProvider(
                self, "EC2 Spot",
                labels=["ec2", "linux", "x64", "spot"],
                vpc=vpc,
                spot=True,
            ),
            # Fall back to on-demand if spot is unavailable
            Ec2RunnerProvider(
                self, "EC2 On-Demand",
                labels=["ec2", "linux", "x64", "spot"],  # Same labels as spot provider
                vpc=vpc,
                spot=False,
            ),
        ])

        # ============================================
        # Example 2: Weighted Distribution Strategy
        # ============================================
        # Distribute load across multiple availability zones
        # 60% to AZ-1, 40% to AZ-2
        
        distributed_provider = CompositeProvider.distribute(self, "Fargate Distribution", [
            {
                "weight": 3,  # 3/(3+2) = 60%
                "provider": FargateRunnerProvider(
                    self, "Fargate AZ-1",
                    labels=["fargate", "linux", "x64"],
                    vpc=vpc,
                    subnet_selection=ec2.SubnetSelection(
                        availability_zones=[vpc.availability_zones[0]],
                        subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS,
                    ),
                    cpu=1024,  # 1 vCPU
                    memory_limit_mib=2048,  # 2 GB RAM
                ),
            },
            {
                "weight": 2,  # 2/(3+2) = 40%
                "provider": FargateRunnerProvider(
                    self, "Fargate AZ-2",
                    labels=["fargate", "linux", "x64"],  # Same labels as AZ-1
                    vpc=vpc,
                    subnet_selection=ec2.SubnetSelection(
                        availability_zones=[vpc.availability_zones[1]],
                        subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS,
                    ),
                    cpu=1024,
                    memory_limit_mib=2048,
                ),
            },
        ])

        # Create the GitHub runners infrastructure with both composite providers
        GitHubRunners(
            self, "GitHubRunners",
            providers=[
                ec2_fallback,        # Fallback strategy for EC2
                distributed_provider, # Weighted distribution for Fargate
            ],
        )


app = cdk.App()
CompositeProviderStack(app, "composite-provider-example")
app.synth()
