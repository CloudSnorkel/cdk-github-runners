# GitHub Enterprise Server

GitHub Enterprise Server 3.10 or newer is supported, as runners are registered with [just-in-time configurations](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions#using-just-in-time-runners). Choose GitHub Enterprise Server when you [set up GitHub](./setup-github) and put its domain in the setup wizard or in `domain` of the GitHub secret.

When GitHub Enterprise Server is hosted in a VPC:

- **Runners must be in the GHES VPC**: Runners need to be in the same VPC as GitHub Enterprise Server to communicate with it. Configure the provider with the VPC.
- **The webhook endpoint will only be accessible from within the VPC**: Make sure your GitHub Enterprise Server instance can reach the API Gateway endpoint
- **VPC connectivity**: You may need to configure VPC endpoints or NAT Gateway for AWS services
- **Self-signed certificates**: If GitHub Enterprise Server uses a self-signed certificate, you need to:
  1. Add the certificate to the runner image using [`RunnerImageComponent.extraCertificates()`](/api/RunnerImageComponent#extraCertificates)
  2. Add the certificate to the management functions using [`extraCertificates`](/api/GitHubRunnersProps#extraCertificates) property on [`GitHubRunners`](/api/GitHubRunners)

  Both methods accept either:
  - A single certificate file (`.pem` or `.crt`)
  - A directory containing multiple certificate files (all `.pem` and `.crt` files in the directory will be used)

See the [GHES example](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/typescript/ghes/) for a complete setup.
