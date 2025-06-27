import * as crypto from 'crypto';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import * as AWSLambda from 'aws-lambda';
import { getOctokit } from './lambda-github';
import { getSecretJsonValue } from './lambda-helpers';
import { SupportedLabels } from './webhook';

const sf = new SFNClient();

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

/**
 * Exported for unit testing.
 * @internal
 */
export function verifyBody(event: AWSLambda.APIGatewayProxyEventV2, secret: any): string {
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

async function isDeploymentPending(payload: any) {
  const statusesUrl = payload.deployment?.statuses_url;
  if (statusesUrl === undefined) {
    return false;
  }

  try {
    const { octokit } = await getOctokit(payload.installation?.id);
    const statuses = await octokit.request(statusesUrl);

    return statuses.data[0]?.state === 'waiting';
  } catch (e) {
    console.error('Unable to check deployment. Try adding deployment read permission.', e);
    return false;
  }
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

export async function handler(event: AWSLambda.APIGatewayProxyEventV2): Promise<AWSLambda.APIGatewayProxyResultV2> {
  if (!process.env.WEBHOOK_SECRET_ARN || !process.env.STEP_FUNCTION_ARN || !process.env.SUPPORTED_LABELS || !process.env.REQUIRE_SELF_HOSTED_LABEL) {
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
    console.log({
      notice: `Ignoring action "${payload.action}", expecting "queued"`,
      job: payload.workflow_job,
    });
    return {
      statusCode: 200,
      body: 'OK. No runner started (action is not "queued").',
    };
  }

  if (process.env.REQUIRE_SELF_HOSTED_LABEL === '1' && !payload.workflow_job.labels.includes('self-hosted')) {
    console.log({
      notice: `Ignoring labels "${payload.workflow_job.labels}", expecting "self-hosted"`,
      job: payload.workflow_job,
    });
    return {
      statusCode: 200,
      body: 'OK. No runner started (no "self-hosted" label).',
    };
  }

  // don't start step function unless labels match a runner provider
  const provider = matchLabelsToProvider(payload.workflow_job.labels);
  if (!provider) {
    console.log({
      notice: `Ignoring labels "${payload.workflow_job.labels}", as they don't match a supported runner provider`,
      job: payload.workflow_job,
    });
    return {
      statusCode: 200,
      body: 'OK. No runner started (no provider with matching labels).',
    };
  }

  // don't start runners for a deployment that's still pending as GitHub will send another event when it's ready
  if (await isDeploymentPending(payload)) {
    console.log({
      notice: 'Ignoring job as its deployment is still pending',
      job: payload.workflow_job,
    });
    return {
      statusCode: 200,
      body: 'OK. No runner started (deployment pending).',
    };
  }

  // set execution name which is also used as runner name which are limited to 64 characters
  let deliveryId = getHeader(event, 'x-github-delivery') ?? `${Math.random()}`;
  if(process.env.STRIP_HYPHEN_FROM_GUID === '1') {
    deliveryId = deliveryId.replace(/-/g, '');
  }
  const repoName = process.env.SKIP_ORG_NAME === '1' ? payload.repository.name : payload.repository.full_name;
  const repoNameTruncated = repoName.replace('/', '-').slice(0, 64 - deliveryId.length - 1);
  const executionName = `${repoNameTruncated}-${deliveryId}`;
  // start execution
  const input = {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    jobId: payload.workflow_job.id,
    jobUrl: payload.workflow_job.html_url,
    installationId: payload.installation?.id ?? -1, // always pass value because step function can't handle missing input
    labels: payload.workflow_job.labels.join(','),
    provider: provider,
  };
  const execution = await sf.send(new StartExecutionCommand({
    stateMachineArn: process.env.STEP_FUNCTION_ARN,
    input: JSON.stringify(input),
    // name is not random so multiple execution of this webhook won't cause multiple builders to start
    name: executionName,
  }));

  console.log({
    notice: 'Started orchestrator',
    execution: execution.executionArn,
    sfnInput: input,
    job: payload.workflow_job,
  });

  return {
    statusCode: 202,
    body: executionName,
  };
}
