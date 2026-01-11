# IAM Permissions Example

This example demonstrates how to grant AWS IAM permissions to runners, allowing them to access AWS services.

## What This Example Shows

- How to grant S3 read/write permissions to runners
- How providers pass IAM permissions to the runners they create

## Important Security Consideration

**Any job/workflow that runs on these runners will have these permissions.** When you grant IAM permissions to a provider, those permissions are available to all workflows and jobs that execute on runners created by that provider. This means:

- All repositories using these runners will have access to the granted resources
- All workflows, regardless of who created them, will have these permissions
- Only grant the minimum permissions necessary for your use case
- Consider using separate providers with different permission sets for different use cases

## Usage

After deploying, your GitHub Actions workflows can use the runners to access the S3 bucket:

```yaml
name: Upload to S3
on: [push]
jobs:
  upload:
    runs-on: [self-hosted, codebuild]
    steps:
      - uses: actions/checkout@v5
      - name: Upload artifact
        run: |
          aws s3 cp myfile.txt s3://your-bucket-name/
```

## Setup

1. Deploy the stack: `cdk deploy`
2. Follow the setup instructions in the main [README.md](../../README.md) to configure GitHub integration
3. Use the `codebuild` label in your workflows
