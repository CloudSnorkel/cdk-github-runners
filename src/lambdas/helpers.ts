/* eslint-disable import/no-extraneous-dependencies */
import * as AWS from 'aws-sdk';

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

export interface StepFunctionLambdaInput {
  readonly owner: string;
  readonly repo: string;
  readonly runId: string;
  readonly runnerName: string;
  readonly installationId: string;
  readonly labels: string[];
}
