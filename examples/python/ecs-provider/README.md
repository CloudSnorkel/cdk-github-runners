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
      - uses: actions/checkout@v5
      - run: echo "Running on ECS spot instance"

name: Build on ECS On-Demand
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: [self-hosted, ecs, linux, x64, on-demand]
    steps:
      - uses: actions/checkout@v5
      - run: echo "Running on ECS on-demand instance"
```

## Connecting to External Resources

You can allow runners to connect to external resources (like databases, SSH servers, or other services) by using security groups. The example code includes commented-out examples showing how to:

1. Import an existing security group:
   ```python
   bastion_sg = ec2.SecurityGroup.from_security_group_id(self, "BastionSecurityGroup", "sg-1234567890abcdef0")
   ```

2. Allow the provider to connect to it:
   ```python
   bastion_sg.connections.allow_from(ecs_spot_provider.connections, ec2.Port.tcp(22), "Allow SSH from ECS runners")
   ```

This allows the runners to connect to resources protected by that security group on the specified port (e.g., port 22 for SSH, port 5432 for PostgreSQL).

## Customization

You can customize the ECS provider by:
- Adjusting `minInstances` and `maxInstances` for autoscaling
- Configuring `instanceType` for different instance sizes
- Adding custom components to the image builder
- Configuring placement strategies and constraints
- Using existing ECS clusters and capacity providers
- Allowing connections to external resources via security groups

## Cleanup

To remove the stack:
```bash
cdk destroy
```
