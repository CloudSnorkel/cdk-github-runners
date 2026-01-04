#!/usr/bin/env node
/**
 * EC2 Windows provider example demonstrating EC2 runner configuration for Windows.
 *
 * This example demonstrates:
 * - EC2 provider with Windows runners
 * - Custom Windows image builder with additional tools
 * - VPC and security group configuration
 */

import { App, Stack } from 'aws-cdk-lib';
import { Vpc, SubnetType, SecurityGroup, Peer, Port } from 'aws-cdk-lib/aws-ec2';
import {
  GitHubRunners,
  Ec2RunnerProvider,
  RunnerImageComponent,
  Os,
} from '@cloudsnorkel/cdk-github-runners';

class Ec2WindowsProviderStack extends Stack {
  constructor(scope: App, id: string) {
    super(scope, id);

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

    // Create security group for runners
    const runnerSg = new SecurityGroup(this, 'RunnerSecurityGroup', { vpc });
    runnerSg.addEgressRule(Peer.anyIpv4(), Port.allTraffic());

    // Create a Windows image builder for EC2
    const ec2WindowsImageBuilder = Ec2RunnerProvider.imageBuilder(this, 'EC2WindowsImageBuilder', {
      os: Os.WINDOWS,
      vpc: vpc,
    });

    // Add custom components to the Windows image
    ec2WindowsImageBuilder.addComponent(
      RunnerImageComponent.custom({
        name: 'Windows Tools',
        commands: [
          'choco install -y git-lfs python3',
          'refreshenv',
        ],
      }),
    );

    // EC2 provider with Windows
    const ec2WindowsProvider = new Ec2RunnerProvider(this, 'EC2WindowsProvider', {
      labels: ['ec2', 'windows', 'x64'],
      vpc: vpc,
      securityGroups: [runnerSg],
      imageBuilder: ec2WindowsImageBuilder,
    });

    // Create the GitHub runners infrastructure
    new GitHubRunners(this, 'GitHubRunners', {
      providers: [
        ec2WindowsProvider,
      ],
    });
  }
}

const app = new App();
new Ec2WindowsProviderStack(app, 'Ec2WindowsProviderExample');
app.synth();
