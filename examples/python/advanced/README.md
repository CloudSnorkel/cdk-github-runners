# Advanced Example

This is a comprehensive example demonstrating advanced features of the CDK GitHub Runners library.

## What it does

- **Multiple Providers**: CodeBuild, Fargate (x64/ARM64/Windows), Lambda, and EC2
- **Custom Images**: Different runner images for different architectures and OS
- **VPC Configuration**: Multi-AZ VPC with public/private subnets
- **Security**: Security groups and S3 bucket integration
- **Monitoring**: CloudWatch alarms for failed runners
- **Retry Strategies**: Different retry configurations per provider
- **Access Control**: Configured webhook and setup access

## Providers

### CodeBuild Provider
- Labels: `codebuild`, `quick`, `linux`, `x64`
- Small compute type for fast builds
- Access to S3 artifacts bucket

### Fargate Providers
- **x64**: `fargate`, `docker`, `linux`, `x64` - 2 vCPU, 4GB RAM
- **ARM64**: `fargate`, `docker`, `linux`, `arm64` - 2 vCPU, 4GB RAM  
- **Windows**: `fargate`, `windows`, `x64` - 2 vCPU, 4GB RAM
- Custom images with Docker (Fargate doesn't include it by default), git-lfs, Python, and other development tools
- VPC integration with security groups

### Lambda Provider
- Labels: `lambda`, `short`, `linux`
- 10-minute timeout, 1GB memory
- For quick tasks under 15 minutes

### EC2 Provider
- Labels: `ec2`, `long-running`, `linux`, `x64`
- m5.large instance with 100GB storage
- For tasks requiring persistent storage or long execution

## Architecture

- **VPC**: 3 AZs with public/private subnets
- **Security**: Security groups restricting egress
- **Storage**: S3 bucket for build artifacts
- **Monitoring**: CloudWatch alarms for failed runners

## Usage

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Deploy the stack:
   ```bash
   cdk deploy
   ```

3. Follow the setup instructions in the main README to configure GitHub integration

## GitHub Workflows

### Quick builds on CodeBuild
```yaml
name: Quick Tests
on: push
jobs:
  test:
    runs-on: [self-hosted, quick]
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: echo "Quick test on CodeBuild!"
```

### Docker builds on Fargate (x64)
```yaml
name: Docker Build x64
on: push
jobs:
  build:
    runs-on: [self-hosted, docker, x64]
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker image
        run: |
          docker build -t myapp .
          docker run myapp
```

### ARM64 builds on Fargate
```yaml
name: ARM64 Build
on: push
jobs:
  build:
    runs-on: [self-hosted, docker, arm64]
    steps:
      - uses: actions/checkout@v4
      - name: Build for ARM64
        run: |
          docker buildx build --platform linux/arm64 -t myapp:arm64 .
```

### Windows builds on Fargate
```yaml
name: Windows Build
on: push
jobs:
  build:
    runs-on: [self-hosted, windows]
    steps:
      - uses: actions/checkout@v4
      - name: Build on Windows
        run: |
          echo "Building on Windows Fargate"
```

### Short tasks on Lambda
```yaml
name: Short Task
on: push
jobs:
  task:
    runs-on: [self-hosted, short]
    steps:
      - uses: actions/checkout@v4
      - name: Quick task
        run: echo "Running on Lambda"
```

### Long-running tasks on EC2
```yaml
name: Long Running Task
on: push
jobs:
  task:
    runs-on: [self-hosted, long-running]
    steps:
      - uses: actions/checkout@v4
      - name: Long task
        run: |
          echo "Running on EC2"
          # Your long-running task here
```

## Monitoring

The stack creates CloudWatch alarms for:
- Failed runner starts (threshold: 5 failures in 2 evaluation periods)

## Cleanup

To remove all resources:
```bash
cdk destroy
```

**Note**: This example creates significant AWS resources. Monitor costs and clean up when done testing.
