# Spot Instances Example

This example demonstrates how to use spot instances to reduce runner costs across different provider types (EC2, Fargate, and ECS).

## What This Example Shows

- How to enable spot instances for EC2 providers
- How to enable Fargate Spot for Fargate providers
- How to enable spot instances for ECS providers
- How to optionally set a maximum price for EC2 and ECS spot instances
- Cost savings considerations

## Important Notes

- **Spot instances can be interrupted**: AWS may reclaim spot instances with a 2-minute warning
- **Best for non-critical workloads**: Use spot instances for jobs that can tolerate interruptions
- **Cost savings**:
  - EC2/ECS spot instances: up to 90% savings compared to on-demand pricing
  - Fargate Spot: up to 70% savings compared to Fargate on-demand
- **Availability**: Spot capacity varies by instance type and region

## Usage

After deploying, use the `spot` label with the appropriate provider label in your workflows:

```yaml
name: Build
on: [push]
jobs:
  build-ec2:
    runs-on: [self-hosted, ec2, spot]
    steps:
      - uses: actions/checkout@v5
      - name: Build
        run: npm run build
  
  build-fargate:
    runs-on: [self-hosted, fargate, spot]
    steps:
      - uses: actions/checkout@v5
      - name: Build
        run: npm run build
  
  build-ecs:
    runs-on: [self-hosted, ecs, spot]
    steps:
      - uses: actions/checkout@v5
      - name: Build
        run: npm run build
```

## Setup

1. Deploy the stack: `cdk deploy`
2. Follow the setup instructions in the main [README.md](../../README.md) to configure GitHub integration
3. Use the appropriate provider label (`ec2`, `fargate`, or `ecs`) along with the `spot` label in your workflows
