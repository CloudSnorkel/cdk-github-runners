import { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand } from '@aws-sdk/client-secrets-manager';

export interface StepFunctionLambdaInput {
  readonly owner: string;
  readonly repo: string;
  readonly runnerName: string;
  readonly installationId?: number;
  readonly labels: string[];
  readonly error?: {
    readonly Error: string;
    readonly Cause: string;
  };
}

const sm = new SecretsManagerClient();

export async function getSecretValue(arn: string | undefined) {
  if (!arn) {
    throw new Error('Missing secret ARN');
  }

  const secret = await sm.send(new GetSecretValueCommand({ SecretId: arn }));

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

  await sm.send(new UpdateSecretCommand({ SecretId: arn, SecretString: value }));
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
