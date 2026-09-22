# Monitoring Example

This example demonstrates how to set up CloudWatch alarms and SNS notifications to monitor runner health and get notified of issues.

## What This Example Shows

- How to create CloudWatch alarms for failed runner starts
- How to set up email notifications for failed runner image builds
- How to monitor runner health and get notified of issues

## Monitoring Capabilities

There are two critical things to monitor:

1. **Failed runner starts**: When runners fail to start, jobs may sit and wait. Use `GitHubRunners.metric_failed()` to get a metric for the number of failed runner starts and create an alarm.

2. **Failed runner image builds**: Runner images are rebuilt every week by default. Failed builds mean you'll get stuck with out-of-date software, which may lead to security vulnerabilities or slower runner start-ups. Use `GitHubRunners.failed_image_builds_topic()` to get an SNS topic that gets notified of failed runner image builds.

Other useful metrics to track:

- `GitHubRunners.metric_started()` - number of runners started
- `GitHubRunners.metric_stopped()` - number of runners stopped
- `GitHubRunners.metric_running()` - current number of running runners
- `GitHubRunners.metric_job_completed()` - number of completed jobs broken down by labels and job success
- `GitHubRunners.metric_time()` - total time a runner is running (includes the overhead of starting the runner)

## Usage

After deploying:
- CloudWatch will monitor your runners and trigger alarms when failures occur
- You'll receive email notifications when runner image builds fail
- Replace `your-email@example.com` with your actual email address before deploying

## Setup

1. **Important**: Update the email address in the code (`your-email@example.com`) to your actual email
2. Deploy the stack: `cdk deploy`
3. Check your email and confirm the SNS subscription (you'll receive a confirmation email)
4. Follow the setup instructions in the main [README.md](../../README.md) to configure GitHub integration
5. Optionally, uncomment the code to add email notifications to the failed runners alarm as well
6. Use the `codebuild` label in your workflows
