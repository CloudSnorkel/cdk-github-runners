import * as AWSLambda from 'aws-lambda';
import * as AWS from 'aws-sdk';

const sns = new AWS.SNS();

exports.handler = async function(event: AWSLambda.SNSEvent) {
  console.log(JSON.stringify(event));
  for (const record of event.Records) {
    let message = JSON.parse(record.Sns.Message);
    if (message.state.status === 'FAILED') {
      await sns.publish({
        TopicArn: process.env.TARGET_TOPIC_ARN,
        Message: record.Sns.Message,
      }).promise();
    }
  }
};
