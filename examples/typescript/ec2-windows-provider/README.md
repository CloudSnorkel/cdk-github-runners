# EC2 Windows Provider Example

This example demonstrates how to configure EC2 providers for GitHub self-hosted runners on Windows.

## Features Demonstrated

- **EC2 with Windows**: Use EC2 to run Windows runners
- **Windows image builder**: Build custom Windows runner images with additional tools
- **VPC configuration**: Configure VPC, subnets, and security groups

## Why Use EC2 for Windows?

EC2 is useful when you want:
- Complete control over the runner instance
- Direct access to the host operating system
- Long-running instances that can be reused
- Custom instance configurations

## Windows-Specific Considerations

- Windows runners typically require more resources than Linux runners
- Chocolatey is used for package management on Windows
- Windows instances may take longer to start than Linux instances

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
name: Build on EC2 Windows
on: push
jobs:
  build:
    runs-on: [self-hosted, ec2, windows, x64]
    steps:
      - uses: actions/checkout@v3
      - run: echo "Running on EC2 Windows instance"
      - run: choco --version
```

## Customization

You can customize the EC2 Windows provider by:
- Configuring `instanceType` for different instance sizes
- Adding custom components to the image builder (PowerShell commands)
- Configuring `storageSize` for larger disk space
- Using spot instances for cost savings

## Cleanup

To remove the stack:
```bash
npx cdk destroy
```
