# Add Software Example

This example demonstrates how to add custom software to runner images using custom image components.

## What This Example Shows

- How to create a custom image builder
- How to add custom software packages to runner images
- How to use the custom image with a provider

## Benefits

**Pre-installed software saves time**: The installed software will be available for all workflows using this provider. This means you don't need to install it in each workflow step, saving valuable setup time and making your workflows faster and more reliable.

## Usage

After deploying, your runners will have the custom software pre-installed and ready to use:

```yaml
name: Use Custom Tools
on: [push]
jobs:
  build:
    runs-on: [self-hosted, fargate]
    steps:
      - uses: actions/checkout@v5
      - name: Use git-lfs
        run: git lfs pull  # No need to install git-lfs first!
      - name: Use Python
        run: python3 --version  # Python is already installed!
```

## Setup

1. Deploy the stack: `cdk deploy`
2. Follow the setup instructions in the main [README.md](../../README.md) to configure GitHub integration
3. Use the `fargate` label in your workflows
