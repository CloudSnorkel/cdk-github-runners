#!/usr/bin/env node
/**
 * Example: Add software to runners.
 *
 * This example demonstrates how to add custom software to runner images
 * using custom image components.
 */

import { App, Stack } from 'aws-cdk-lib';
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
