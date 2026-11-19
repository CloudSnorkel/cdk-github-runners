# Compliance Example

This example demonstrates how to apply settings that compliance frameworks like HIPAA, PCI DSS, and NIST 800-53 ask for.

## What This Example Shows

- How to encrypt runner data with your own KMS key, and logs with a separate key
- How to limit Lambda concurrency
- How to log webhook requests to API Gateway

## Setup

1. Deploy the stack: `cdk deploy`
2. Follow the setup instructions in the main [README.md](../../../README.md) to configure GitHub integration
3. Use the `codebuild` label in your workflows
