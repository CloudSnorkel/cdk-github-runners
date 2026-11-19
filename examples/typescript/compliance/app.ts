#!/usr/bin/env node
/**
 * Example: Compliance settings.
 *
 * This example demonstrates how to encrypt everything with your own KMS keys,
 * limit Lambda concurrency, and log API requests.
 */

import { App, Stack } from 'aws-cdk-lib';
import { aws_kms as kms } from 'aws-cdk-lib';
import {
  GitHubRunners,
  CodeBuildRunnerProvider,
  Compliance,
  LambdaAccess,
} from '@cloudsnorkel/cdk-github-runners';

class ComplianceStack extends Stack {
  constructor(scope: App, id: string) {
    super(scope, id);

    // Create a CodeBuild provider
    const codebuildProvider = new CodeBuildRunnerProvider(this, 'CodeBuildProvider', {
      labels: ['codebuild', 'linux', 'x64'],
    });

    // Create the GitHub runners infrastructure
    new GitHubRunners(this, 'GitHubRunners', {
      providers: [codebuildProvider],
      webhookAccess: LambdaAccess.apiGateway({
        allowedIps: LambdaAccess.githubWebhookIps(),
      }),
    });

    // Encrypt everything with one key, except logs that get their own key
    const key = new kms.Key(this, 'Key', { enableKeyRotation: true });
    const logsKey = new kms.Key(this, 'Logs Key', { enableKeyRotation: true });
    Compliance.of(this).encrypt({ key, logs: logsKey });

    // Limit Lambda concurrency, sized for up to 50 jobs starting at once
    Compliance.of(this).limitLambdaConcurrency({ maxJobStarts: 50 });

    // Log webhook requests to API Gateway
    Compliance.of(this).logApiRequests();
  }
}

const app = new App();
new ComplianceStack(app, 'compliance-example');
app.synth();
