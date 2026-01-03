# ECS Provider Example

This example demonstrates how to configure ECS providers for GitHub self-hosted runners.

## Features Demonstrated

- **ECS on EC2**: Use ECS to run runners on EC2 instances with full control over infrastructure
- **Spot instances**: Configure spot instances for cost optimization
- **Custom images**: Build custom runner images with additional tools
- **VPC configuration**: Configure VPC, subnets, and security groups
- **Storage configuration**: Configure EBS volumes with GP3 for better performance
- **Autoscaling**: Configure min/max instances for cost optimization

## Why Use ECS?

ECS is useful when you want more control over the infrastructure running the GitHub Actions Docker containers. You can:
- Control the autoscaling group to scale down to zero during off-hours
- Use spot instances for cost savings
- Keep instances running for faster startup times
- Share instances across multiple runners

## Configuration

### Spot Instances

Spot instances can significantly reduce costs (up to 90% savings), but they can be interrupted. Use spot instances for:
- Non-critical workloads
- Development and testing
- Workloads that can tolerate interruptions

### On-Demand Instances

On-demand instances are more reliable but cost more. Use on-demand instances for:
- Production workloads
- Critical builds
- Workloads that cannot tolerate interruptions

### Storage Configuration

This example uses GP3 volumes with:
- 40 GB storage
- 1500 IOPS
- 150 MB/s throughput

You can adjust these values based on your workload requirements.

## Usage

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Deploy the stack:
   ```bash
   cdk deploy
   ```

3. Follow the setup instructions in the main README to configure GitHub integration.

4. Use the runners in your GitHub Actions workflows:

```yaml
name: Build on ECS Spot
on: push
jobs:
  build:
    runs-on: [self-hosted, ecs, linux, x64, spot]
    steps:
      - uses: actions/checkout@v3
      - run: echo "Running on ECS spot instance"

name: Build on ECS On-Demand
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: [self-hosted, ecs, linux, x64, on-demand]
    steps:
      - uses: actions/checkout@v3
      - run: echo "Running on ECS on-demand instance"
```

## Customization

You can customize the ECS provider by:
- Adjusting `minInstances` and `maxInstances` for autoscaling
- Configuring `instanceType` for different instance sizes
- Adding custom components to the image builder
- Configuring placement strategies and constraints
- Using existing ECS clusters and capacity providers

## Cleanup

To remove the stack:
```bash
cdk destroy
```
