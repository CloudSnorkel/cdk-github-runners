#!/usr/bin/env node
/**
 * ECS provider example demonstrating ECS on EC2 runner configuration.
 * 
 * This example demonstrates:
 * - ECS provider with custom cluster configuration
 * - Spot instances for cost optimization
 * - Custom image builder with additional tools
 * - VPC and security group configuration
 * - Storage configuration with GP3 volumes
 * - Autoscaling configuration
 */

import { App, Stack, Size } from 'aws-cdk-lib';
import { Vpc, SubnetType, SecurityGroup, Peer, Port, EbsDeviceVolumeType } from 'aws-cdk-lib/aws-ec2';
import {
    GitHubRunners,
    EcsRunnerProvider,
    RunnerImageComponent,
    Architecture,
} from '@cloudsnorkel/cdk-github-runners';

class EcsProviderStack extends Stack {
    constructor(scope: App, id: string) {
        super(scope, id);

        // Create a VPC with public and private subnets
        const vpc = new Vpc(this, 'VPC', {
            maxAzs: 2,
            subnetConfiguration: [
                {
                    name: 'Public',
                    subnetType: SubnetType.PUBLIC,
                    cidrMask: 24
                },
                {
                    name: 'Private',
                    subnetType: SubnetType.PRIVATE_WITH_EGRESS,
                    cidrMask: 24
                }
            ]
        });

        // Create security group for runners
        const runnerSg = new SecurityGroup(this, 'RunnerSecurityGroup', { vpc });
        runnerSg.addEgressRule(Peer.anyIpv4(), Port.allTraffic());

        // Create a custom image builder with additional tools
        const imageBuilder = EcsRunnerProvider.imageBuilder(this, 'ImageBuilder', {
            architecture: Architecture.X86_64,
            os: Os.LINUX_UBUNTU,
        });

        // Add custom components to the image
        imageBuilder.addComponent(
            RunnerImageComponent.custom({
                name: 'Development Tools',
                commands: [
                    'apt-get update',
                    'apt-get install -y docker.io git-lfs curl jq build-essential',
                    'systemctl enable docker',
                    'usermod -aG docker ubuntu',
                ]
            })
        );

        // ECS provider with spot instances for cost optimization
        const ecsSpotProvider = new EcsRunnerProvider(this, 'EcsSpotProvider', {
            labels: ['ecs', 'linux', 'x64', 'spot'],
            vpc: vpc,
            securityGroups: [runnerSg],
            imageBuilder: imageBuilder,
            spot: true, // Use spot instances for cost savings
            maxInstances: 5,
            minInstances: 0, // Scale down to zero when not in use
            storageSize: Size.gibibytes(40),
            storageOptions: {
                volumeType: EbsDeviceVolumeType.GP3,
                iops: 1500,
                throughput: 150,
            },
        });

        // ECS provider with on-demand instances for reliability
        const ecsOnDemandProvider = new EcsRunnerProvider(this, 'EcsOnDemandProvider', {
            labels: ['ecs', 'linux', 'x64', 'on-demand'],
            vpc: vpc,
            securityGroups: [runnerSg],
            imageBuilder: imageBuilder,
            spot: false, // Use on-demand instances for critical workloads
            maxInstances: 3,
            minInstances: 0,
            storageSize: Size.gibibytes(40),
        });

        // Create the GitHub runners infrastructure
        new GitHubRunners(this, 'GitHubRunners', {
            providers: [
                ecsSpotProvider,
                ecsOnDemandProvider,
            ],
        });
    }
}

const app = new App();
new EcsProviderStack(app, 'EcsProviderExample');
app.synth();
