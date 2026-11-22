# Troubleshooting

Runners are started in response to a webhook coming in from GitHub. If there are any issues starting the runner like missing capacity or transient API issues, the provider will keep retrying for 24 hours. GitHub itself will cancel the job if it can't find a runner for 24 hours. If your jobs don't start, follow the steps below to examine all parts of this workflow.

Configuration problems that we can detect up-front fail the orchestrator with a `RunnerConfigurationError` before any instance, build, or task is started. The error message says what needs to be fixed. These are still retried like any other error, so a configuration fixed within the 24 hours GitHub keeps the job queued still gets a runner and the job still runs.

1. Always start with the status function, make sure no errors are reported, and confirm all status codes are OK
2. Make sure `runs-on` in the workflow matches the expected labels set in the runner provider
3. Diagnose relevant executions of the orchestrator step function by visiting the URL in `troubleshooting.stepFunctionUrl` from `status.json`
   1. If the execution failed, check your runner provider configuration for errors
   2. If the execution is still running for a long time, check the execution events to see why runner starting is being retried
   3. If there are no relevant executions, move to the next step
4. Confirm the webhook Lambda was called by visiting the URL in `troubleshooting.webhookHandlerUrl` from `status.json`
   1. If it's not called or logs errors, confirm the webhook settings on the GitHub side
   2. If you see too many errors, make sure you're only sending `workflow_job` events
5. When using GitHub app, make sure there are active installations in `github.auth.app.installations`
6. If runners start but never pick up a job and get stopped with `IdleRunner`, their runner version may be too old. Runners can't update themselves, and GitHub stops sending jobs to runners that are not updated within 30 days of a new runner release, or right away for a critical security update. [Rebuild your runner images](#rebuilding-runner-images) to fix it
7. If organization-level runners never pick up jobs from public repositories, check the runner group settings. By default, only private repositories can use runners in a runner group. You can allow public repositories in the [runner group repository access settings](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/managing-access-to-self-hosted-runners-using-groups#changing-which-repositories-can-access-a-runner-group), but make sure you understand the [security risks](./security#job-isolation) first

All logs are saved in CloudWatch.
* Log group names can be found in `status.json` for each provider, image builder, and other parts of the system
* Some useful Logs Insights queries can be enabled with [`GitHubRunners.createLogsInsightsQueries()`](/api/GitHubRunners#createLogsInsightsQueries)

To get `status.json`, check out the CloudFormation stack output for a command that generates it. The command looks like:

```
aws --region us-east-1 lambda invoke --function-name status-XYZ123 status.json
```

## Rebuilding runner images

Runner images are rebuilt every [`rebuildInterval`](/api/RunnerImageBuilderProps#rebuildInterval) (7 days by default). To rebuild all of them right now, run this with the name of each stack your runners are built in. It starts every image builder in the stack and prints the build ids. Runners pick up the new images as soon as the builds finish.

```sh
STACK=my-runners-stack
resources() {
  aws cloudformation list-stack-resources --stack-name "$STACK" --output text \
    --query "StackResourceSummaries[?ResourceType=='$1'].PhysicalResourceId"
}
for project in $(resources AWS::CodeBuild::Project); do
  # skip runner projects of CodeBuild providers, we only want image builders
  aws codebuild batch-get-projects --names "$project" --output text --query 'projects[0].description' \
    | grep -q '^Build docker image for self-hosted GitHub runner' \
    && aws codebuild start-build --project-name "$project" --output text --query 'build.id'
done
for pipeline in $(resources AWS::ImageBuilder::ImagePipeline); do
  aws imagebuilder start-image-pipeline-execution --image-pipeline-arn "$pipeline" --output text --query 'imageBuildVersionArn'
done
```

Make sure you use [`failedImageBuildsTopic()`](/api/GitHubRunners#failedImageBuildsTopic) to get notified of any failed builds.

## Known Issues

1. Runner images built during a failed deployment are not rolled back. If your stack fails to deploy after an image was already built, the new image will stay in use. The image will be automatically replaced on the next build interval, but that might take up to 7 days with default settings ([`rebuildInterval`](/api/RunnerImageBuilderProps#rebuildInterval)). It's recommended to not leave stacks in `UPDATE_ROLLBACK_COMPLETE` state. Deploying again with the configuration you want will rebuild the images and get everything back in sync.
2. Library downgrades are not well tested. We work hard to keep backwards compatibility, but downgrading to an older version of the library may lead to unexpected issues. For example, downgrading from 0.16.1 may result in runner images being deleted. They will be rebuilt on the next build interval, but that might take up to 7 days with default settings ([`rebuildInterval`](/api/RunnerImageBuilderProps#rebuildInterval)). It's recommended to not downgrade the library unless you know what you're doing.
