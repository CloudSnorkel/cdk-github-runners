# GitHub Enterprise Server (GHES) Example

This example demonstrates how to configure runners for GitHub Enterprise Server hosted in a VPC.

## What This Example Shows

- How to configure webhook access for GitHub Enterprise Server
- How to use API Gateway with VPC-only access
- How to set up the VPC for management functions and runners
- How to configure runners to communicate with GHES in the same VPC
- How to handle self-signed certificates (if needed)

## Important Notes

- **Runners must be in the GHES VPC**: Runners need to be in the same VPC as GitHub Enterprise Server to communicate with it. The example shows how to configure the provider with the VPC.
- **The webhook endpoint will only be accessible from within the VPC**: Make sure your GitHub Enterprise Server instance can reach the API Gateway endpoint
- **VPC connectivity**: You may need to configure VPC endpoints or NAT Gateway for AWS services
- **Self-signed certificates**: If GitHub Enterprise Server uses a self-signed certificate, you need to:
  1. Add the certificate to the runner image using `RunnerImageComponent.extraCertificates()`
  2. Add the certificate to the management functions using `extraCertificates` property on `GitHubRunners`
  
  Both methods accept either:
  - A single certificate file (`.pem` or `.crt`)
  - A directory containing multiple certificate files (all `.pem` and `.crt` files in the directory will be used)
  
  See the example code for commented instructions

## Setup

1. Deploy the stack: `cdk deploy`
2. Get the webhook URL from `status.json` (it will be a VPC-internal URL)
3. Configure GitHub Enterprise Server webhook to use this URL
4. If GHES uses a self-signed certificate, uncomment and configure the certificate sections in the code
5. Follow the setup instructions in the main [README.md](../../README.md) for authentication
6. Use the `codebuild` label in your workflows
