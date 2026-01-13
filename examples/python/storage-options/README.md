# Storage Options Example

This example demonstrates how to configure custom EBS storage options for EC2 runners, as well as how to increase storage for AMI builders and Docker image builders.

**Note**: This example creates a VPC for self-containment and testing purposes. Creating a VPC is not required—providers can use the default VPC or an existing VPC.

## What This Example Shows

- How to configure storage size for EC2 runners
- How to use GP3 volumes for better price/performance
- How to configure IOPS and throughput for storage volumes
- How to increase storage for AMI builders using `awsImageBuilderOptions.storageSize`
- How to increase storage for Docker image builders by setting the CodeBuild compute type

## Storage Volume Types

- **GP3**: General purpose SSD, configurable IOPS and throughput, best price/performance
- **GP2**: General purpose SSD, baseline performance
- **IO1**: Provisioned IOPS SSD, highest performance for I/O-intensive workloads

## AMI Builder Storage

When building AMIs with large components, you may need to increase the storage size for the AMI builder. This is done using `awsImageBuilderOptions.storageSize`:

```python
ami_builder=Ec2RunnerProvider.image_builder(
    self, "Ami Builder",
    aws_image_builder_options={
        "storage_size": Size.gibibytes(50),  # Increase from default 30GB
    }
)
```

**Important**: The runner storage size must be at least as large as the AMI builder storage size.

## Docker Image Builder Storage

For Docker image builders using CodeBuild, storage is determined by the compute type. Larger compute types provide more disk space:

- **SMALL**: 64 GB disk space
- **MEDIUM**: 128 GB disk space
- **LARGE**: 128 GB disk space
- **X2_LARGE**: 256 GB disk space (Linux) or 824 GB disk space (Windows)

To increase storage for Docker image builds, use a larger compute type:

```python
image_builder=CodeBuildRunnerProvider.image_builder(
    self, "Docker Image Builder",
    code_build_options={
        "compute_type": codebuild.ComputeType.X2_LARGE,  # More disk space for larger images
    }
)
```

## Usage

After deploying, your runners will have the configured storage options. This is useful for workloads that need:
- Large amounts of disk space
- High I/O performance
- Fast data transfer rates
- Building large Docker images or AMIs with many components

## Setup

1. Deploy the stack: `cdk deploy`
2. Follow the setup instructions in the main [README.md](../../README.md) to configure GitHub integration
3. Use the `ec2` or `codebuild` labels in your workflows
