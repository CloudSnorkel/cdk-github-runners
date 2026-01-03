# Provider Selector Example

This example demonstrates how to use a custom provider selector Lambda function to dynamically select providers and customize labels based on job characteristics.

## Features Demonstrated

- **Repository-based routing**: Route production repos to dedicated high-performance providers
- **Job filtering**: Skip runner provisioning for draft PRs
- **Dynamic labels**: Add branch name as a label dynamically

## How It Works

The provider selector Lambda function receives:
- `payload`: The full GitHub webhook payload
- `providers`: Map of all available providers and their labels
- `defaultProvider`: The provider that would be selected by default
- `defaultLabels`: The labels that would be used by default

The function returns:
- `provider`: The node path of the provider to use (or `undefined` to skip)
- `labels`: The labels to assign to the runner

## Example Logic

1. **Production routing**: If the repository name contains "prod" or "production", route to the production provider with LARGE compute type
2. **Draft PR filtering**: Skip runner provisioning for branches starting with "draft/" or "wip/"
3. **Dynamic labels**: For all other jobs, add the branch name as a label

## Important Warnings

⚠️ **Label matching responsibility**: You are responsible for ensuring the selected provider's labels match what the job requires. If labels don't match, the runner will be provisioned but GitHub Actions won't assign the job to it.

⚠️ **No guarantee of assignment**: Provider selection only determines which provider will provision a runner. GitHub Actions may still route the job to any available runner with matching labels. For reliable provider assignment, consider repo-level runner registration.

⚡ **Performance**: The selector runs synchronously during webhook processing. Keep it fast and efficient—the webhook has a 30-second timeout total.

## Usage

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Deploy the stack:
   ```bash
   cdk deploy
   ```

3. Follow the setup instructions in the main README to configure GitHub integration.

4. Use the runners in your GitHub Actions workflows:

```yaml
name: Production Build
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: [self-hosted, custom-runner, production]
    steps:
      - uses: actions/checkout@v3
      - run: echo "Running on production provider"

name: Regular Build
on: push
jobs:
  build:
    runs-on: [self-hosted, custom-runner, default]
    steps:
      - uses: actions/checkout@v3
      - run: echo "Running on default provider"
```

## Customization

You can customize the provider selector logic to:
- Route based on repository, branch, or workflow file
- Filter jobs based on time of day, day of week, or other criteria
- Add dynamic labels based on job metadata
- Implement cost optimization strategies
- Enforce security policies

## Cleanup

To remove the stack:
```bash
cdk destroy
```
