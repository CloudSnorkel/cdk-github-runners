# Upgrading

We maintain backwards compatibility within a major version. Upgrading to a newer minor or patch version should not require any code changes. Features we want to remove are deprecated first and only removed in the next major version.

Runners keep working during deployment. Jobs that are already running are not interrupted, and jobs that are queued during deployment still get a runner.

Upgrading between major versions may require extra steps to maintain no downtime during deployment. Those steps will be mentioned in the release notes and down below.

## Suggestions

* Upgrade regularly. Small upgrades are easier to review, and you get bug fixes and security fixes sooner.
* Read the [release notes](https://github.com/CloudSnorkel/cdk-github-runners/releases) before upgrading, especially for new features you might want to use.
* Fix deprecation warnings as they show up. They point to the replacement and make the next major version upgrade painless.
* Don't downgrade unless you know what you're doing or can accept downtime. Downgrades are [not well tested](./troubleshooting#known-issues).

## Runner Image Rebuilds

Run `cdk diff` before deploying and look for runner image changes. Upgrades often change image components, like a new way to install Docker or a fix for a tool that moved. Any change to an image rebuilds it during deployment, and the deployment waits for the build to finish. CodeBuild images usually take several minutes. AMIs built by EC2 Image Builder can take 30 minutes to an hour or more, especially on Windows. Waiting makes sure runners never use a broken image. If the build fails, the deployment fails and rolls back.

A change to an image built by CodeBuild shows up as a new `Build Wait` and `Build Wait Handle`, along with a change to the `BuildSpec` of the image builder project. A change to an image built by EC2 Image Builder shows up as a replaced component, recipe and image. For example:

```
Resources
[-] AWS::CloudFormation::WaitConditionHandle CodeBuild/Image Builder/Build Wait Handle 1daafc445a CodeBuildImageBuilderBuildWaitHandle1daafc445a8DAACFE8 destroy
[-] AWS::CloudFormation::WaitCondition CodeBuild/Image Builder/Build Wait 1daafc445a CodeBuildImageBuilderBuildWait1daafc445a69653CF8 destroy
[-] AWS::ImageBuilder::Component GHRInternal--Component-GithubRunner-Ubuntu-Linux-X86-64-5ee50cc880/Component GHRInternalComponentGithubRunnerUbuntuLinuxX86645ee50cc880ComponentBFC9680B destroy
[+] AWS::CloudFormation::WaitConditionHandle CodeBuild/Image Builder/Build Wait Handle ab78b50c30 CodeBuildImageBuilderBuildWaitHandleab78b50c3058C1EFDA
[+] AWS::CloudFormation::WaitCondition CodeBuild/Image Builder/Build Wait ab78b50c30 CodeBuildImageBuilderBuildWaitab78b50c30AC8EE39D
[+] AWS::ImageBuilder::Component GHRInternal--Component-GithubRunner-Ubuntu-Linux-X86-64-72ddf8c190/Component GHRInternalComponentGithubRunnerUbuntuLinuxX866472ddf8c190ComponentC0F1B7FF
[~] AWS::CodeBuild::Project CodeBuild/Image Builder/CodeBuild CodeBuildImageBuilderCodeBuild6F8DDBE3
 └─ [~] Source
     └─ [~] .BuildSpec:
         └─ [~] .Fn::Join:
             └─ @@ -70,6 +70,6 @@
                [-]     "...\nmkdir -p /opt/hostedtoolcache\n..."
                [+]     "...\nmkdir -p /opt/hostedtoolcache /opt/actionarchivecache\n..."
[~] Custom::ImageBuilder CodeBuild/Image Builder/Builder CodeBuildImageBuilder100AA200
 └─ [~] WaitHandle
     └─ [~] .Ref:
         ├─ [-] CodeBuildImageBuilderBuildWaitHandle1daafc445a8DAACFE8
         └─ [+] CodeBuildImageBuilderBuildWaitHandleab78b50c3058C1EFDA
[~] AWS::ImageBuilder::ImageRecipe EC2/Ami Builder/Ami Recipe/Recipe EC2AmiBuilderAmiRecipeC85FD83B replace
 └─ [~] Components (requires replacement)
     └─ @@ -58,7 +58,7 @@
        [ ] {
        [ ]   "ComponentArn": {
        [ ]     "Fn::GetAtt": [
        [-]       "GHRInternalComponentGithubRunnerUbuntuLinuxX86645ee50cc880ComponentBFC9680B",
        [+]       "GHRInternalComponentGithubRunnerUbuntuLinuxX866472ddf8c190ComponentC0F1B7FF",
        [ ]       "Arn"
        [ ]     ]
        [ ]   }
[~] AWS::ImageBuilder::Image EC2/Ami Builder/AMI Image EC2AmiBuilderAMIImage1613D60E replace
 └─ [~] ImageRecipeArn (requires replacement)
     └─ [~] .Fn::GetAtt:
         └─ @@ -1,4 +1,4 @@
            [ ] [
            [-]   "EC2AmiBuilderAmiRecipeC85FD83B",
            [+]   "EC2AmiBuilderAmiRecipeC85FD83B(replaced)",
            [ ]   "Arn"
            [ ] ]
```

Runners keep using the old image until the new one is ready. If you have a lot of images that take a long time to build, you can turn off [`waitOnDeploy`](/api/RunnerImageBuilderProps#waitOnDeploy). The deployment then finishes right away, but changes only take effect once the images are built in the background.

## From 0.x to 1.x

Version 1.0.0 removed everything that was deprecated in 0.x. It also removed legacy backward compatibility code. Follow the steps below to avoid downtime.

1. Upgrade to 0.18.2. GitHub Enterprise Server users need 3.10 or newer.
2. Resolve all deprecation warnings.
3. Deploy.
4. To make sure jobs queued before the upgrade still get a runner, do **one** of the following:
   1. Wait 24 hours. If your jobs run for hours, wait that much longer.
   2. **(or)** Wait until there are no running executions of the runner orchestrator step function.
   3. **(or)** Wait until there are no running executions that started before your 0.18.2 deploy.
   4. **(or)** Run the script below. It lists running executions that still use the pre-0.18.2 definition. When it prints nothing, you can continue.
      Run it with credentials for every account and region where you deployed runners.

      ```sh
      for sm in $(aws stepfunctions list-state-machines --output text \
          --query "stateMachines[?contains(name, 'RunnerOrchestrator')].stateMachineArn"); do
        for ex in $(aws stepfunctions list-executions --state-machine-arn "$sm" --status-filter RUNNING \
            --output text --query 'executions[].executionArn'); do
          aws stepfunctions describe-state-machine-for-execution --execution-arn "$ex" \
            --output text --query definition | grep -qF '$.runner.token' && echo "$ex"
        done
      done
      ```
5. Upgrade to 1.0.
6. Deploy.

### Removed APIs

These are the APIs 1.0.0 removed and what to use instead.

| Removed | Use instead |
|---------|-------------|
| `CodeBuildRunner`, `Ec2Runner`, `FargateRunner`, `LambdaRunner` | [`CodeBuildRunnerProvider`](/api/CodeBuildRunnerProvider), [`Ec2RunnerProvider`](/api/Ec2RunnerProvider), [`FargateRunnerProvider`](/api/FargateRunnerProvider), [`LambdaRunnerProvider`](/api/LambdaRunnerProvider) |
| `CodeBuildImageBuilder`, `ContainerImageBuilder`, `AmiBuilder`, `ImageBuilderComponent`, `LinuxUbuntuComponents`, `WindowsComponents` | `imageBuilder()` of the provider, like [`CodeBuildRunnerProvider.imageBuilder()`](/api/CodeBuildRunnerProvider#imageBuilder), with [`RunnerImageComponent`](/api/RunnerImageComponent) |
| `LINUX_X64_DOCKERFILE_PATH` and `LINUX_ARM64_DOCKERFILE_PATH` | `imageBuilder()` of the provider |
| `amiBuilder` | `imageBuilder` |
| `label` | `labels` |
| `securityGroup` | `securityGroups` |
| `retryOptions` on providers | [`retryOptions`](/api/GitHubRunnersProps#retryOptions) on `GitHubRunners` |
| `Ec2RunnerProviderProps.subnet` | [`vpc`](/api/Ec2RunnerProviderProps#vpc) and [`subnetSelection`](/api/Ec2RunnerProviderProps#subnetSelection) |
| `EcsRunnerProviderProps.assignPublicIp` | Nothing, it was ignored. Give the cluster instances internet access instead |
| `Os.LINUX` | [`Os.LINUX_UBUNTU`](/api/Os#LINUX_UBUNTU), [`Os.LINUX_AMAZON_2023`](/api/Os#LINUX_AMAZON_2023) or another Linux flavor |
| `RunnerImageComponent.dockerInDocker()` | [`RunnerImageComponent.docker()`](/api/RunnerImageComponent#docker) |
| `runnerVersion` on runner images and AMIs | Nothing, [open an issue](https://github.com/CloudSnorkel/cdk-github-runners/issues) if you need it |
| Provider fields like `image`, `task`, `container`, `vpc`, `spot` and `labelsFromProperties()` | Nothing, these were internal |

If you have any issues, we can help in [Discussions](https://github.com/CloudSnorkel/cdk-github-runners/discussions) or [Discord](https://discord.gg/vdrTUTqQKv).
