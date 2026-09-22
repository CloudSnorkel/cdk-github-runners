#!/usr/bin/env node
/**
 * Example: Run a script before every job using GitHub Actions runner hooks.
 *
 * GitHub's self-hosted runner can run a script before (or after) every job by
 * setting the ACTIONS_RUNNER_HOOK_JOB_STARTED (or ACTIONS_RUNNER_HOOK_JOB_COMPLETED)
 * environment variable. This is handy for anything that needs to happen once per
 * job, such as logging job metadata, sending notifications, or preparing the
 * workspace.
 *
 * The hook script is added to the runner image as an asset, so it's versioned
 * alongside this stack instead of being echoed into a file at deploy time.
 */

import * as path from 'path';
import { App, Stack } from 'aws-cdk-lib';
import { Vpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import {
  GitHubRunners,
  Ec2RunnerProvider,
  RunnerImageComponent,
} from '@cloudsnorkel/cdk-github-runners';

class JobHooksStack extends Stack {
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

    // Create an image builder so we can add the hook scripts.
    const imageBuilder = Ec2RunnerProvider.imageBuilder(this, 'ImageBuilder', {
      vpc: vpc,
    });

    // Point the runner at local script files. Each helper copies the script into
    // the image, marks it executable, and sets the matching environment variable
    // so the runner runs it before/after every job. The scripts live in real,
    // version-controlled files instead of being echoed into the image.
    // See https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/running-scripts-before-or-after-a-job
    imageBuilder.addComponent(
      RunnerImageComponent.jobStartedHook(path.join(__dirname, 'job-started.sh')),
    );
    imageBuilder.addComponent(
      RunnerImageComponent.jobCompletedHook(path.join(__dirname, 'job-completed.sh')),
    );

    // Create an EC2 provider using the custom image.
    const ec2Provider = new Ec2RunnerProvider(this, 'Ec2Provider', {
      labels: ['ec2', 'linux', 'x64'],
      vpc: vpc,
      imageBuilder: imageBuilder,
    });

    // Create the GitHub runners infrastructure
    new GitHubRunners(this, 'GitHubRunners', {
      providers: [ec2Provider],
    });
  }
}

const app = new App();
new JobHooksStack(app, 'job-hooks-example');
app.synth();
