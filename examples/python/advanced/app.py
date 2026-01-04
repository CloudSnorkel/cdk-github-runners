#!/usr/bin/env python3
"""
Advanced example with comprehensive runner configuration.

This example demonstrates:
- Multiple providers (CodeBuild, Fargate, Lambda, EC2)
- Custom runner images for different architectures
- VPC configuration with security groups
- S3 bucket integration
- Monitoring and alerting
- Different retry strategies
- Custom labels and runner groups
"""

import aws_cdk as cdk
from aws_cdk import Stack, aws_ec2 as ec2, aws_s3 as s3, aws_codebuild as codebuild
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners, 
    CodeBuildRunnerProvider, 
    FargateRunnerProvider,
    LambdaRunnerProvider,
    Ec2RunnerProvider,
    RunnerImageComponent,
    Architecture,
    Os,
    LambdaAccess
)


class AdvancedStack(Stack):
    def __init__(self, scope, construct_id, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # Create VPC with public and private subnets
        vpc = ec2.Vpc(self, "VPC", 
            max_azs=3,
            nat_gateways=2,
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

        # Create security groups
        runner_sg = ec2.SecurityGroup(self, "RunnerSecurityGroup", vpc=vpc)
        runner_sg.add_egress_rule(ec2.Peer.any_ipv4(), ec2.Port.all_traffic())

        # Create S3 bucket for artifacts
        artifacts_bucket = s3.Bucket(self, "ArtifactsBucket",
            versioned=True,
            encryption=s3.BucketEncryption.S3_MANAGED,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL
        )

        # Create custom image builders for different architectures
        linux_x64_builder = FargateRunnerProvider.image_builder(
            self, "LinuxX64Builder",
            architecture=Architecture.X86_64,
            os=Os.LINUX_UBUNTU,
            vpc=vpc
        )
        linux_x64_builder.add_component(
            RunnerImageComponent.custom(
                name="Development Tools",
                commands=[
                    "apt-get update",
                    "apt-get install -y git-lfs curl jq python3 python3-pip",
                ]
            )
        )

        linux_arm64_builder = FargateRunnerProvider.image_builder(
            self, "LinuxArm64Builder",
            architecture=Architecture.ARM64,
            os=Os.LINUX_UBUNTU,
            vpc=vpc
        )
        linux_arm64_builder.add_component(
            RunnerImageComponent.custom(
                name="ARM64 Tools",
                commands=[
                    "apt-get update",
                    "apt-get install -y git-lfs curl jq python3 python3-pip",
                ]
            )
        )

        windows_builder = FargateRunnerProvider.image_builder(
            self, "WindowsBuilder",
            architecture=Architecture.X86_64,
            os=Os.WINDOWS,
            vpc=vpc,
            subnet_selection=ec2.SubnetSelection(subnet_type=ec2.SubnetType.PUBLIC),
        )
        windows_builder.add_component(
            RunnerImageComponent.custom(
                name="Windows Tools",
                commands=[
                    "choco install -y git-lfs python3",
                    "refreshenv"
                ]
            )
        )

        # CodeBuild provider for quick builds
        codebuild_provider = CodeBuildRunnerProvider(
            self, "CodeBuildProvider",
            labels=["codebuild", "quick", "linux", "x64"],
            compute_type=codebuild.ComputeType.SMALL,
        )

        # Fargate providers for different architectures
        fargate_x64_provider = FargateRunnerProvider(
            self, "FargateX64Provider",
            labels=["fargate", "docker", "linux", "x64"],
            vpc=vpc,
            security_groups=[runner_sg],
            image_builder=linux_x64_builder,
            cpu=2048,  # 2 vCPU
            memory_limit_mib=4096,  # 4 GB RAM
            retry_options={
                "max_attempts": 5,
                "interval": cdk.Duration.minutes(5),
                "backoff_rate": 2.0
            }
        )

        fargate_arm64_provider = FargateRunnerProvider(
            self, "FargateArm64Provider",
            labels=["fargate", "docker", "linux", "arm64"],
            vpc=vpc,
            security_groups=[runner_sg],
            image_builder=linux_arm64_builder,
            cpu=2048,  # 2 vCPU
            memory_limit_mib=4096,  # 4 GB RAM
            retry_options={
                "max_attempts": 3,
                "interval": cdk.Duration.minutes(10),
                "backoff_rate": 1.5
            }
        )

        fargate_windows_provider = FargateRunnerProvider(
            self, "FargateWindowsProvider",
            labels=["fargate", "windows", "x64"],
            vpc=vpc,
            security_groups=[runner_sg],
            image_builder=windows_builder,
            cpu=2048,  # 2 vCPU
            memory_limit_mib=4096,  # 4 GB RAM
            retry_options={
                "max_attempts": 3,
                "interval": cdk.Duration.minutes(10),
                "backoff_rate": 1.5
            }
        )

        # Lambda provider for short tasks
        lambda_provider = LambdaRunnerProvider(
            self, "LambdaProvider",
            labels=["lambda", "short", "linux"],
            timeout=cdk.Duration.minutes(10),
            memory_size=1024,
            retry_options={
                "max_attempts": 2,
                "interval": cdk.Duration.minutes(1),
                "backoff_rate": 2.0
            }
        )

        # EC2 provider for long-running tasks
        ec2_provider = Ec2RunnerProvider(
            self, "Ec2Provider",
            labels=["ec2", "long-running", "linux", "x64"],
            vpc=vpc,
            security_groups=[runner_sg],
            instance_type=ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.LARGE),
            storage_size=cdk.Size.gibibytes(100),
            retry_options={
                "max_attempts": 3,
                "interval": cdk.Duration.minutes(5),
                "backoff_rate": 1.5
            }
        )

        # Grant permissions to providers
        artifacts_bucket.grant_read_write(codebuild_provider)
        artifacts_bucket.grant_read_write(fargate_x64_provider)
        artifacts_bucket.grant_read_write(fargate_arm64_provider)
        artifacts_bucket.grant_read_write(fargate_windows_provider)
        artifacts_bucket.grant_read_write(ec2_provider)

        # Create the GitHub runners infrastructure
        runners = GitHubRunners(
            self, "GitHubRunners",
            providers=[
                codebuild_provider,
                fargate_x64_provider,
                fargate_arm64_provider,
                fargate_windows_provider,
                lambda_provider,
                ec2_provider
            ],
            # Configure access
            webhook_access=LambdaAccess.lambda_url(),
            status_access=LambdaAccess.no_access(),  # Disable status endpoint for security
            setup_access=LambdaAccess.lambda_url(),
            # Configure retry options
            retry_options={
                "max_attempts": 10,
                "interval": 300,  # 5 minutes
                "backoff_rate": 1.5
            }
        )

        # Create CloudWatch alarms for monitoring
        runners.metric_failed().create_alarm(
            self, "FailedRunnersAlarm",
            threshold=5,
            evaluation_periods=2,
            alarm_description="Alert when runner starts fail"
        )

        # Output important information
        cdk.CfnOutput(self, "ArtifactsBucketName", 
            value=artifacts_bucket.bucket_name,
            description="S3 bucket for storing build artifacts"
        )

        cdk.CfnOutput(self, "VPCId", 
            value=vpc.vpc_id,
            description="VPC ID for the runners"
        )


app = cdk.App()
AdvancedStack(app, "AdvancedExample")
app.synth()
