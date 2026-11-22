# Getting Started

Use this CDK construct to create ephemeral [self-hosted GitHub runners](https://docs.github.com/en/actions/hosting-your-own-runners/about-self-hosted-runners) on-demand inside your AWS account.

* 🧩 Easy to configure GitHub integration with a web-based interface
* 🧠 Customizable runners with decent defaults
* 🏃🏻 Multiple runner configurations controlled by labels
* 🔐 Everything fully hosted in your account
* 🔃 Automatically updated build environment with latest runner version

Self-hosted runners in AWS are useful when:

* You need easy access to internal resources in your actions
* You want to pre-install some software for your actions
* You want to provide some basic AWS API access (but [aws-actions/configure-aws-credentials](https://github.com/marketplace/actions/configure-aws-credentials-action-for-github-actions) has more security controls)
* You are using GitHub Enterprise Server (3.10 or newer, as runners are registered with [just-in-time configurations](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions#using-just-in-time-runners))

Ephemeral (or on-demand) runners are the [recommended way by GitHub](https://docs.github.com/en/actions/hosting-your-own-runners/autoscaling-with-self-hosted-runners#using-ephemeral-runners-for-autoscaling) for auto-scaling, and they make sure all jobs run with a clean image. Runners are started on-demand. You don't pay unless a job is running.

## Installation

1. Install the package for your language

   <div class="lang lang-typescript">

   Available on [npm](https://www.npmjs.com/package/@cloudsnorkel/cdk-github-runners).

   ```bash
   npm i @cloudsnorkel/cdk-github-runners
   ```

   </div>
   <div class="lang lang-python">

   Available on [PyPI](https://pypi.org/project/cloudsnorkel.cdk-github-runners).

   ```bash
   pip install cloudsnorkel.cdk-github-runners
   ```

   </div>
   <div class="lang lang-java">

   Available on [Maven](https://central.sonatype.com/artifact/com.cloudsnorkel/cdk.github.runners/).

   ```xml
   <dependency>
      <groupId>com.cloudsnorkel</groupId>
      <artifactId>cdk.github.runners</artifactId>
   </dependency>
   ```

   </div>
   <div class="lang lang-csharp">

   Available on [NuGet](https://www.nuget.org/packages/CloudSnorkel.Cdk.Github.Runners/).

   ```bash
   dotnet add package CloudSnorkel.Cdk.Github.Runners
   ```

   </div>
   <div class="lang lang-go">

   Available on [GitHub](https://pkg.go.dev/github.com/CloudSnorkel/cdk-github-runners-go/cloudsnorkelcdkgithubrunners).

   ```bash
   go get github.com/CloudSnorkel/cdk-github-runners-go/cloudsnorkelcdkgithubrunners
   ```

   </div>
2. Use [`GitHubRunners`](/api/GitHubRunners) construct in your code (starting with default arguments is fine)

   ```typescript
   import { App, Stack } from 'aws-cdk-lib';
   import { GitHubRunners } from '@cloudsnorkel/cdk-github-runners';

   const app = new App();
   const stack = new Stack(app, 'github-runners');
   new GitHubRunners(stack, 'runners');

   app.synth();
   ```
3. Deploy your stack
4. Look for the status command output similar to `aws --region us-east-1 lambda invoke --function-name status-XYZ123 status.json`
   ```
    ✅  github-runners-test

   ✨  Deployment time: 260.01s

   Outputs:
   github-runners-test.runnersstatuscommand4A30F0F5 = aws --region us-east-1 lambda invoke --function-name github-runners-test-runnersstatus1A5771C0-mvttg8oPQnQS status.json
   ```
5. Execute the status command (you may need to specify `--profile` too) and open the resulting `status.json` file
6. Open the URL in `github.setup.url` from `status.json` or [manually setup GitHub](./setup-github) integration as an app or with personal access token
7. Run status command again to confirm `github.auth.status` and `github.webhook.status` are OK
8. Trigger a GitHub action that has a `self-hosted` label with `runs-on: [self-hosted, codebuild]` (or non-default labels you set in step 2)
9. If the action is not successful, see [troubleshooting](./troubleshooting)

<iframe class="video" src="https://www.youtube-nocookie.com/embed/wlyv_3V8lIw" title="Demo" allowfullscreen></iframe>
