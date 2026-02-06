#!/usr/bin/env python3
"""
Example: Split stacks - image builder and providers in separate stacks.

This example demonstrates how to:
1. Define an image builder in one stack
2. Use that image builder in providers defined in another stack

This is useful when you want to split your infrastructure across multiple stacks,
for example if one stack gets too large or you want to separate concerns.
"""

import aws_cdk as cdk
from aws_cdk import Stack
from aws_cdk import aws_ec2 as ec2
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners,
    Ec2RunnerProvider,
    Architecture,
    Os,
)


class VpcStack(Stack):
    """
    VPC Stack

    This stack creates a shared VPC that will be used by both the image builder stack
    and the providers stack.

    Note: Creating a VPC is not required. Providers can use the default VPC or an existing VPC.
    We create one here to make this example self-contained and testable.
    """

    def __init__(self, scope, construct_id, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # Create a VPC with public and private subnets
        self.vpc = ec2.Vpc(
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


class ImageBuilderStack(Stack):
    """
    Image Builder Stack

    This stack defines the image builder that will be used by providers in another stack.
    """

    def __init__(self, scope, construct_id, vpc, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # Create an image builder with default components
        self.image_builder = Ec2RunnerProvider.image_builder(
            self, "ImageBuilder",
            os=Os.LINUX_UBUNTU,
            architecture=Architecture.X86_64,
            vpc=vpc
        )

        # These exports are useful when refactoring or replacing the image builder.
        # This helps avoid "deadly embrace" -- https://github.com/aws/aws-cdk/issues/7602
        # Without these exports, refactoring the image builder (e.g., renaming or replacing it)
        # will result in errors about exports that cannot be deleted because they are in use.
        # The exportValue() method gives explicit control over exports, allowing safe refactoring.
        self.export_value(self.image_builder.bind_ami().launch_template.launch_template_id)
        log_group = self.image_builder.bind_ami().log_group
        if log_group:
            self.export_value(log_group.log_group_name)

class ProvidersStack(Stack):
    """
    Providers Stack

    This stack defines the providers that use the image builder from another stack.
    """

    def __init__(self, scope, construct_id, image_builder_stack, vpc, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # Use the image builder from the other stack
        image_builder = image_builder_stack.image_builder

        # Create EC2 providers using the shared image builder
        provider1 = Ec2RunnerProvider(
            self, "Provider1",
            labels=["ec2", "linux", "x64", "provider1"],
            vpc=vpc,
            image_builder=image_builder
        )

        provider2 = Ec2RunnerProvider(
            self, "Provider2",
            labels=["ec2", "linux", "x64", "provider2"],
            vpc=vpc,
            image_builder=image_builder
        )

        # Create the GitHub runners infrastructure
        runners = GitHubRunners(
            self, "GitHubRunners",
            providers=[
                provider1,
                provider2
            ]
        )

        # Get notified when runner image builds fail. Runner images are rebuilt every week by default;
        # failed builds leave you on out-of-date software, which can mean security issues or slower start-ups.
        # For cross-stack setups you need a little more consideration: pass the image builder stack as scope
        # so the topic and notification aspects are created in that stack, where they can find the image builder resources.
        runners.failed_image_builds_topic(image_builder_stack)


app = cdk.App()

# Create the VPC stack first
vpc_stack = VpcStack(app, "split-stacks-example-vpc")

# Create the image builder stack
image_builder_stack = ImageBuilderStack(app, "split-stacks-example-image-builder", vpc_stack.vpc)
image_builder_stack.add_dependency(vpc_stack)

# Create the providers stack that depends on the image builder
providers_stack = ProvidersStack(app, "split-stacks-example-providers", image_builder_stack, vpc_stack.vpc)
providers_stack.add_dependency(vpc_stack)
providers_stack.add_dependency(image_builder_stack)

app.synth()
