# Examples

We provide comprehensive examples in the [`examples/`](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/) folder to help you get started quickly:

## Getting Started
- **[Simple CodeBuild](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/typescript/simple-codebuild/)** - Basic setup with just a CodeBuild provider (also available in [Python](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/python/simple-codebuild/))
- **[Warm Runners](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/typescript/warm-runners/)** - Pre-provisioned runners for low-latency job starts (also available in [Python](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/python/warm-runners/))

## Provider Configuration
- **[Composite Provider](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/typescript/composite-provider/)** - Fallback and weighted distribution strategies (also available in [Python](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/python/composite-provider/))
- **[Provider Selector](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/typescript/provider-selector/)** - Custom provider selection with Lambda function (also available in [Python](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/python/provider-selector/))
- **[EC2 Windows Provider](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/typescript/ec2-windows-provider/)** - EC2 configuration for Windows runners (also available in [Python](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/python/ec2-windows-provider/))
- **[Split Stacks](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/typescript/split-stacks/)** - Split image builders and providers across multiple stacks (also available in [Python](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/python/split-stacks/))

## Compute & Performance
- **[Compute Options](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/typescript/compute-options/)** - Configure CPU, memory, and instance types for different providers (also available in [Python](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/python/compute-options/))
- **[Spot Instances](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/typescript/spot-instances/)** - Use spot instances for cost savings across EC2, Fargate, and ECS (also available in [Python](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/python/spot-instances/))
- **[Storage Options](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/typescript/storage-options/)** - Custom EBS storage options for EC2 runners (also available in [Python](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/python/storage-options/))
- **[ECS Scaling](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/typescript/ecs-scaling/)** - Custom autoscaling group scaling policies for ECS providers (also available in [Python](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/python/ecs-scaling/))

## Security & Access
- **[IAM Permissions](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/typescript/iam-permissions/)** - Grant AWS IAM permissions to runners (also available in [Python](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/python/iam-permissions/))
- **[Network Access](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/typescript/network-access/)** - Configure network access with VPCs and security groups (also available in [Python](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/python/network-access/))
- **[Access Control](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/typescript/access-control/)** - Configure access control for webhook and setup functions (also available in [Python](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/python/access-control/))
- **[Compliance](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/typescript/compliance/)** - Encrypt with your own KMS keys, limit Lambda concurrency, and log API requests (also available in [Python](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/python/compliance/))

## Customization
- **[Add Software](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/typescript/add-software/)** - Add custom software to runner images (also available in [Python](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/python/add-software/))
- **[Job Hooks](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/typescript/job-hooks/)** - Run a script before every job using GitHub Actions runner hooks (also available in [Python](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/python/job-hooks/))
- **[GPU](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/typescript/gpu/)** - GPU support with NVIDIA drivers across EC2, CodeBuild, and ECS (also available in [Python](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/python/gpu/))

## Enterprise & Monitoring
- **[GHES](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/typescript/ghes/)** - Configure runners for GitHub Enterprise Server (also available in [Python](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/python/ghes/))
- **[Monitoring](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/typescript/monitoring/)** - Set up CloudWatch alarms and SNS notifications (also available in [Python](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/python/monitoring/))

Each example is self-contained with its own dependencies and README. Start with the simple examples and work your way up to more advanced configurations.

Another good and very full example is the [integration test](https://github.com/CloudSnorkel/cdk-github-runners/blob/main/test/default.integ.ts).

If you have more to share, please open a PR adding examples to the `examples` folder.
