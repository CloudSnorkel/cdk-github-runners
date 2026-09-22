# GPU

Demonstrates GPU support for GitHub Actions runners across EC2, CodeBuild, and ECS providers.

**Supported**: EC2 (Ubuntu, AL2, AL2023, Windows), CodeBuild, ECS. Default builders auto-select GPU base images (DLAMI for EC2, nvidia/cuda for CodeBuild/ECS).

For EC2 with AL2/AL2023, use a custom builder: `base_ami=BaseImage.from_gpu_base(os, architecture)`. For EC2 Windows, subscribe at [NVIDIA RTX Virtual Workstation](https://aws.amazon.com/marketplace/pp/prodview-f4reygwmtxipu) then use `base_ami=BaseImage.from_marketplace_product_id('<product-id>')`.

## Configs Covered

| Provider | OS | CPU | Purpose |
|----------|-----|-----|---------|
| EC2 | Ubuntu | x64 | Default builder auto-uses GPU base (DLAMI) |
| EC2 | Ubuntu | ARM64 | Custom builder with GPU base (g5g) |
| EC2 | Amazon Linux 2 | x64 | *(disabled)* nvidia rpms require newer rpm lib than AL2 |
| EC2 | Amazon Linux 2023 | x64 | Custom builder required |
| EC2 | Windows | x64 | Marketplace AMI (NVIDIA RTX Virtual Workstation) |
| CodeBuild | Ubuntu 22.04 | x64 | Deep Learning Containers base image |
| ECS | Ubuntu 22.04 | x64 | Deep Learning Containers base image |

## Usage

```yaml
runs-on: [self-hosted, gpu]
# or more specific: [self-hosted, ec2, gpu, ubuntu], [self-hosted, ec2, gpu, windows], etc.
```
