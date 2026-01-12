#!/usr/bin/env python3
"""
Example: ECS with custom ASG scaling rules.

This example demonstrates how to configure custom autoscaling group
scaling policies for ECS providers, allowing you to scale based on
schedule or other metrics.

ECS can help speed up job startup time: ECS caches the runner image
locally on the instance, so runners will provision faster as long as
there is room in the instances for more runners. This is as close as
you can get right now to warm runners.
"""

import aws_cdk as cdk
from aws_cdk import Stack, aws_ec2 as ec2, aws_autoscaling as autoscaling
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners,
    EcsRunnerProvider,
)


class EcsScalingStack(Stack):
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

        # Create ECS provider - it will create its own capacity provider and ASG
        ecs_provider = EcsRunnerProvider(
            self, "EcsProvider",
            labels=["ecs", "linux", "x64"],
            vpc=vpc,
            max_instances=10
        )

        # Access the auto scaling group from the provider's built-in capacity provider
        # Use ecs_provider.capacity_provider.auto_scaling_group to access the ASG
        asg = ecs_provider.capacity_provider.auto_scaling_group

        # Add custom scaling policies to our ASG

        # Example: Scale up during work hours (9 AM - 5 PM UTC, Monday-Friday)
        asg.scale_on_schedule(
            "ScaleUpWorkHours",
            schedule=autoscaling.Schedule.cron(hour="9", minute="0", week_day="MON-FRI"),
            min_capacity=2  # Keep at least 2 instances during work hours
        )

        # Example: Scale down during off hours
        asg.scale_on_schedule(
            "ScaleDownOffHours",
            schedule=autoscaling.Schedule.cron(hour="17", minute="0", week_day="MON-FRI"),
            min_capacity=0  # Scale down to zero after work hours
        )

        # Example: Scale based on CPU utilization
        # asg.scale_on_cpu_utilization(
        #     "ScaleOnCpu",
        #     target_utilization_percent=70
        # )

        # Create the GitHub runners infrastructure
        GitHubRunners(
            self, "GitHubRunners",
            providers=[ecs_provider]
        )


app = cdk.App()
EcsScalingStack(app, "ecs-scaling-example")
app.synth()
