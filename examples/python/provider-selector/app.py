#!/usr/bin/env python3
"""
Provider selector example demonstrating custom provider selection logic.

This example demonstrates:
- Custom provider selection based on repository name
- Filtering out certain jobs (e.g., draft PRs)
- Dynamically adding labels based on job metadata
- Route production repos to dedicated high-performance providers
"""

import aws_cdk as cdk
from aws_cdk import Stack, aws_lambda as lambda_, aws_codebuild as codebuild
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners,
    CodeBuildRunnerProvider,
)


class ProviderSelectorStack(Stack):
    def __init__(self, scope, construct_id, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # Create a default provider for regular builds
        default_provider = CodeBuildRunnerProvider(
            self, "DefaultProvider",
            labels=["custom-runner", "default"],
            compute_type=codebuild.ComputeType.SMALL,
        )

        # Create a production provider with more resources for production repos
        production_provider = CodeBuildRunnerProvider(
            self, "ProductionProvider",
            labels=["custom-runner", "production"],
            compute_type=codebuild.ComputeType.LARGE,  # More CPU and memory for production builds
        )

        # Create a provider selector Lambda function
        # This function receives the webhook payload and can customize provider selection
        provider_selector = lambda_.Function(
            self, "ProviderSelector",
            runtime=lambda_.Runtime.NODEJS_LATEST,
            handler="index.handler",
            code=lambda_.Code.from_inline("""
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
                            provider: '""" + production_provider.node.path + """',
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
            """),
        )

        # Create the GitHub runners infrastructure with provider selector
        GitHubRunners(
            self, "GitHubRunners",
            providers=[default_provider, production_provider],
            provider_selector=provider_selector,
        )


app = cdk.App()
ProviderSelectorStack(app, "ProviderSelectorExample")
app.synth()
