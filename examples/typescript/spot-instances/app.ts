#!/usr/bin/env node
/**
 * Example: Spot instances for cost savings.
 *
 * This example demonstrates how to use spot instances to reduce costs across
 * different provider types (EC2, Fargate, and ECS).
 * Spot instances are cheaper but can be interrupted, so they're best for
 * non-critical workloads that can tolerate interruptions.
 */

import { App, Stack } from 'aws-cdk-lib';
import { Vpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import {
  GitHubRunners,
  Ec2RunnerProvider,
  FargateRunnerProvider,
  EcsRunnerProvider,
} from '@cloudsnorkel/cdk-github-runners';

class SpotInstancesStack extends Stack {
  constructor(scope: App, id: string) {
    super(scope, id);

    // Note: Creating a VPC is not required. Providers can use the default VPC or an existing VPC.
    // We create one here to make this example self-contained and testable.
    // Create a VPC with private subnets
    const vpc = new Vpc(this, 'VPC', {
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'Private',
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });

    // EC2 provider with spot instances
    // Spot instances can save up to 90% compared to on-demand pricing
    const ec2SpotProvider = new Ec2RunnerProvider(this, 'Ec2SpotProvider', {
      labels: ['ec2', 'linux', 'x64', 'spot'],
      vpc: vpc,
      spot: true, // Enable spot instances
      // Optionally set a maximum price (default is current spot price)
      // spotMaxPrice: '0.10', // Maximum price per hour in USD
    });

    // Fargate provider with spot capacity
    // Fargate Spot can save up to 70% compared to Fargate on-demand
    const fargateSpotProvider = new FargateRunnerProvider(this, 'FargateSpotProvider', {
      labels: ['fargate', 'linux', 'x64', 'spot'],
      vpc: vpc,
      spot: true, // Enable Fargate Spot
    });

    // ECS provider with spot instances
    // ECS spot instances can save up to 90% compared to on-demand pricing
    const ecsSpotProvider = new EcsRunnerProvider(this, 'EcsSpotProvider', {
      labels: ['ecs', 'linux', 'x64', 'spot'],
      vpc: vpc,
      spot: true, // Enable spot instances
      // Optionally set a maximum price (default is current spot price)
      // spotMaxPrice: '0.10', // Maximum price per hour in USD
    });

    // Create the GitHub runners infrastructure
    new GitHubRunners(this, 'GitHubRunners', {
      providers: [
        ec2SpotProvider,
        fargateSpotProvider,
        ecsSpotProvider,
      ],
    });
  }
}

const app = new App();
new SpotInstancesStack(app, 'spot-instances-example');
app.synth();
