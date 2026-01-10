#!/usr/bin/env node
/**
 * Example: Monitoring with CloudWatch alarms.
 *
 * This example demonstrates how to set up CloudWatch alarms to monitor
 * runner failures and get notified when issues occur.
 */

import { App, Stack } from 'aws-cdk-lib';
import { Topic, EmailSubscription } from 'aws-cdk-lib/aws-sns';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import {
  GitHubRunners,
  CodeBuildRunnerProvider,
} from '@cloudsnorkel/cdk-github-runners';

class MonitoringStack extends Stack {
  constructor(scope: App, id: string) {
    super(scope, id);

    // Create a CodeBuild provider
    const codebuildProvider = new CodeBuildRunnerProvider(this, 'CodeBuildProvider', {
      labels: ['codebuild', 'linux', 'x64'],
    });

    // Create the GitHub runners infrastructure
    const runners = new GitHubRunners(this, 'GitHubRunners', {
      providers: [codebuildProvider],
    });

    // Create CloudWatch alarm for failed runners
    // This alarm triggers when 5 or more runners fail within 2 evaluation periods
    // Failed runner starts mean jobs may sit and wait, so this is critical to monitor
    const failedRunnersAlarm = runners.metricFailed().createAlarm(this, 'FailedRunnersAlarm', {
      threshold: 5,
      evaluationPeriods: 2,
      alarmDescription: 'Alert when runner starts fail',
    });

    // Create SNS topic for failed runner image builds
    // Runner images are rebuilt every week by default. Failed builds mean you'll get
    // stuck with out-of-date software, which may lead to security vulnerabilities
    // or slower runner start-ups as the runner software needs to be updated.
    const failedImageBuildsTopic = runners.failedImageBuildsTopic();

    // Subscribe to email notifications for failed image builds
    // Replace with your email address
    failedImageBuildsTopic.addSubscription(
      new EmailSubscription('your-email@example.com') // Replace with your email
    );

    // You can also create alarms for other metrics:
    // - runners.metricStarted() - number of runners started
    // - runners.metricStopped() - number of runners stopped
    // - runners.metricRunning() - current number of running runners
    // - runners.metricJobCompleted() - number of completed jobs (broken down by labels and job success)
    // - runners.metricTime() - total time a runner is running (includes overhead of starting)

    // Optionally, add email subscription to the failed runners alarm as well
    // const alarmTopic = new Topic(this, 'FailedRunnersTopic');
    // alarmTopic.addSubscription(new EmailSubscription('your-email@example.com')); // Replace with your email
    // failedRunnersAlarm.addAlarmAction(new SnsAction(alarmTopic));
  }
}

const app = new App();
new MonitoringStack(app, 'monitoring-example');
app.synth();
