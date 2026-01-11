# Compute Options Example

This example demonstrates how to configure CPU, memory, and instance types for different provider types to match your workload requirements.

**Note**: This example creates a VPC for self-containment and testing purposes. Creating a VPC is not required—providers can use the default VPC or an existing VPC.

## What This Example Shows

- How to configure CPU and memory for Fargate providers
- How to configure compute types for CodeBuild providers
- How to configure memory (which determines CPU) for Lambda providers
- How to configure instance types for EC2 providers
- How to configure instance types and task CPU/memory for ECS providers

## Provider-Specific Options

### Fargate
- **CPU**: 256 (.25 vCPU), 512 (.5 vCPU), 1024 (1 vCPU), 2048 (2 vCPU), 4096 (4 vCPU)
- **Memory**: Must match valid combinations with CPU (e.g., 2 vCPU supports 4-16 GB)
- CPU and memory must be valid Fargate combinations

### CodeBuild
- **Compute Types**: 
  - `SMALL`: 2 vCPU, 3 GB RAM
  - `MEDIUM`: 4 vCPU, 7 GB RAM
  - `LARGE`: 8 vCPU, 15 GB RAM
  - `X2_LARGE`: 72 vCPU, 145 GB RAM

### Lambda
- **Memory**: 128 MB to 10 GB (determines CPU proportionally)
- **Ephemeral Storage**: Up to 10 GB for /tmp directory
- More memory = more CPU power automatically

### EC2
- **Instance Types**: Any EC2 instance type (e.g., `m6i.large`, `c6i.xlarge`)
- Choose based on CPU, memory, network, and storage needs

### ECS
- **Instance Type**: For cluster instances (e.g., `m6i.large`)
- **Task CPU**: 1024 units = 1 vCPU (fractions supported)
- **Task Memory**: In MiB (e.g., 2048 = 2 GB)

## Usage

After deploying, use the appropriate provider label in your workflows based on your compute needs:

```yaml
name: Build
on: [push]
jobs:
  build-small:
    runs-on: [self-hosted, lambda]
    steps:
      - uses: actions/checkout@v5
      - name: Build
        run: npm run build
  
  build-large:
    runs-on: [self-hosted, codebuild]
    steps:
      - uses: actions/checkout@v5
      - name: Build
        run: npm run build
```

## Setup

1. Deploy the stack: `cdk deploy`
2. Follow the setup instructions in the main [README.md](../../README.md) to configure GitHub integration
3. Use the appropriate provider label in your workflows based on your compute requirements
