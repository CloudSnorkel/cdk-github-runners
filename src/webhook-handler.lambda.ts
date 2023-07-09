import * as crypto from 'crypto';
import * as AWSLambda from 'aws-lambda';
import * as AWS from 'aws-sdk';
import { getSecretJsonValue } from './lambda-helpers';
import { SupportedLabels } from './webhook';

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

function matchLabelsToProvider(labels: string[]) {
  const jobLabelSet = labels.map((label) => label.toLowerCase());
  const supportedLabels: SupportedLabels[] = JSON.parse(process.env.SUPPORTED_LABELS!);

  // is every label the job requires available in the runner provider?
  for (const supportedLabelSet of supportedLabels) {
    const lowerCasedSupportedLabelSet = supportedLabelSet.labels.map((label) => label.toLowerCase());
    if (jobLabelSet.every(label => label == 'self-hosted' || lowerCasedSupportedLabelSet.includes(label))) {
      return supportedLabelSet.provider;
    }
  }

  return undefined;
}

exports.handler = async function (event: AWSLambda.APIGatewayProxyEventV2): Promise<AWSLambda.APIGatewayProxyResultV2> {
  if (!process.env.WEBHOOK_SECRET_ARN || !process.env.STEP_FUNCTION_ARN || !process.env.SUPPORTED_LABELS) {
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
      body: 'OK. No runner started (action is not "queued").',
    };
  }

  if (!payload.workflow_job.labels.includes('self-hosted')) {
    console.log(`Ignoring labels "${payload.workflow_job.labels}", expecting "self-hosted"`);
    return {
      statusCode: 200,
      body: 'OK. No runner started (no "self-hosted" label).',
    };
  }

  // don't start step function unless labels match a runner provider
  const provider = matchLabelsToProvider(payload.workflow_job.labels);
  if (!provider) {
    console.log(`Ignoring labels "${payload.workflow_job.labels}", as they don't match a supported runner provider`);
    return {
      statusCode: 200,
      body: 'OK. No runner started (no provider with matching labels).',
    };
  }

  // set execution name which is also used as runner name which are limited to 64 characters
  let executionName = `${payload.repository.full_name.replace('/', '-')}-${getHeader(event, 'x-github-delivery')}`.slice(0, 64);
  // start execution
  const input = JSON.stringify({
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    jobId: payload.workflow_job.id,
    jobUrl: payload.workflow_job.html_url,
    installationId: payload.installation?.id,
    labels: payload.workflow_job.labels,
    provider: provider,
  });
  const execution = await sf.startExecution({
    stateMachineArn: process.env.STEP_FUNCTION_ARN,
    input: input,
    // name is not random so multiple execution of this webhook won't cause multiple builders to start
    name: executionName,
  }).promise();

  console.log(`Started ${execution.executionArn}`);
  console.log(input);

  return {
    statusCode: 202,
    body: executionName,
  };
};
