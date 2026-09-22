# Composite Provider Example

This example demonstrates how to use composite providers to combine multiple runner providers with different strategies.

## Features Demonstrated

- **Fallback Strategy**: Try spot instances first, fall back to on-demand if spot capacity is unavailable
- **Weighted Distribution Strategy**: Distribute load across multiple availability zones based on weights

## Composite Provider Strategies

### Fallback Strategy

The fallback strategy tries providers in order until one succeeds. This is useful for:
- Trying spot instances first (cheaper), then falling back to on-demand
- Trying different instance types in order of preference
- Trying different regions or availability zones

In this example, we try EC2 spot instances first, and if spot capacity is unavailable, we fall back to on-demand instances.

### Weighted Distribution Strategy

The weighted distribution strategy randomly selects a provider based on weights. This is useful for:
- Distributing load across multiple availability zones
- Distributing load across different instance types
- Balancing cost and performance

In this example, we distribute Fargate runners across 2 availability zones:
- 60% to AZ-1 (weight: 3)
- 40% to AZ-2 (weight: 2)

## Important Notes

⚠️ **All providers in a composite must have the exact same labels.** This ensures any provisioned runner can match the labels requested by the GitHub workflow job.

## Usage

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Deploy the stack:
   ```bash
   cdk deploy
   ```

3. Follow the setup instructions in the main [README.md](../../README.md) to configure GitHub integration.

4. Use the runners in your GitHub Actions workflows:

```yaml
name: Use EC2 Fallback Runner
on: push
jobs:
  build:
    runs-on: [self-hosted, ec2, linux, x64, spot]
    steps:
      - uses: actions/checkout@v5
      - run: echo "Running on EC2 (spot or on-demand)"

name: Use Distributed Fargate Runner
on: push
jobs:
  build:
    runs-on: [self-hosted, fargate, linux, x64]
    steps:
      - uses: actions/checkout@v5
      - run: echo "Running on Fargate (distributed across AZs)"
```

## Cleanup

To remove the stack:
```bash
cdk destroy
```
