# Split Stacks Example

This example demonstrates how to define an image builder in one stack and use it in providers defined in another stack. This is useful when you want to split your infrastructure across multiple stacks, for example if one stack gets too large or you want to separate concerns.

## Overview

The example consists of three stacks:

1. **VPC Stack** (`split-stacks-example-vpc`): Creates a shared VPC for image building and runners.
   - Note: Creating a VPC is not required. Providers can use the default VPC or an existing VPC.
   - We create one here to make this example self-contained and testable.

2. **Image Builder Stack** (`split-stacks-example-image-builder`): Defines the image builder that will be shared across multiple providers.

3. **Providers Stack** (`split-stacks-example-providers`): Defines multiple EC2 providers that all use the image builder from the image builder stack.

## Purpose

This example demonstrates how to split your infrastructure across multiple stacks. This is useful when:
- One stack gets too large and you want to split it up
- You want to separate concerns (e.g., image building vs. runner provisioning)
- You want to manage different parts of your infrastructure independently

It demonstrates:
- Sharing a single image builder across multiple providers in a different stack
- Cross-stack resource dependencies
- How CDK handles image builder references across stack boundaries

## Usage

```bash
# Install dependencies
npm install

# Synthesize the CloudFormation templates
cdk synth

# Deploy the VPC stack first
cdk deploy split-stacks-example-vpc

# Then deploy the image builder stack
cdk deploy split-stacks-example-image-builder

# Finally deploy the providers stack
cdk deploy split-stacks-example-providers
```

## Architecture

```
VPC Stack
└── VPC (shared)

Image Builder Stack
└── ImageBuilder
    └── Default components (requiredPackages, cloudWatchAgent, runnerUser, git, githubCli, awsCli, docker, githubRunner)

Providers Stack
├── Provider1 (uses ImageBuilder from Image Builder Stack)
└── Provider2 (uses ImageBuilder from Image Builder Stack)
```

## Notes

- This pattern is useful when you need to split large stacks or separate concerns
- In simpler cases, you might want to keep image builders and providers in the same stack
- Cross-stack references work well with CDK, allowing you to share resources across stack boundaries

## Deadly Embrace Issue

When using cross-stack references, you may encounter a "deadly embrace" issue when trying to refactor or replace the image builder. This happens because CloudFormation exports cannot be updated or deleted while they are still in use by other stacks.

For example, if you try to rename the image builder or replace it with a new one, a simple deploy won't work. CDK will attempt to remove the old exports, but CloudFormation won't allow deletion of an export if another stack still imports it—even temporarily during a deployment. This creates a deadlock where neither stack can be updated.

The example uses `exportValue()` to explicitly control exports, which helps break this circular dependency. For more details, see [AWS CDK Issue #7602](https://github.com/aws/aws-cdk/issues/7602).

### Solution

If you need to refactor or replace the image builder, use this multi-step deployment process:

1. **Remove the usage from the providers stack** (but keep the export in the image builder stack)
   - Update the providers stack to stop using the image builder
   - Deploy the providers stack

2. **Remove the exports and make your changes**
   - Remove the `exportValue()` calls from the image builder stack
   - Make your changes (rename, replace, etc.) to the image builder
   - Deploy the image builder stack

3. **Re-add the usage in the providers stack**
   - Update the providers stack to use the new/renamed image builder
   - Deploy the providers stack

This process breaks the circular dependency by ensuring exports are removed only after all imports have been removed, allowing CloudFormation to properly update the cross-stack references during refactoring.
