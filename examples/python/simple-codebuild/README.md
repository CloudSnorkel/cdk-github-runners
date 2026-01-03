# Simple CodeBuild Example

This is the simplest example of using the CDK GitHub Runners library with just a CodeBuild provider.

## What it does

- Creates a CodeBuild provider with default settings
- Sets up the complete GitHub runners infrastructure
- Uses labels: `codebuild`, `linux`, `x64`

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

## GitHub Workflow

Use this in your GitHub Actions workflow:

```yaml
name: Test on CodeBuild
on: push
jobs:
  test:
    runs-on: [self-hosted, codebuild]
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: echo "Hello from CodeBuild runner!"
```

## Cleanup

To remove all resources:
```bash
cdk destroy
```
