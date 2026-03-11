# GPU

Demonstrates the `nvidiaDrivers` component across all provider types, CPU architectures, and OSes for verification.

## Configs Covered

| Provider | OS | CPU | Purpose |
|----------|-----|-----|---------|
| EC2 | Ubuntu | x64 | nvidiaDrivers on Ubuntu x64 |
| EC2 | Ubuntu | ARM64 | nvidiaDrivers on Ubuntu ARM64 (g5g) |
| EC2 | Amazon Linux 2 | x64 | nvidiaDrivers on AL2 |
| EC2 | Amazon Linux 2023 | x64 | nvidiaDrivers on AL2023 |
| EC2 | Windows | x64 | nvidiaDrivers on Windows |
| CodeBuild | Ubuntu | x64 | nvidiaDrivers with GPU compute |
| ECS | Ubuntu | x64 | nvidiaDrivers with gpu: 1 |

## Usage

```yaml
runs-on: [self-hosted, gpu]
# or more specific: [self-hosted, ec2, gpu, ubuntu], [self-hosted, ec2, gpu, windows], etc.
```
