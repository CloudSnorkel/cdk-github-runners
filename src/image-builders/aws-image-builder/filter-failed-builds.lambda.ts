import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import * as AWSLambda from 'aws-lambda';

const sns = new SNSClient();

/**
 * Short readable summary of a failed build notification from CodeBuild or EC2 Image Builder.
 */
function summarize(message: any): { subject: string; text: string } | undefined {
  if (message.source === 'aws.codebuild') {
    const detail = message.detail;
    const info = detail['additional-information'] ?? {};
    const failedPhase = (info.phases ?? []).find((p: any) => p['phase-status'] && p['phase-status'] !== 'SUCCEEDED');
    return {
      subject: `Runner image build failed: ${detail['project-name']}`,
      text: [
        'Runner image build failed in CodeBuild.',
        '',
        `Project: ${detail['project-name']}`,
        `Failed phase: ${failedPhase?.['phase-type'] ?? 'unknown'}`,
        `Reason: ${failedPhase?.['phase-context']?.join(' ') || 'unknown'}`,
        `Logs: ${info.logs?.['deep-link'] ?? 'unknown'}`,
        `Build: ${detail['build-id']}`,
      ].join('\n'),
    };
  }

  if (message.state?.status === 'FAILED') {
    const region = message.arn.split(':')[3];
    const logGroup = `/aws/imagebuilder/${message.name}`;
    const logGroupLink = encodeURIComponent(encodeURIComponent(logGroup)).replace(/%/g, '$');
    return {
      subject: `Runner image build failed: ${message.name}`,
      text: [
        'Runner image build failed in EC2 Image Builder.',
        '',
        `Recipe: ${message.name} ${message.version}`,
        `Reason: ${message.state.reason ?? 'unknown'}`,
        `Logs: https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/${logGroupLink}`,
        `Image: ${message.arn}`,
      ].join('\n'),
    };
  }

  return undefined;
}

export async function handler(event: AWSLambda.SNSEvent) {
  console.log({
    notice: 'Received SNS event',
    recordCount: event.Records.length,
  });
  for (const record of event.Records) {
    const message = JSON.parse(record.Sns.Message);
    const summary = summarize(message);
    if (summary) {
      // email subscribers get the readable summary, everything else keeps getting the original JSON
      await sns.send(new PublishCommand({
        TopicArn: process.env.TARGET_TOPIC_ARN,
        Subject: summary.subject.slice(0, 100),
        MessageStructure: 'json',
        Message: JSON.stringify({
          default: record.Sns.Message,
          email: `${summary.text}\n\nRunners keep using the last successfully built image until a build succeeds.\n\nFull notification:\n${JSON.stringify(message, null, 2)}`,
        }),
      }));
    }
  }
}
