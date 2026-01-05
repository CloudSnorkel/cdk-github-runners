#!/usr/bin/env node
/**
 * ECS provider example demonstrating ECS on EC2 runner configuration.
 *
 * This example demonstrates:
 * - ECS provider with custom cluster configuration
 * - Spot instances for cost optimization
 * - Custom image builder with additional tools
 * - VPC and security group configuration
 * - Storage configuration with GP3 volumes
 * - Autoscaling configuration
 */

import { App, Stack, Size } from 'aws-cdk-lib';
import { Vpc, SubnetType, SecurityGroup, Peer, Port, EbsDeviceVolumeType } from 'aws-cdk-lib/aws-ec2';
import {
  GitHubRunners,
  EcsRunnerProvider,
  RunnerImageComponent,
  Architecture,
  Os,
} from '@cloudsnorkel/cdk-github-runners';

class EcsProviderStack extends Stack {
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

    // Example: Allow runners to connect to external resources
    // Import an existing security group (e.g., for a database or SSH server)
    // const externalSg = SecurityGroup.fromSecurityGroupId(this, 'ExternalSecurityGroup', 'sg-1234567890abcdef0');
    //
    // Allow the ECS provider to connect to the external security group on port 22 (SSH)
    // This will be configured after the provider is created (see below)

    // Create a custom image builder with additional tools
    const imageBuilder = EcsRunnerProvider.imageBuilder(this, 'ImageBuilder', {
      architecture: Architecture.X86_64,
      os: Os.LINUX_UBUNTU,
    });

    // Add custom components to the image
    // Note: Docker is already included by default in ECS providers
    imageBuilder.addComponent(
      RunnerImageComponent.custom({
        name: 'Development Tools',
        commands: [
          'apt-get update',
          'apt-get install -y git-lfs curl jq build-essential python3 python3-pip',
        ],
      }),
    );

    // ECS provider with spot instances for cost optimization
    const ecsSpotProvider = new EcsRunnerProvider(this, 'EcsSpotProvider', {
      labels: ['ecs', 'linux', 'x64', 'spot'],
      vpc: vpc,
      securityGroups: [runnerSg],
      imageBuilder: imageBuilder,
      spot: true, // Use spot instances for cost savings
      maxInstances: 5,
      minInstances: 0, // Scale down to zero when not in use
      storageSize: Size.gibibytes(40),
      storageOptions: {
        volumeType: EbsDeviceVolumeType.GP3,
        iops: 1500,
        throughput: 150,
      },
    });

    // ECS provider with on-demand instances for reliability
    const ecsOnDemandProvider = new EcsRunnerProvider(this, 'EcsOnDemandProvider', {
      labels: ['ecs', 'linux', 'x64', 'on-demand'],
      vpc: vpc,
      securityGroups: [runnerSg],
      imageBuilder: imageBuilder,
      spot: false, // Use on-demand instances for critical workloads
      maxInstances: 3,
      minInstances: 0,
      storageSize: Size.gibibytes(40),
    });

    // Create the GitHub runners infrastructure
    new GitHubRunners(this, 'GitHubRunners', {
      providers: [
        ecsSpotProvider,
        ecsOnDemandProvider,
      ],
    });

    // Example: Allow providers to connect to external resources
    // Uncomment and modify the following to allow runners to connect to an external security group:
    //
    // // Import an existing security group (e.g., for SSH access to a bastion host)
    // const bastionSg = SecurityGroup.fromSecurityGroupId(this, 'BastionSecurityGroup', 'sg-1234567890abcdef0');
    //
    // // Allow the ECS provider to connect to the bastion on port 22 (SSH)
    // bastionSg.connections.allowFrom(ecsSpotProvider.connections, Port.tcp(22), 'Allow SSH from ECS runners');
    // bastionSg.connections.allowFrom(ecsOnDemandProvider.connections, Port.tcp(22), 'Allow SSH from ECS runners');
    //
    // // You can also allow connections to other ports, e.g., database on port 5432:
    // // const dbSg = SecurityGroup.fromSecurityGroupId(this, 'DatabaseSecurityGroup', 'sg-abcdef1234567890');
    // // dbSg.connections.allowFrom(ecsSpotProvider.connections, Port.tcp(5432), 'Allow PostgreSQL from ECS runners');
  }
}

const app = new App();
new EcsProviderStack(app, 'ecs-provider-example');
app.synth();
