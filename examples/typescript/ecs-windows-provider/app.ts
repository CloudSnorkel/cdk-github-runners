#!/usr/bin/env node
/**
 * ECS Windows provider example demonstrating ECS on EC2 runner configuration for Windows.
 * 
 * This example demonstrates:
 * - ECS provider with Windows runners
 * - Custom Windows image builder with additional tools
 * - VPC and security group configuration
 * - Autoscaling configuration
 */

import { App, Stack } from 'aws-cdk-lib';
import { Vpc, SubnetType, SecurityGroup, Peer, Port } from 'aws-cdk-lib/aws-ec2';
import {
    GitHubRunners,
    EcsRunnerProvider,
    RunnerImageComponent,
    Os,
} from '@cloudsnorkel/cdk-github-runners';

class EcsWindowsProviderStack extends Stack {
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

        // Create a Windows image builder for ECS
        const windowsImageBuilder = EcsRunnerProvider.imageBuilder(this, 'WindowsImageBuilder', {
            os: Os.WINDOWS,
            vpc: vpc,
            subnetSelection: { subnetType: SubnetType.PUBLIC },
        });

        // Add custom components to the Windows image
        windowsImageBuilder.addComponent(
            RunnerImageComponent.custom({
                name: 'Windows Tools',
                commands: [
                    'choco install -y git docker-desktop',
                    'refreshenv',
                ]
            })
        );

        // ECS provider with Windows
        const ecsWindowsProvider = new EcsRunnerProvider(this, 'EcsWindowsProvider', {
            labels: ['ecs', 'windows', 'x64'],
            vpc: vpc,
            securityGroups: [runnerSg],
            imageBuilder: windowsImageBuilder,
            maxInstances: 3,
            minInstances: 0,
        });

        // Create the GitHub runners infrastructure
        new GitHubRunners(this, 'GitHubRunners', {
            providers: [
                ecsWindowsProvider,
            ],
        });
    }
}

const app = new App();
new EcsWindowsProviderStack(app, 'EcsWindowsProviderExample');
app.synth();
