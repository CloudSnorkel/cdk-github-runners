#!/usr/bin/env node
/**
 * Example: Custom storage options for EC2 runners.
 *
 * This example demonstrates how to configure custom EBS storage options
 * for EC2 runners, including volume type, IOPS, and throughput.
 */

import { App, Stack, Size } from 'aws-cdk-lib';
import { Vpc, SubnetType, EbsDeviceVolumeType } from 'aws-cdk-lib/aws-ec2';
import {
  GitHubRunners,
  Ec2RunnerProvider,
} from '@cloudsnorkel/cdk-github-runners';

class StorageOptionsStack extends Stack {
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

    // Create EC2 provider with custom storage options
    // GP3 volumes offer better price/performance than GP2
    const ec2Provider = new Ec2RunnerProvider(this, 'Ec2Provider', {
      labels: ['ec2', 'linux', 'x64'],
      vpc: vpc,
      storageSize: Size.gibibytes(100), // 100 GB storage
      storageOptions: {
        volumeType: EbsDeviceVolumeType.GP3, // Use GP3 for better performance
        iops: 3000, // 3000 IOPS (GP3 supports 3000-16000 IOPS)
        throughput: 125, // 125 MiB/s throughput (GP3 supports 125-1000 MiB/s)
      },
    });

    // Create the GitHub runners infrastructure
    new GitHubRunners(this, 'GitHubRunners', {
      providers: [ec2Provider],
    });
  }
}

const app = new App();
new StorageOptionsStack(app, 'storage-options-example');
app.synth();
