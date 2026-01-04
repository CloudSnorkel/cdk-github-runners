#!/usr/bin/env node
/**
 * Composite provider example demonstrating fallback and weighted distribution strategies.
 *
 * This example demonstrates:
 * - Fallback strategy: Try spot instances first, fall back to on-demand if spot is unavailable
 * - Weighted distribution: Distribute load across multiple availability zones
 * - Composite providers allow combining multiple providers with different strategies
 */

import { App, Stack } from 'aws-cdk-lib';
import { Vpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import {
  GitHubRunners,
  Ec2RunnerProvider,
  FargateRunnerProvider,
  CompositeProvider,
} from '@cloudsnorkel/cdk-github-runners';

class CompositeProviderStack extends Stack {
  constructor(scope: App, id: string) {
    super(scope, id);

    // Create a VPC for the providers
    const vpc = new Vpc(this, 'VPC', {
      availabilityZones: ['us-east-1a', 'us-east-1b', 'us-east-1c'],
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

    // ============================================
    // Example 1: Fallback Strategy
    // ============================================
    // Try spot instances first, fall back to on-demand if spot is unavailable
    // This helps reduce costs while maintaining reliability

    const ec2Fallback = CompositeProvider.fallback(this, 'EC2 Fallback', [
      // Try spot instances first (cheaper, but may be interrupted)
      new Ec2RunnerProvider(this, 'EC2 Spot', {
        labels: ['ec2', 'linux', 'x64', 'spot'],
        vpc: vpc,
        spot: true,
      }),
      // Fall back to on-demand if spot is unavailable
      new Ec2RunnerProvider(this, 'EC2 On-Demand', {
        labels: ['ec2', 'linux', 'x64', 'spot'], // Same labels as spot provider
        vpc: vpc,
        spot: false,
      }),
    ]);

    // ============================================
    // Example 2: Weighted Distribution Strategy
    // ============================================
    // Distribute load across multiple availability zones
    // 60% to AZ-1, 30% to AZ-2, 10% to AZ-3

    const distributedProvider = CompositeProvider.distribute(this, 'Fargate Distribution', [
      {
        weight: 6, // 6/(6+3+1) = 60%
        provider: new FargateRunnerProvider(this, 'Fargate AZ-1', {
          labels: ['fargate', 'linux', 'x64'],
          vpc: vpc,
          subnetSelection: {
            availabilityZones: [vpc.availabilityZones[0]],
            subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          },
          cpu: 1024,  // 1 vCPU
          memoryLimitMiB: 2048,  // 2 GB RAM
        }),
      },
      {
        weight: 3, // 3/(6+3+1) = 30%
        provider: new FargateRunnerProvider(this, 'Fargate AZ-2', {
          labels: ['fargate', 'linux', 'x64'], // Same labels as AZ-1
          vpc: vpc,
          subnetSelection: {
            availabilityZones: [vpc.availabilityZones[1]],
            subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          },
          cpu: 1024,
          memoryLimitMiB: 2048,
        }),
      },
      {
        weight: 1, // 1/(6+3+1) = 10%
        provider: new FargateRunnerProvider(this, 'Fargate AZ-3', {
          labels: ['fargate', 'linux', 'x64'], // Same labels as AZ-1 and AZ-2
          vpc: vpc,
          subnetSelection: {
            availabilityZones: [vpc.availabilityZones[2]],
            subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          },
          cpu: 1024,
          memoryLimitMiB: 2048,
        }),
      },
    ]);

    // Create the GitHub runners infrastructure with both composite providers
    new GitHubRunners(this, 'GitHubRunners', {
      providers: [
        ec2Fallback,        // Fallback strategy for EC2
        distributedProvider, // Weighted distribution for Fargate
      ],
    });
  }
}

const app = new App();
new CompositeProviderStack(app, 'CompositeProviderExample');
app.synth();
