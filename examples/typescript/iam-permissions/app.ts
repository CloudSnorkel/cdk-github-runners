#!/usr/bin/env node
/**
 * Example: Grant IAM permissions to runners.
 *
 * This example demonstrates how to grant AWS IAM permissions to runners,
 * allowing them to access AWS services like S3 buckets.
 */

import { App, Stack } from 'aws-cdk-lib';
import { Bucket, BucketEncryption, BlockPublicAccess } from 'aws-cdk-lib/aws-s3';
import {
  GitHubRunners,
  CodeBuildRunnerProvider,
} from '@cloudsnorkel/cdk-github-runners';

class IamPermissionsStack extends Stack {
  constructor(scope: App, id: string) {
    super(scope, id);

    // Create an S3 bucket for artifacts
    const artifactsBucket = new Bucket(this, 'ArtifactsBucket', {
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    });

    // Create a CodeBuild provider
    const codebuildProvider = new CodeBuildRunnerProvider(this, 'CodeBuildProvider', {
      labels: ['codebuild', 'linux', 'x64'],
    });

    // Grant read/write permissions to the provider
    // The provider will pass these permissions to all runners it creates.
    // IMPORTANT: Any job/workflow that runs on these runners will have these permissions.
    // Only grant the minimum permissions necessary for your use case.
    artifactsBucket.grantReadWrite(codebuildProvider);

    // Create the GitHub runners infrastructure
    new GitHubRunners(this, 'GitHubRunners', {
      providers: [codebuildProvider],
    });
  }
}

const app = new App();
new IamPermissionsStack(app, 'iam-permissions-example');
app.synth();
