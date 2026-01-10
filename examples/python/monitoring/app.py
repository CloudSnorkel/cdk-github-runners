#!/usr/bin/env python3
"""
Example: Monitoring with CloudWatch alarms.

This example demonstrates how to set up CloudWatch alarms to monitor
runner failures and get notified when issues occur.
"""

import aws_cdk as cdk
from aws_cdk import Stack, aws_sns as sns, aws_sns_subscriptions as sns_subs
from cloudsnorkel.cdk_github_runners import (
    GitHubRunners,
    CodeBuildRunnerProvider,
)


class MonitoringStack(Stack):
    def __init__(self, scope, construct_id, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # Create a CodeBuild provider
        codebuild_provider = CodeBuildRunnerProvider(
            self, "CodeBuildProvider",
            labels=["codebuild", "linux", "x64"]
        )

        # Create the GitHub runners infrastructure
        runners = GitHubRunners(
            self, "GitHubRunners",
            providers=[codebuild_provider]
        )

        # Create CloudWatch alarm for failed runners
        # This alarm triggers when 5 or more runners fail within 2 evaluation periods
        # Failed runner starts mean jobs may sit and wait, so this is critical to monitor
        failed_runners_alarm = runners.metric_failed().create_alarm(
            self, "FailedRunnersAlarm",
            threshold=5,
            evaluation_periods=2,
            alarm_description="Alert when runner starts fail"
        )

        # Create SNS topic for failed runner image builds
        # Runner images are rebuilt every week by default. Failed builds mean you'll get
        # stuck with out-of-date software, which may lead to security vulnerabilities
        # or slower runner start-ups as the runner software needs to be updated.
        failed_image_builds_topic = runners.failed_image_builds_topic()

        # Subscribe to email notifications for failed image builds
        # Replace with your email address
        failed_image_builds_topic.add_subscription(
            sns_subs.EmailSubscription("your-email@example.com")  # Replace with your email
        )

        # You can also create alarms for other metrics:
        # - runners.metric_started() - number of runners started
        # - runners.metric_stopped() - number of runners stopped
        # - runners.metric_running() - current number of running runners
        # - runners.metric_job_completed() - number of completed jobs (broken down by labels and job success)
        # - runners.metric_time() - total time a runner is running (includes overhead of starting)

        # Optionally, add email subscription to the failed runners alarm as well
        # from aws_cdk import aws_cloudwatch_actions as cw_actions
        # alarm_topic = sns.Topic(self, "FailedRunnersTopic")
        # alarm_topic.add_subscription(sns_subs.EmailSubscription("your-email@example.com"))
        # failed_runners_alarm.add_alarm_action(cw_actions.SnsAction(alarm_topic))


app = cdk.App()
MonitoringStack(app, "monitoring-example")
app.synth()
