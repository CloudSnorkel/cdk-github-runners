# ECS Windows Provider Example

This example demonstrates how to configure ECS providers for GitHub self-hosted runners on Windows.

## Features Demonstrated

- **ECS on EC2 with Windows**: Use ECS to run Windows runners on EC2 instances
- **Windows image builder**: Build custom Windows runner images with additional tools
- **VPC configuration**: Configure VPC, subnets, and security groups
- **Autoscaling**: Configure min/max instances for cost optimization

## Why Use ECS for Windows?

ECS is useful when you want more control over the infrastructure running the GitHub Actions Windows containers. You can:
- Control the autoscaling group to scale down to zero during off-hours
- Keep instances running for faster startup times
- Share instances across multiple runners

## Windows-Specific Considerations

- Windows images require public subnets for the image builder (as shown in the example)
- Windows runners typically require more resources than Linux runners
- Chocolatey is used for package management on Windows

## Usage

1. Install dependencies:
   ```bash
   npm install
   ```

2. Deploy the stack:
   ```bash
   npx cdk deploy
   ```

3. Follow the setup instructions in the main README to configure GitHub integration.

4. Use the runners in your GitHub Actions workflows:

```yaml
name: Build on ECS Windows
on: push
jobs:
  build:
    runs-on: [self-hosted, ecs, windows, x64]
    steps:
      - uses: actions/checkout@v3
      - run: echo "Running on ECS Windows instance"
      - run: choco --version
```

## Customization

You can customize the ECS Windows provider by:
- Adjusting `minInstances` and `maxInstances` for autoscaling
- Configuring `instanceType` for different instance sizes
- Adding custom components to the image builder (PowerShell commands)
- Configuring placement strategies and constraints
- Using existing ECS clusters and capacity providers

## Cleanup

To remove the stack:
```bash
npx cdk destroy
```
