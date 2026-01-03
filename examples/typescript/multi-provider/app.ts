#!/usr/bin/env node
/**
 * Multi-provider example with custom runner image configuration.
 * 
 * This example demonstrates:
 * - Multiple providers (CodeBuild and Fargate)
 * - Custom runner image with additional software
 * - Different labels for different use cases
 * - VPC configuration for Fargate provider
 */

import { App, Stack } from 'aws-cdk-lib';
import { Vpc } from 'aws-cdk-lib/aws-ec2';
import { ComputeType } from 'aws-cdk-lib/aws-codebuild';
import {
    GitHubRunners,
    CodeBuildRunnerProvider,
    FargateRunnerProvider,
    RunnerImageComponent,
    Architecture,
    Os
} from '@cloudsnorkel/cdk-github-runners';

class MultiProviderStack extends Stack {
    constructor(scope: App, id: string) {
        super(scope, id);

        // Create a VPC for the Fargate provider
        const vpc = new Vpc(this, 'VPC', { maxAzs: 2 });

        // Create a custom image builder for Fargate with additional tools
        const fargateImageBuilder = FargateRunnerProvider.imageBuilder(
            this, 'FargateImageBuilder',
            {
                architecture: Architecture.X86_64,
                os: Os.LINUX_UBUNTU
            }
        );

        // Add custom components to the image
        // Note: FargateRunnerProvider doesn't include Docker by default (unlike EC2/ECS providers)
        // So we add it here. We also add git-lfs as an additional tool.
        fargateImageBuilder.addComponent(
            RunnerImageComponent.docker()
        );
        fargateImageBuilder.addComponent(
            RunnerImageComponent.custom({
                name: 'Git LFS',
                commands: [
                    'apt-get update',
                    'apt-get install -y git-lfs',
                ]
            })
        );

        // Create CodeBuild provider for quick builds
        const codebuildProvider = new CodeBuildRunnerProvider(this, 'CodeBuildProvider', {
            labels: ['codebuild', 'quick', 'linux'],
            computeType: ComputeType.SMALL
        });

        // Create Fargate provider for longer-running jobs with custom image
        const fargateProvider = new FargateRunnerProvider(this, 'FargateProvider', {
            labels: ['fargate', 'docker', 'linux'],
            vpc: vpc,
            imageBuilder: fargateImageBuilder,
            cpu: 1024,  // 1 vCPU
            memoryLimitMiB: 2048  // 2 GB RAM
        });

        // Create the GitHub runners infrastructure with both providers
        new GitHubRunners(this, 'GitHubRunners', {
            providers: [codebuildProvider, fargateProvider]
        });
    }
}

const app = new App();
new MultiProviderStack(app, 'MultiProviderExample');
app.synth();
