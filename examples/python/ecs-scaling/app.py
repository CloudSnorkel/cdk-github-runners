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
from aws_cdk import Stack, aws_ec2 as ec2, aws_ecs as ecs, aws_autoscaling as autoscaling, aws_iam as iam
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

        # Create security group for the ASG
        security_group = ec2.SecurityGroup(
            self, "SecurityGroup",
            vpc=vpc,
            description="Security group for ECS cluster instances"
        )

        # Create launch template for the ASG
        # Use ECS-optimized AMI and appropriate instance type
        launch_template = ec2.LaunchTemplate(
            self, "LaunchTemplate",
            machine_image=ecs.EcsOptimizedImage.amazon_linux2(ecs.AmiHardwareType.STANDARD),
            instance_type=ec2.InstanceType.of(ec2.InstanceClass.M6I, ec2.InstanceSize.LARGE),
            require_imdsv2=True,
            security_group=security_group,
            role=iam.Role(
                self, "LaunchTemplateRole",
                assumed_by=iam.ServicePrincipal("ec2.amazonaws.com")
            ),
            user_data=ec2.UserData.for_linux()
        )

        # Create autoscaling group
        # ECS caches the runner image locally on instances, so runners provision faster
        # when there's capacity available. This provides near-warm runner performance.
        auto_scaling_group = autoscaling.AutoScalingGroup(
            self, "AutoScalingGroup",
            vpc=vpc,
            launch_template=launch_template,
            min_capacity=0,
            max_capacity=10
        )

        # Create capacity provider with the ASG
        capacity_provider = ecs.AsgCapacityProvider(
            self, "CapacityProvider",
            auto_scaling_group=auto_scaling_group,
            spot_instance_draining=False
        )

        # Create ECS provider with the custom capacity provider
        ecs_provider = EcsRunnerProvider(
            self, "EcsProvider",
            labels=["ecs", "linux", "x64"],
            vpc=vpc,
            capacity_provider=capacity_provider
        )

        # Add custom scaling policies to our ASG

        # Example: Scale up during work hours (9 AM - 5 PM UTC, Monday-Friday)
        auto_scaling_group.scale_on_schedule(
            "ScaleUpWorkHours",
            schedule=autoscaling.Schedule.cron(hour="9", minute="0", week_day="MON-FRI"),
            min_capacity=2  # Keep at least 2 instances during work hours
        )

        # Example: Scale down during off hours
        auto_scaling_group.scale_on_schedule(
            "ScaleDownOffHours",
            schedule=autoscaling.Schedule.cron(hour="17", minute="0", week_day="MON-FRI"),
            min_capacity=0  # Scale down to zero after work hours
        )

        # Example: Scale based on CPU utilization
        # auto_scaling_group.scale_on_cpu_utilization(
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
