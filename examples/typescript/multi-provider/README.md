# Multi-Provider Example

This example demonstrates using multiple providers with custom runner image configuration.

## What it does

- Creates a CodeBuild provider for quick builds
- Creates a Fargate provider with custom runner image
- Custom image includes Docker and additional tools
- Uses VPC for Fargate provider
- Different labels for different use cases

## Providers

### CodeBuild Provider
- Labels: `codebuild`, `quick`, `linux`
- Small compute type for fast builds
- Good for unit tests and quick builds

### Fargate Provider
- Labels: `fargate`, `docker`, `linux`
- Custom image with Docker and git-lfs
- 1 vCPU, 2GB RAM
- Runs in VPC for network isolation

## Usage

1. Install dependencies:
   ```bash
   npm install
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

### Docker builds on Fargate
```yaml
name: Docker Build
on: push
jobs:
  build:
    runs-on: [self-hosted, docker]
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker image
        run: |
          docker build -t myapp .
          docker run myapp
```

## Cleanup

To remove all resources:
```bash
cdk destroy
```
