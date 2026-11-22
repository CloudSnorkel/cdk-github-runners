# Composite Providers

Composite providers allow you to combine multiple runner providers with different strategies. There are two types:

**Fallback Strategy**: Try providers in order until one succeeds. Useful for trying spot instances first, then falling back to on-demand if spot capacity is unavailable.

```typescript
import { CompositeProvider, EcsRunnerProvider, GitHubRunners } from '@cloudsnorkel/cdk-github-runners';

// Try spot instances first, fall back to on-demand if spot is unavailable
const ecsFallback = CompositeProvider.fallback(this, 'ECS Fallback', [
  new EcsRunnerProvider(this, 'ECS Spot', {
    labels: ['ecs', 'linux', 'x64'],
    spot: true,
    // ... other config
  }),
  new EcsRunnerProvider(this, 'ECS On-Demand', {
    labels: ['ecs', 'linux', 'x64'],
    spot: false,
    // ... other config
  }),
]);

new GitHubRunners(this, 'runners', {
  providers: [ecsFallback],
});
```

**Weighted Distribution Strategy**: Randomly select a provider based on weights. Useful for distributing load across multiple availability zones or instance types.

```typescript
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { CompositeProvider, FargateRunnerProvider, GitHubRunners } from '@cloudsnorkel/cdk-github-runners';

declare const vpc: ec2.Vpc;

// Distribute 60% of traffic to AZ-1, 40% to AZ-2
const distributedProvider = CompositeProvider.distribute(this, 'Fargate Distribution', [
  {
    weight: 3, // 3/(3+2) = 60%
    provider: new FargateRunnerProvider(this, 'Fargate AZ-1', {
      labels: ['fargate', 'linux', 'x64'],
      subnetSelection: vpc.selectSubnets({
        availabilityZones: [vpc.availabilityZones[0]],
      }),
      // ... other config
    }),
  },
  {
    weight: 2, // 2/(3+2) = 40%
    provider: new FargateRunnerProvider(this, 'Fargate AZ-2', {
      labels: ['fargate', 'linux', 'x64'],
      subnetSelection: vpc.selectSubnets({
        availabilityZones: [vpc.availabilityZones[1]],
      }),
      // ... other config
    }),
  },
]);

new GitHubRunners(this, 'runners', {
  providers: [distributedProvider],
});
```

**Important**: All providers in a composite must have the exact same labels. This ensures any provisioned runner can match the labels requested by the GitHub workflow job.
