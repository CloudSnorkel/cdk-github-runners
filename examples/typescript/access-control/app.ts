#!/usr/bin/env node
/**
 * Example: Access control configuration.
 *
 * This example demonstrates how to configure access to the webhook and
 * setup functions using API Gateway with IP restrictions.
 */

import { App, Stack } from 'aws-cdk-lib';
import {
  GitHubRunners,
  CodeBuildRunnerProvider,
  LambdaAccess,
} from '@cloudsnorkel/cdk-github-runners';

class AccessControlStack extends Stack {
  constructor(scope: App, id: string) {
    super(scope, id);

    // Create a CodeBuild provider
    const codebuildProvider = new CodeBuildRunnerProvider(this, 'CodeBuildProvider', {
      labels: ['codebuild', 'linux', 'x64'],
    });

    // Create the GitHub runners infrastructure with custom access control
    new GitHubRunners(this, 'GitHubRunners', {
      providers: [codebuildProvider],
      // Webhook access: Use API Gateway with GitHub webhook IPs
      // This is more secure than the default Lambda URL
      webhookAccess: LambdaAccess.apiGateway({
        allowedIps: LambdaAccess.githubWebhookIps(), // Allow GitHub.com webhook IPs
      }),
      // Setup access: Disable after initial setup is complete
      // This prevents unauthorized access to the setup function
      setupAccess: LambdaAccess.noAccess(),
    });
  }
}

const app = new App();
new AccessControlStack(app, 'access-control-example');
app.synth();
