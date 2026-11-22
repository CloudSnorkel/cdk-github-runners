# Compliance

Compliance frameworks like HIPAA, PCI DSS, and NIST 800-53 often ask for your own encryption keys and limited Lambda concurrency. [`Compliance`](/api/Compliance) applies those to everything this library creates in a scope, like a stack or a whole app. Settings of the closest scope win.

```typescript
import { aws_kms as kms } from 'aws-cdk-lib';
import { Compliance, Ec2RunnerProvider } from '@cloudsnorkel/cdk-github-runners';

declare const key: kms.Key;
declare const logsKey: kms.Key;
declare const gpuKey: kms.Key;
declare const gpuProvider: Ec2RunnerProvider;

Compliance.of(this).encrypt({ key, logs: logsKey });  // logs get their own key, everything else uses `key`
Compliance.of(gpuProvider).encrypt({ storage: gpuKey });  // stricter key for one provider
Compliance.of(this).limitLambdaConcurrency({ maxJobStarts: 50 });  // jobs you expect to start at once
```

Synth warns about runner resources that no scope covers, like image builders in another stack. The key needs to be in a stack that every other stack can use. Adding a key to an existing deployment rebuilds runner images.

See the [compliance example](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/typescript/compliance/) for a complete setup.
