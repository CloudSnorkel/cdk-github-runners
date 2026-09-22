#!/usr/bin/env node
/**
 * Example: ECS with custom ASG scaling rules.
 *
 * This example demonstrates how to configure custom autoscaling group
 * scaling policies for ECS providers, allowing you to scale based on
 * schedule or other metrics.
 *
 * ECS can help speed up job startup time: ECS caches the runner image
 * locally on the instance, so runners will provision faster as long as
 * there is room in the instances for more runners. This is as close as
 * you can get right now to warm runners.
 */

import { App, Stack } from 'aws-cdk-lib';
import { Vpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import {
  GitHubRunners,
  EcsRunnerProvider,
} from '@cloudsnorkel/cdk-github-runners';

class EcsScalingStack extends Stack {
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

    // Create ECS provider - it will create its own capacity provider and ASG
    const ecsProvider = new EcsRunnerProvider(this, 'EcsProvider', {
      labels: ['ecs', 'linux', 'x64'],
      vpc: vpc,
      maxInstances: 10,
    });

    // Access the auto scaling group from the provider's built-in capacity provider
    // Use ecsProvider.capacityProvider.autoScalingGroup to access the ASG
    const asg = ecsProvider.capacityProvider.autoScalingGroup;

    // Add custom scaling policies to our ASG

    // Example: Scale up during work hours (9 AM - 5 PM UTC, Monday-Friday)
    asg.scaleOnSchedule('ScaleUpWorkHours', {
      schedule: autoscaling.Schedule.cron({ hour: '9', minute: '0', weekDay: 'MON-FRI' }),
      minCapacity: 2, // Keep at least 2 instances during work hours
    });

    // Example: Scale down during off hours
    asg.scaleOnSchedule('ScaleDownOffHours', {
      schedule: autoscaling.Schedule.cron({ hour: '17', minute: '0', weekDay: 'MON-FRI' }),
      minCapacity: 0, // Scale down to zero after work hours
    });

    // Example: Scale based on CPU utilization
    // asg.scaleOnCpuUtilization('ScaleOnCpu', {
    //   targetUtilizationPercent: 70,
    // });

    // Create the GitHub runners infrastructure
    new GitHubRunners(this, 'GitHubRunners', {
      providers: [ecsProvider],
    });
  }
}

const app = new App();
new EcsScalingStack(app, 'ecs-scaling-example');
app.synth();
