#!/usr/bin/env node
/**
 * Simple example using CodeBuild provider for GitHub self-hosted runners.
 *
 * This example creates a basic GitHub runners setup with just a CodeBuild provider.
 * It's the simplest way to get started with self-hosted runners.
 */

import { App, Stack } from 'aws-cdk-lib';
import { GitHubRunners, CodeBuildRunnerProvider } from '@cloudsnorkel/cdk-github-runners';

class SimpleCodeBuildStack extends Stack {
  constructor(scope: App, id: string) {
    super(scope, id);

    // Create a CodeBuild provider with default settings
    const codebuildProvider = new CodeBuildRunnerProvider(this, 'CodeBuildProvider', {
      labels: ['codebuild', 'linux', 'x64'],
    });

    // Create the GitHub runners infrastructure
    new GitHubRunners(this, 'GitHubRunners', {
      providers: [codebuildProvider],
    });
  }
}

const app = new App();
new SimpleCodeBuildStack(app, 'SimpleCodeBuildExample');
app.synth();
