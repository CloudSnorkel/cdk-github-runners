# Monitoring

There are three important ways to monitor your runners:

1. Make sure runners don't fail to start. When that happens, jobs may sit and wait. Use [`GitHubRunners.metricFailed()`](/api/GitHubRunners#metricFailed) to get a metric for the number of failed runner starts. You should use this metric to trigger an alarm.
2. Make sure our management functions don't fail. When that happens, webhooks may be dropped and jobs may never get a runner. Use [`GitHubRunners.metricLambdaErrors()`](/api/GitHubRunners#metricLambdaErrors) to get a metric for the number of failed invocations across all management Lambda functions. You should use this metric to trigger an alarm.
3. Make sure runner images don't fail to build. Failed runner image builds mean you will get stuck with out-of-date software on your runners. It may lead to security vulnerabilities, or it may lead to slower runner start-ups as the runner software itself needs to be updated. Use [`GitHubRunners.failedImageBuildsTopic()`](/api/GitHubRunners#failedImageBuildsTopic) to get SNS topic that gets notified of failed runner image builds. You should subscribe to this topic.

Other useful metrics to track:

1. Use [`GitHubRunners.metricJobCompleted()`](/api/GitHubRunners#metricJobCompleted) to get a metric for the number of completed jobs broken down by labels and job success.
2. Use [`GitHubRunners.metricTime()`](/api/GitHubRunners#metricTime) to get a metric for the total time a runner is running. This includes the overhead of starting the runner.
3. Use [`GitHubRunners.metricStolenRunners()`](/api/GitHubRunners#metricStolenRunners) to get a metric for number of runners detected as stolen by another job. Anything over zero can indicate a misconfiguration or GitHub webhook issues.
4. Use [`GitHubRunners.metricJobsMatchingMultipleProviders()`](/api/GitHubRunners#metricJobsMatchingMultipleProviders) to get a metric for the number of jobs whose labels matched more than one provider and may run on any of them. Anything over zero means some workflows should ask for more labels.

Use [`GitHubRunners.createDashboard()`](/api/GitHubRunners#createDashboard) to get a CloudWatch dashboard with all of these metrics in one place. It's split
into sections for jobs, runners, runner assignment and management functions. Each section explains what its numbers
mean and which ones to alarm on.
