# ECS Scaling Example

This example demonstrates how to configure custom autoscaling group scaling policies for ECS providers.

## What This Example Shows

- How to access the autoscaling group from an ECS provider
- How to add scheduled scaling policies (scale up/down based on time)
- How to configure scaling based on metrics (CPU utilization example)

## Benefits

**Faster job startup time**: ECS caches the runner image locally on the instance, so runners will provision faster as long as there is room in the instances for more runners. This is as close as you can get right now to warm runners. By keeping instances running (even with `minInstances: 0`, you can use scheduled scaling to keep instances warm during work hours), subsequent jobs can start much faster since the image is already cached.

## Usage

After deploying, the ECS cluster will automatically scale based on the configured schedules:
- Scales up to at least 2 instances during work hours (9 AM - 5 PM UTC, weekdays)
- Scales down to 0 instances after work hours

You can customize the schedules and add additional scaling policies based on your needs. Keeping instances running (via `minCapacity` in scaling policies) ensures the runner image stays cached for faster job startup.

## Setup

1. Deploy the stack: `cdk deploy`
2. Follow the setup instructions in the main [README.md](../../README.md) to configure GitHub integration
3. Use the `ecs` label in your workflows
