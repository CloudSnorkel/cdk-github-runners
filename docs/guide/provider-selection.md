# Custom Provider Selection

By default, providers are selected based on label matching: the first provider that has all the labels requested by the job is selected. You can customize this behavior using a provider selector Lambda function to:

* Filter out certain jobs (prevent runner provisioning)
* Dynamically select a provider based on job characteristics (repository, branch, time of day, etc.)
* Customize labels for the runner (add, remove, or modify labels dynamically)

The selector function receives the full GitHub webhook payload, a map of all available providers and their labels, and the default provider/labels that would have been selected. It returns the provider to use (or `undefined` to skip runner creation) and the labels to assign to the runner.

**Example: Route jobs to different providers based on repository**

```typescript
import { ComputeType } from 'aws-cdk-lib/aws-codebuild';
import { Function, Code, Runtime } from 'aws-cdk-lib/aws-lambda';
import { GitHubRunners, CodeBuildRunnerProvider } from '@cloudsnorkel/cdk-github-runners';

const defaultProvider = new CodeBuildRunnerProvider(this, 'default', {
  labels: ['custom-runner', 'default'],
});
const productionProvider = new CodeBuildRunnerProvider(this, 'production', {
  labels: ['custom-runner', 'production'],
  computeType: ComputeType.LARGE,
});

const providerSelector = new Function(this, 'provider-selector', {
  runtime: Runtime.NODEJS_LATEST,
  handler: 'index.handler',
  code: Code.fromInline(`
    exports.handler = async (event) => {
      const { payload, providers, defaultProvider, defaultLabels } = event;
      
      // Route production repos to dedicated provider
      if (payload.repository.name.includes('prod')) {
        return {
          provider: '` + productionProvider.node.path + `',
          labels: ['custom-runner', 'production', 'modified-via-selector'],
        };
      }
      
      // Filter out draft PRs
      if (payload.workflow_job.head_branch?.startsWith('draft/')) {
        return { provider: undefined }; // Skip runner provisioning
      }
      
      // Use default for everything else
      return {
        provider: defaultProvider,
        labels: defaultLabels,
      };
    };
  `),
});

new GitHubRunners(this, 'runners', {
   providers: [defaultProvider, productionProvider],
   providerSelector: providerSelector,
});
```

**Example: Add dynamic labels based on job metadata**

```typescript
import { Function, Code, Runtime } from 'aws-cdk-lib/aws-lambda';

const providerSelector = new Function(this, 'provider-selector', {
  runtime: Runtime.NODEJS_LATEST,
  handler: 'index.handler',
  code: Code.fromInline(`
    exports.handler = async (event) => {
      const { payload, defaultProvider, defaultLabels } = event;
      
      // Add branch name as a label
      const branch = payload.workflow_job.head_branch || 'unknown';
      const labels = [...(defaultLabels || []), 'branch:' + branch];
      
      return {
        provider: defaultProvider,
        labels: labels,
      };
    };
  `),
});
```

**Important considerations:**

* ⚠️ **Label matching responsibility**: You are responsible for ensuring the selected provider's labels match what the job requires. If labels don't match, the runner will be provisioned but GitHub Actions won't assign the job to it.
* ⚠️ **No guarantee of assignment**: Provider selection only determines which provider will provision a runner. GitHub Actions may still route the job to any available runner with matching labels. For reliable provider assignment, consider repo-level runner registration (the default).
* ⚡ **Performance**: The selector runs synchronously during webhook processing. Keep it fast and efficient—the webhook has a 30-second timeout total.
