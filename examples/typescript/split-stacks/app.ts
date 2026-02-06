#!/usr/bin/env node
/**
 * Example: Split stacks - image builder and providers in separate stacks.
 *
 * This example demonstrates how to:
 * 1. Define an image builder in one stack
 * 2. Use that image builder in providers defined in another stack
 *
 * This is useful when you want to split your infrastructure across multiple stacks,
 * for example if one stack gets too large or you want to separate concerns.
 */

import { App, Stack } from 'aws-cdk-lib';
import { Vpc, SubnetType, IVpc } from 'aws-cdk-lib/aws-ec2';
import {
  GitHubRunners,
  Ec2RunnerProvider,
  IRunnerImageBuilder,
  Architecture,
  Os,
} from '@cloudsnorkel/cdk-github-runners';

/**
 * VPC Stack
 *
 * This stack creates a shared VPC that will be used by both the image builder stack
 * and the providers stack.
 *
 * Note: Creating a VPC is not required. Providers can use the default VPC or an existing VPC.
 * We create one here to make this example self-contained and testable.
 */
class VpcStack extends Stack {
  public readonly vpc: IVpc;

  constructor(scope: App, id: string) {
    super(scope, id);

    // Create a VPC with public and private subnets
    this.vpc = new Vpc(this, 'VPC', {
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });
  }
}

/**
 * Image Builder Stack
 *
 * This stack defines the image builder that will be used by providers in another stack.
 */
class ImageBuilderStack extends Stack {
  public readonly imageBuilder: IRunnerImageBuilder;

  constructor(scope: App, id: string, vpc: IVpc) {
    super(scope, id);

    // Create an image builder with default components
    this.imageBuilder = Ec2RunnerProvider.imageBuilder(this, 'ImageBuilder', {
      os: Os.LINUX_UBUNTU,
      architecture: Architecture.X86_64,
      vpc: vpc,
    });

    // These exports are useful when refactoring or replacing the image builder.
    // This helps avoid "deadly embrace" -- https://github.com/aws/aws-cdk/issues/7602
    // Without these exports, refactoring the image builder (e.g., renaming or replacing it)
    // will result in errors about exports that cannot be deleted because they are in use.
    // The exportValue() method gives explicit control over exports, allowing safe refactoring.
    this.exportValue(this.imageBuilder.bindAmi().launchTemplate.launchTemplateId);
    this.exportValue(this.imageBuilder.bindAmi().logGroup?.logGroupName);
  }
}

/**
 * Providers Stack
 *
 * This stack defines the providers that use the image builder from another stack.
 */
class ProvidersStack extends Stack {
  constructor(scope: App, id: string, imageBuilderStack: ImageBuilderStack, vpc: IVpc) {
    super(scope, id);

    // Use the image builder from the other stack
    const imageBuilder = imageBuilderStack.imageBuilder;

    // Create EC2 providers using the shared image builder
    const provider1 = new Ec2RunnerProvider(this, 'Provider1', {
      labels: ['ec2', 'linux', 'x64', 'provider1'],
      vpc: vpc,
      imageBuilder: imageBuilder,
    });

    const provider2 = new Ec2RunnerProvider(this, 'Provider2', {
      labels: ['ec2', 'linux', 'x64', 'provider2'],
      vpc: vpc,
      imageBuilder: imageBuilder,
    });

    // Create the GitHub runners infrastructure
    const runners = new GitHubRunners(this, 'GitHubRunners', {
      providers: [
        provider1,
        provider2,
      ],
    });

    // Get notified when runner image builds fail. Runner images are rebuilt every week by default;
    // failed builds leave you on out-of-date software, which can mean security issues or slower start-ups.
    // For cross-stack setups you need a little more consideration: pass the image builder stack as scope
    // so the topic and notification aspects are created in that stack, where they can find the image builder resources.
    runners.failedImageBuildsTopic(imageBuilderStack);
  }
}

const app = new App();

// Create the VPC stack first
const vpcStack = new VpcStack(app, 'split-stacks-example-vpc');

// Create the image builder stack
const imageBuilderStack = new ImageBuilderStack(app, 'split-stacks-example-image-builder', vpcStack.vpc);
imageBuilderStack.addDependency(vpcStack);

// Create the providers stack that depends on the image builder
const providersStack = new ProvidersStack(app, 'split-stacks-example-providers', imageBuilderStack, vpcStack.vpc);
providersStack.addDependency(vpcStack);
providersStack.addDependency(imageBuilderStack);

app.synth();
