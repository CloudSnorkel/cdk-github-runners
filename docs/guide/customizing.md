# Customizing Providers and Images

The default providers configured by [`GitHubRunners`](/api/GitHubRunners) are useful for testing but probably not too much for actual production work. They run in the default VPC or no VPC and have no added IAM permissions. You would usually want to configure the providers yourself.

For example:

```typescript
import { aws_ec2 as ec2, aws_s3 as s3 } from 'aws-cdk-lib';
import { CodeBuildRunnerProvider, GitHubRunners } from '@cloudsnorkel/cdk-github-runners';

declare const vpc: ec2.Vpc;
declare const runnerSg: ec2.SecurityGroup;
declare const dbSg: ec2.SecurityGroup;
declare const bucket: s3.Bucket;

// create a custom CodeBuild provider
const myProvider = new CodeBuildRunnerProvider(this, 'codebuild runner', {
   labels: ['my-codebuild'],
   vpc: vpc,
   securityGroups: [runnerSg],
});
// grant some permissions to the provider
bucket.grantReadWrite(myProvider);
dbSg.connections.allowFrom(runnerSg, ec2.Port.tcp(3306), 'allow runners to connect to MySQL database');

// create the runner infrastructure
new GitHubRunners(this, 'runners', {
   providers: [myProvider],
});
```

Another way to customize runners is by modifying the image used to spin them up. The image contains the [runner](https://github.com/actions/runner), any required dependencies, and integration code with the provider. You may choose to customize this image by adding more packages, for example.

```typescript
import { FargateRunnerProvider, GitHubRunners, RunnerImageComponent } from '@cloudsnorkel/cdk-github-runners';

const myBuilder = FargateRunnerProvider.imageBuilder(this, 'image builder');
myBuilder.addComponent(
  RunnerImageComponent.custom({ commands: ['apt install -y nginx xz-utils'] }),
);

const myProvider = new FargateRunnerProvider(this, 'fargate runner', {
   labels: ['customized-fargate'],
   imageBuilder: myBuilder,
});

// create the runner infrastructure
new GitHubRunners(this, 'runners', {
   providers: [myProvider],
});
```

Your workflow will then look like:

```yaml
name: self-hosted example
on: push
jobs:
  self-hosted:
    runs-on: [self-hosted, customized-fargate]
    steps:
      - run: echo hello world
```

Windows images can also be customized the same way.

```typescript
import { Architecture, FargateRunnerProvider, GitHubRunners, Os, RunnerImageComponent } from '@cloudsnorkel/cdk-github-runners';

const myWindowsBuilder = FargateRunnerProvider.imageBuilder(this, 'Windows image builder', {
   architecture: Architecture.X86_64,
   os: Os.WINDOWS,
});
myWindowsBuilder.addComponent(
   RunnerImageComponent.custom({
     name: 'Ninja',
     commands: [
       'Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/ninja-build/ninja/releases/download/v1.11.1/ninja-win.zip" -OutFile ninja.zip',
       'Expand-Archive ninja.zip -DestinationPath C:\\actions',
       'del ninja.zip',
     ],
   }),
);

const myProvider = new FargateRunnerProvider(this, 'fargate runner', {
   labels: ['customized-windows-fargate'],
   imageBuilder: myWindowsBuilder,
});

new GitHubRunners(this, 'runners', {
   providers: [myProvider],
});
```

The runner OS and architecture is determined by the image it is set to use. For example, to create a Fargate runner provider for ARM64 set the [`architecture`](/api/RunnerImageBuilderProps#architecture) property for the image builder to [`Architecture.ARM64`](/api/Architecture#ARM64) in the image builder properties.

```typescript
import { Architecture, FargateRunnerProvider, GitHubRunners, Os } from '@cloudsnorkel/cdk-github-runners';

new GitHubRunners(this, 'runners', {
   providers: [
      new FargateRunnerProvider(this, 'fargate runner', {
         labels: ['arm64', 'fargate'],
         imageBuilder: FargateRunnerProvider.imageBuilder(this, 'image builder', {
            architecture: Architecture.ARM64,
            os: Os.LINUX_UBUNTU,
         }),
      }),
   ],
});
```
