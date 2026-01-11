# Storage Options Example

This example demonstrates how to configure custom EBS storage options for EC2 runners.

**Note**: This example creates a VPC for self-containment and testing purposes. Creating a VPC is not required—providers can use the default VPC or an existing VPC.

## What This Example Shows

- How to configure storage size for EC2 runners
- How to use GP3 volumes for better price/performance
- How to configure IOPS and throughput for storage volumes

## Storage Volume Types

- **GP3**: General purpose SSD, configurable IOPS and throughput, best price/performance
- **GP2**: General purpose SSD, baseline performance
- **IO1**: Provisioned IOPS SSD, highest performance for I/O-intensive workloads

## Usage

After deploying, your EC2 runners will have the configured storage options. This is useful for workloads that need:
- Large amounts of disk space
- High I/O performance
- Fast data transfer rates

## Setup

1. Deploy the stack: `cdk deploy`
2. Follow the setup instructions in the main [README.md](../../README.md) to configure GitHub integration
3. Use the `ec2` label in your workflows
