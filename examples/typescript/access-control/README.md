# Access Control Example

This example demonstrates how to configure access control for the webhook and setup functions.

## What This Example Shows

- How to use API Gateway instead of Lambda URLs for better security
- How to restrict webhook access to GitHub.com IPs
- How to disable setup access after initial setup

## Access Types

- **webhookAccess**: Controls who can send webhooks (default: Lambda URL, open to all)
- **setupAccess**: Controls who can access the setup wizard (default: Lambda URL, open to all)

## Security Best Practices

- Use API Gateway with IP restrictions for webhook access
- Disable setup access after initial setup is complete

## Setup

1. Deploy the stack: `cdk deploy`
2. Follow the setup instructions in the main [README.md](../../README.md) to configure GitHub integration
3. After setup is complete, the setup function will be inaccessible
4. Use the `codebuild` label in your workflows
