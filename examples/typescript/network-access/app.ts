#!/usr/bin/env node
/**
 * Example: Network access with security groups.
 *
 * This example demonstrates how to configure network access for runners
 * using VPCs and security groups, allowing them to connect to resources
 * like databases or other services in your VPC.
 */

import { App, Stack } from 'aws-cdk-lib';
import { Vpc, SubnetType, SecurityGroup, Port } from 'aws-cdk-lib/aws-ec2';
import {
  GitHubRunners,
  FargateRunnerProvider,
} from '@cloudsnorkel/cdk-github-runners';

class NetworkAccessStack extends Stack {
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

    // Create a dummy security group for a database (or other resource)
    // In a real scenario, you would import an existing security group:
    // const dbSg = SecurityGroup.fromSecurityGroupId(this, 'DatabaseSecurityGroup', 'sg-1234567890abcdef0');
    const dbSg = new SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc,
      description: 'Security group for database (example)',
    });

    // Create a Fargate provider in the VPC
    // IMPORTANT: Any job/workflow that runs on these runners will have this network access.
    // The VPC and security group rules determine what network resources all workflows can access.
    const fargateProvider = new FargateRunnerProvider(this, 'FargateProvider', {
      labels: ['fargate', 'linux', 'x64'],
      vpc: vpc,
    });

    // Allow the provider to connect to the database
    // This will allow ALL workflows running on these runners to access the database
    // Only grant the minimum network access necessary for your use case
    dbSg.connections.allowFrom(
      fargateProvider.connections,
      Port.tcp(3306),
      'Allow runners to connect to MySQL database'
    );

    // Create the GitHub runners infrastructure
    new GitHubRunners(this, 'GitHubRunners', {
      providers: [fargateProvider],
    });
  }
}

const app = new App();
new NetworkAccessStack(app, 'network-access-example');
app.synth();
