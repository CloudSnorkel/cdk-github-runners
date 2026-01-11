#!/usr/bin/env node
/**
 * Example: Add software to runners.
 *
 * This example demonstrates how to add custom software to runner images
 * using custom image components.
 */

import { App, Stack } from 'aws-cdk-lib';
import { Vpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import {
  GitHubRunners,
  FargateRunnerProvider,
  RunnerImageComponent,
  Architecture,
  Os,
} from '@cloudsnorkel/cdk-github-runners';

class AddSoftwareStack extends Stack {
  constructor(scope: App, id: string) {
    super(scope, id);

    // Note: Creating a VPC is not required. Providers can use the default VPC or an existing VPC.
    // We create one here to make this example self-contained and testable.
    // Create a VPC with public and private subnets
    const vpc = new Vpc(this, 'VPC', {
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

    // Create a custom image builder
    const imageBuilder = FargateRunnerProvider.imageBuilder(this, 'ImageBuilder', {
      architecture: Architecture.X86_64,
      os: Os.LINUX_UBUNTU,
    });

    // Add custom software to the image
    // The installed software will be available for all workflows using this provider,
    // saving setup time since you don't need to install it in each workflow step
    imageBuilder.addComponent(
      RunnerImageComponent.custom({
        name: 'Development Tools',
        commands: [
          'apt-get update',
          'apt-get install -y git-lfs curl jq build-essential python3 python3-pip',
        ],
      }),
    );

    // Create a Fargate provider with the custom image
    const fargateProvider = new FargateRunnerProvider(this, 'FargateProvider', {
      labels: ['fargate', 'linux', 'x64'],
      vpc: vpc,
      imageBuilder: imageBuilder,
    });

    // Create the GitHub runners infrastructure
    new GitHubRunners(this, 'GitHubRunners', {
      providers: [fargateProvider],
    });
  }
}

const app = new App();
new AddSoftwareStack(app, 'add-software-example');
app.synth();
