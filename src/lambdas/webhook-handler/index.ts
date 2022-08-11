/* eslint-disable import/no-extraneous-dependencies */
import * as crypto from 'crypto';
/* eslint-disable-next-line import/no-extraneous-dependencies,import/no-unresolved */
import * as AWSLambda from 'aws-lambda';
import * as AWS from 'aws-sdk';
import { getSecretJsonValue } from '../helpers';

const sf = new AWS.StepFunctions();

// TODO use @octokit/webhooks?

function verifyBody(event: AWSLambda.APIGatewayProxyEventV2, secret: any): string {
  const sig = Buffer.from(event.headers['x-hub-signature-256'] || '', 'utf8');

  if (!event.body) {
    throw new Error('No body');
  }

  let body: Buffer;
  if (event.isBase64Encoded) {
    body = Buffer.from(event.body, 'base64');
  } else {
    body = Buffer.from(event.body || '', 'utf8');
  }

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  const expectedSig = Buffer.from(`sha256=${hmac.digest('hex')}`, 'utf8');

  console.log('Calculated signature: ', expectedSig.toString());

  if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(sig, expectedSig)) {
    throw new Error(`Signature mismatch. Expected ${expectedSig.toString()} but got ${sig.toString()}`);
  }

  return body.toString();
}

exports.handler = async function (event: AWSLambda.APIGatewayProxyEventV2): Promise<AWSLambda.APIGatewayProxyResultV2> {
  if (!process.env.WEBHOOK_SECRET_ARN || !process.env.STEP_FUNCTION_ARN) {
    throw new Error('Missing environment variables');
  }

  const webhookSecret = (await getSecretJsonValue(process.env.WEBHOOK_SECRET_ARN)).webhookSecret;

  let body;
  try {
    body = verifyBody(event, webhookSecret);
  } catch (e) {
    console.error(e);
    return {
      statusCode: 403,
      body: 'Bad signature',
    };
  }

  if (event.headers['content-type'] !== 'application/json') {
    console.error(`This webhook only accepts JSON payloads, got ${event.headers['content-type']}`);
    return {
      statusCode: 400,
      body: 'Expecting JSON payload',
    };
  }

  if (event.headers['x-github-event'] === 'ping') {
    return {
      statusCode: 200,
      body: 'Pong',
    };
  }

  // if (event.headers['x-github-event'] !== 'workflow_job' && event.headers['x-github-event'] !== 'workflow_run') {
  //     console.error(`This webhook only accepts workflow_job and workflow_run, got ${event.headers['x-github-event']}`);
  if (event.headers['x-github-event'] !== 'workflow_job') {
    console.error(`This webhook only accepts workflow_job, got ${event.headers['x-github-event']}`);
    return {
      statusCode: 400,
      body: 'Expecting workflow_job',
    };
  }

  const payload = JSON.parse(body);

  if (payload.action !== 'queued') {
    console.log(`Ignoring action "${payload.action}", expecting "queued"`);
    return {
      statusCode: 200,
      body: 'OK. No runner started.',
    };
  }

  // it's easier to deal with maps in step functions
  let labels: any = {};
  payload.workflow_job.labels.forEach((l: string) => labels[l] = true);

  // set execution name which is also used as runner name which are limited to 64 characters
  let executionName = `${payload.repository.full_name.replace('/', '-')}-${event.headers['x-github-delivery']}`.slice(0, 64);
  // start execution
  const execution = await sf.startExecution({
    stateMachineArn: process.env.STEP_FUNCTION_ARN,
    input: JSON.stringify({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      runId: payload.workflow_job.run_id,
      installationId: payload.installation?.id,
      labels: labels,
    }),
    // name is not random so multiple execution of this webhook won't cause multiple builders to start
    name: executionName,
  }).promise();

  console.log(`Started ${execution.executionArn}`);

  return {
    statusCode: 202,
    body: executionName,
  };
};

