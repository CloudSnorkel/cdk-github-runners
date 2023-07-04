import * as crypto from 'crypto';
import * as AWSLambda from 'aws-lambda';
import * as AWS from 'aws-sdk';
import { getSecretJsonValue } from './lambda-helpers';

const sf = new AWS.StepFunctions();

// TODO use @octokit/webhooks?

function getHeader(event: AWSLambda.APIGatewayProxyEventV2, header: string): string | undefined {
  // API Gateway doesn't lowercase headers (V1 event) but Lambda URLs do (V2 event) :(
  for (const headerName of Object.keys(event.headers)) {
    if (headerName.toLowerCase() === header.toLowerCase()) {
      return event.headers[headerName];
    }
  }

  return undefined;
}

function verifyBody(event: AWSLambda.APIGatewayProxyEventV2, secret: any): string {
  const sig = Buffer.from(getHeader(event, 'x-hub-signature-256') || '', 'utf8');

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

  if (getHeader(event, 'content-type') !== 'application/json') {
    console.error(`This webhook only accepts JSON payloads, got ${getHeader(event, 'content-type')}`);
    return {
      statusCode: 400,
      body: 'Expecting JSON payload',
    };
  }

  if (getHeader(event, 'x-github-event') === 'ping') {
    return {
      statusCode: 200,
      body: 'Pong',
    };
  }

  // if (getHeader(event, 'x-github-event') !== 'workflow_job' && getHeader(event, 'x-github-event') !== 'workflow_run') {
  //     console.error(`This webhook only accepts workflow_job and workflow_run, got ${getHeader(event, 'x-github-event')}`);
  if (getHeader(event, 'x-github-event') !== 'workflow_job') {
    console.error(`This webhook only accepts workflow_job, got ${getHeader(event, 'x-github-event')}`);
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

  if (!payload.workflow_job.labels.includes('self-hosted')) {
    console.log(`Ignoring labels "${payload.workflow_job.labels}", expecting "self-hosted"`);
    return {
      statusCode: 200,
      body: 'OK. No runner started.',
    };
  }

  // it's easier to deal with maps in step functions
  let labels: any = {};
  payload.workflow_job.labels.forEach((l: string) => labels[l.toLowerCase()] = true);

  // prepare state machine input
  const input = JSON.stringify({
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    jobId: payload.workflow_job.id,
    jobUrl: payload.workflow_job.html_url,
    installationId: payload.installation?.id,
    labels: labels,
  });
  console.log(input);

  // start execution
  // we loop in case a previous attempt finished, and we got a duplicate event suggesting the job is still queued
  for (let attempt = 1; attempt < 100; attempt++) {
    // set execution name to job plus an attempt number, so we don't start two runners for the same job
    // this can happen when environments are enabled https://github.com/CloudSnorkel/cdk-github-runners/issues/380
    // execution name is limited to 80 characters, so we need to truncate it but leave some room for attempt number
    const executionName = `${payload.repository.full_name.replace('/', '-')}-${payload.workflow_job.id}`.slice(0, 76) + `-${attempt}`;

    try {
      const execution = await sf.startExecution({
        stateMachineArn: process.env.STEP_FUNCTION_ARN,
        input: input,
        // name is not random so multiple execution of this webhook won't cause multiple builders to start
        name: executionName,
      }).promise();

      // success!
      console.log(`Started ${execution.executionArn}`);
      return {
        statusCode: 202,
        body: executionName,
      };
    } catch (e: any) {
      // this means the previous attempt for this job already finished, but we got a webhook saying the job is still queued
      // this can happen when environments are enabled
      if (e.code === 'ExecutionAlreadyExists') {
        console.log(`Execution ${executionName} already exists and finished, retrying with attempt ${attempt + 1}`);
        continue;
      }

      // some other exception
      console.error(e);
      return {
        statusCode: 500,
        body: 'Internal error, see logs',
      };
    }
  }

  // no attempt succeeded
  return {
    statusCode: 500,
    body: 'Internal error, unable to start non-duplicate execution',
  };
};

