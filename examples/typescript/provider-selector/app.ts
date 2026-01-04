#!/usr/bin/env node
/**
 * Provider selector example demonstrating custom provider selection logic.
 *
 * This example demonstrates:
 * - Custom provider selection based on repository name
 * - Filtering out certain jobs (e.g., draft PRs)
 * - Dynamically adding labels based on job metadata
 * - Route production repos to dedicated high-performance providers
 */

import { App, Stack } from 'aws-cdk-lib';
import { Function, Code, Runtime } from 'aws-cdk-lib/aws-lambda';
import { ComputeType } from 'aws-cdk-lib/aws-codebuild';
import {
  GitHubRunners,
  CodeBuildRunnerProvider,
} from '@cloudsnorkel/cdk-github-runners';

class ProviderSelectorStack extends Stack {
  constructor(scope: App, id: string) {
    super(scope, id);

    // Create a default provider for regular builds
    const defaultProvider = new CodeBuildRunnerProvider(this, 'DefaultProvider', {
      labels: ['custom-runner', 'default'],
      computeType: ComputeType.SMALL,
    });

    // Create a production provider with more resources for production repos
    const productionProvider = new CodeBuildRunnerProvider(this, 'ProductionProvider', {
      labels: ['custom-runner', 'production'],
      computeType: ComputeType.LARGE, // More CPU and memory for production builds
    });

    // Create a provider selector Lambda function
    // This function receives the webhook payload and can customize provider selection
    const providerSelector = new Function(this, 'ProviderSelector', {
      runtime: Runtime.NODEJS_LATEST,
      handler: 'index.handler',
      code: Code.fromInline(`
                exports.handler = async (event) => {
                    const { payload, providers, defaultProvider, defaultLabels } = event;
                    
                    console.log('Processing job:', {
                        repository: payload.repository?.name,
                        branch: payload.workflow_job?.head_branch,
                        labels: payload.workflow_job?.labels,
                    });
                    
                    // Route production repos to dedicated provider
                    if (payload.repository?.name?.includes('prod') || 
                        payload.repository?.name?.includes('production')) {
                        console.log('Routing to production provider');
                        return {
                            provider: '${productionProvider.node.path}',
                            labels: ['custom-runner', 'production', 'modified-via-selector'],
                        };
                    }
                    
                    // Filter out draft PRs (skip runner provisioning)
                    if (payload.workflow_job?.head_branch?.startsWith('draft/') ||
                        payload.workflow_job?.head_branch?.startsWith('wip/')) {
                        console.log('Skipping draft PR');
                        return { provider: undefined }; // Skip runner provisioning
                    }
                    
                    // Add branch name as a dynamic label for all other jobs
                    const branch = payload.workflow_job?.head_branch || 'unknown';
                    const labels = [...(defaultLabels || []), 'branch:' + branch.replace(/[^a-zA-Z0-9-]/g, '-')];
                    
                    console.log('Using default provider with dynamic labels');
                    return {
                        provider: defaultProvider,
                        labels: labels,
                    };
                };
            `),
    });

    // Create the GitHub runners infrastructure with provider selector
    new GitHubRunners(this, 'GitHubRunners', {
      providers: [defaultProvider, productionProvider],
      providerSelector: providerSelector,
    });
  }
}

const app = new App();
new ProviderSelectorStack(app, 'ProviderSelectorExample');
app.synth();
