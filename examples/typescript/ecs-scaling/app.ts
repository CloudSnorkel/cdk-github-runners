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
import { Vpc, SubnetType, InstanceType, InstanceClass, InstanceSize, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import * as iam from 'aws-cdk-lib/aws-iam';
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

    // Create security group for the ASG
    const securityGroup = new SecurityGroup(this, 'SecurityGroup', {
      vpc,
      description: 'Security group for ECS cluster instances',
    });

    // Create launch template for the ASG
    // Use ECS-optimized AMI and appropriate instance type
    const launchTemplate = new ec2.LaunchTemplate(this, 'LaunchTemplate', {
      machineImage: ecs.EcsOptimizedImage.amazonLinux2(ecs.AmiHardwareType.STANDARD),
      instanceType: InstanceType.of(InstanceClass.M6I, InstanceSize.LARGE),
      requireImdsv2: true,
      securityGroup: securityGroup,
      role: new iam.Role(this, 'LaunchTemplateRole', {
        assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      }),
      userData: ec2.UserData.forLinux(),
    });

    // Create autoscaling group
    // ECS caches the runner image locally on instances, so runners provision faster
    // when there's capacity available. This provides near-warm runner performance.
    const autoScalingGroup = new autoscaling.AutoScalingGroup(this, 'AutoScalingGroup', {
      vpc,
      launchTemplate,
      minCapacity: 0,
      maxCapacity: 10,
    });

    // Create capacity provider with the ASG
    const capacityProvider = new ecs.AsgCapacityProvider(this, 'CapacityProvider', {
      autoScalingGroup,
      spotInstanceDraining: false,
    });

    // Create ECS provider with the custom capacity provider
    const ecsProvider = new EcsRunnerProvider(this, 'EcsProvider', {
      labels: ['ecs', 'linux', 'x64'],
      vpc: vpc,
      capacityProvider: capacityProvider,
    });

    // Add custom scaling policies to our ASG

    // Example: Scale up during work hours (9 AM - 5 PM UTC, Monday-Friday)
    autoScalingGroup.scaleOnSchedule('ScaleUpWorkHours', {
      schedule: autoscaling.Schedule.cron({ hour: '9', minute: '0', weekDay: 'MON-FRI' }),
      minCapacity: 2, // Keep at least 2 instances during work hours
    });

    // Example: Scale down during off hours
    autoScalingGroup.scaleOnSchedule('ScaleDownOffHours', {
      schedule: autoscaling.Schedule.cron({ hour: '17', minute: '0', weekDay: 'MON-FRI' }),
      minCapacity: 0, // Scale down to zero after work hours
    });

    // Example: Scale based on CPU utilization
    // autoScalingGroup.scaleOnCpuUtilization('ScaleOnCpu', {
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
