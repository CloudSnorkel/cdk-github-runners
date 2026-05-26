# Warm Runners Example

Pre-provisioned runners for low-latency job starts. Warm runners stay idle until a job arrives, reducing startup latency compared to on-demand provisioning.

## What it does

- Creates a CodeBuild provider with labels `codebuild`, `linux`, `x64`
- Sets up the GitHub runners infrastructure
- Adds an `AlwaysOnWarmRunner` pool of 2 runners

## Usage

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Edit `app.py` and set `owner` to your GitHub org or user.

3. Deploy the stack:
   ```bash
   cdk deploy
   ```

4. Follow the setup instructions in the main [README.md](../../README.md) to configure GitHub integration. Ensure your runners are registered at org level if you use `registration_level="org"`.

## GitHub Workflow

Use this in your GitHub Actions workflow:

```yaml
name: Test on Warm CodeBuild
on: push
jobs:
  test:
    runs-on: [self-hosted, codebuild]
    steps:
      - uses: actions/checkout@v5
      - name: Run tests
        run: echo "Hello from warm CodeBuild runner!"
```

## Cleanup

To remove all resources:
```bash
cdk destroy
```
