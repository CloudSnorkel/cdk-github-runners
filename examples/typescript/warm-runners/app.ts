#!/usr/bin/env node
/**
 * Warm runners example — pre-provisioned runners for low-latency job starts.
 *
 * This example creates a pool of warm CodeBuild runners that stay idle until
 * a job arrives. Uses AlwaysOnWarmRunner for 24/7 coverage.
 */

import { App, Stack } from 'aws-cdk-lib';
import { AlwaysOnWarmRunner, CodeBuildRunnerProvider, GitHubRunners } from '@cloudsnorkel/cdk-github-runners';

class WarmRunnersStack extends Stack {
  constructor(scope: App, id: string) {
    super(scope, id);

    const provider = new CodeBuildRunnerProvider(this, 'CodeBuildProvider', {
      labels: ['codebuild', 'linux', 'x64'],
    });

    const runners = new GitHubRunners(this, 'GitHubRunners', {
      providers: [provider],
    });

    new AlwaysOnWarmRunner(this, 'WarmRunners', {
      runners,
      provider,
      count: 2,
      owner: 'my-org',
      repo: 'my-repo',
    });
  }
}

const app = new App();
new WarmRunnersStack(app, 'warm-runners-example');
app.synth();
