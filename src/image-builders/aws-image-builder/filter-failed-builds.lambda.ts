import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import * as AWSLambda from 'aws-lambda';

const sns = new SNSClient();

export async function handler(event: AWSLambda.SNSEvent) {
  console.log(event);
  for (const record of event.Records) {
    let message = JSON.parse(record.Sns.Message);
    if (message.state.status === 'FAILED') {
      await sns.send(new PublishCommand({
        TopicArn: process.env.TARGET_TOPIC_ARN,
        Message: record.Sns.Message,
      }));
    }
  }
}
