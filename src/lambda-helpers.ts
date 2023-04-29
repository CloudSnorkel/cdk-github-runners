import * as AWS from 'aws-sdk';

export interface StepFunctionLambdaInput {
  readonly owner: string;
  readonly repo: string;
  readonly runId: string;
  readonly runnerName: string;
  readonly installationId: string;
  readonly labels: string[];
}

const sm = new AWS.SecretsManager();

export async function getSecretValue(arn: string | undefined) {
  if (!arn) {
    throw new Error('Missing secret ARN');
  }

  const secret = await sm.getSecretValue({ SecretId: arn }).promise();

  if (!secret.SecretString) {
    throw new Error(`No SecretString in ${arn}`);
  }

  return secret.SecretString;
}

export async function getSecretJsonValue(arn: string | undefined) {
  return JSON.parse(await getSecretValue(arn));
}

export async function updateSecretValue(arn: string | undefined, value: string) {
  if (!arn) {
    throw new Error('Missing secret ARN');
  }

  await sm.updateSecret({ SecretId: arn, SecretString: value }).promise();
}

export async function customResourceRespond(event: AWSLambda.CloudFormationCustomResourceEvent, responseStatus: string,
  reason: string, physicalResourceId: string, data: any) {
  const responseBody = JSON.stringify({
    Status: responseStatus,
    Reason: reason,
    PhysicalResourceId: physicalResourceId,
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    NoEcho: false,
    Data: data,
  });

  console.log('Responding', responseBody);

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const parsedUrl = require('url').parse(event.ResponseURL);
  const requestOptions = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.path,
    method: 'PUT',
    headers: {
      'content-type': '',
      'content-length': responseBody.length,
    },
  };

  return new Promise((resolve, reject) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const request = require('https').request(requestOptions, resolve);
      request.on('error', reject);
      request.write(responseBody);
      request.end();
    } catch (e) {
      reject(e);
    }
  });
}
