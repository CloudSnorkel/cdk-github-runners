import * as crypto from 'crypto';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import * as AWSLambda from 'aws-lambda';
import { getOctokit } from './lambda-github';
import { getSecretJsonValue } from './lambda-helpers';
import { ProviderSelectorInput, ProviderSelectorResult } from './webhook';

const sf = new SFNClient();
const lambdaClient = new LambdaClient();

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

  console.log({
    notice: 'Calculated signature',
    signature: expectedSig.toString(),
  });

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
    console.error({
      notice: 'Unable to check deployment. Try adding deployment read permission.',
      error: `${e}`,
    });
    return false;
  }
}

/**
 * Match job labels to a provider using default label matching logic.
 */
function matchLabelsToProvider(jobLabels: string[], providers: Record<string, string[]>): string | undefined {
  const jobLabelLowerCase = jobLabels.map((label) => label.toLowerCase());

  // is every label the job requires available in the runner provider?
  for (const provider of Object.keys(providers)) {
    const providerLabelsLowerCase = providers[provider].map((label) => label.toLowerCase());
    if (jobLabelLowerCase.every(label => label == 'self-hosted' || providerLabelsLowerCase.includes(label))) {
      return provider;
    }
  }

  return undefined;
}

/**
 * Call the provider selector Lambda function if configured.
 * @internal
 */
export async function callProviderSelector(
  payload: any,
  providers: Record<string, string[]>,
  defaultSelection: ProviderSelectorResult,
): Promise<ProviderSelectorResult | undefined> {
  if (!process.env.PROVIDER_SELECTOR_ARN) {
    return undefined;
  }

  const selectorInput: ProviderSelectorInput = {
    payload: payload,
    providers: providers,
    defaultProvider: defaultSelection.provider,
    defaultLabels: defaultSelection.labels,
  };

  // don't catch errors -- the whole webhook handler will be retried on unhandled errors
  const result = await lambdaClient.send(new InvokeCommand({
    FunctionName: process.env.PROVIDER_SELECTOR_ARN,
    Payload: JSON.stringify(selectorInput),
  }));

  if (result.FunctionError) {
    const selectorResponsePayload = result.Payload ? Buffer.from(result.Payload).toString() : undefined;
    console.error({
      notice: 'Provider selector failed',
      functionError: result.FunctionError,
      payload: selectorResponsePayload,
    });
    throw new Error('Provider selector failed');
  }

  if (!result.Payload) {
    throw new Error('Provider selector returned no payload');
  }

  return JSON.parse(Buffer.from(result.Payload).toString()) as ProviderSelectorResult;
}

/**
 * Exported for unit testing.
 * @internal
 */
export async function selectProvider(payload: any, jobLabels: string[], hook = callProviderSelector): Promise<ProviderSelectorResult> {
  const providers = JSON.parse(process.env.PROVIDERS!);
  const defaultProvider = matchLabelsToProvider(jobLabels, providers);
  const defaultLabels = defaultProvider ? providers[defaultProvider] : undefined;
  const defaultSelection = { provider: defaultProvider, labels: defaultLabels };
  const selectorResult = await hook(payload, providers, defaultSelection);

  if (selectorResult === undefined) {
    return defaultSelection;
  }

  console.log({
    notice: 'Before provider selector',
    provider: defaultProvider,
    labels: defaultLabels,
    jobLabels: jobLabels,
  });
  console.log({
    notice: 'After provider selector',
    provider: selectorResult.provider,
    labels: selectorResult.labels,
    jobLabels: jobLabels,
  });

  // any error here will fail the webhook and cause a retry so the selector has another chance to get it right
  if (selectorResult.provider !== undefined) {
    if (selectorResult.provider === '') {
      throw new Error('Provider selector returned empty provider');
    }
    if (!providers[selectorResult.provider]) {
      throw new Error(`Provider selector returned unknown provider ${selectorResult.provider}`);
    }
    if (selectorResult.labels === undefined || selectorResult.labels.length === 0) {
      throw new Error('Provider selector must return non-empty labels when provider is set');
    }
  }

  return selectorResult;
}

/**
 * Generate a unique execution name which is limited to 64 characters (also used as runner name).
 *
 * Exported for unit testing.
 *
 * @internal
 */
export function generateExecutionName(event: any, payload: any): string {
  const deliveryId = getHeader(event, 'x-github-delivery') ?? `${Math.random()}`;
  const repoNameTruncated = payload.repository.name.slice(0, 64 - deliveryId.length - 1);
  return `${repoNameTruncated}-${deliveryId}`;
}

export async function handler(event: AWSLambda.APIGatewayProxyEventV2): Promise<AWSLambda.APIGatewayProxyResultV2> {
  if (!process.env.WEBHOOK_SECRET_ARN || !process.env.STEP_FUNCTION_ARN || !process.env.PROVIDERS || !process.env.REQUIRE_SELF_HOSTED_LABEL) {
    throw new Error('Missing environment variables');
  }

  const webhookSecret = (await getSecretJsonValue(process.env.WEBHOOK_SECRET_ARN)).webhookSecret;

  let body;
  try {
    body = verifyBody(event, webhookSecret);
  } catch (e) {
    console.error({
      notice: 'Bad signature',
      error: `${e}`,
    });
    return {
      statusCode: 403,
      body: 'Bad signature',
    };
  }

  if (getHeader(event, 'content-type') !== 'application/json') {
    console.error({
      notice: 'This webhook only accepts JSON payloads',
      contentType: getHeader(event, 'content-type'),
    });
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
    console.error({
      notice: 'This webhook only accepts workflow_job',
      githubEvent: getHeader(event, 'x-github-event'),
    });
    return {
      statusCode: 200,
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

  // Select provider and labels
  const selection = await selectProvider(payload, payload.workflow_job.labels);
  if (!selection.provider || !selection.labels) {
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

  // start execution
  const executionName = generateExecutionName(event, payload);
  const input = {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    jobId: payload.workflow_job.id,
    jobUrl: payload.workflow_job.html_url,
    installationId: payload.installation?.id ?? -1, // always pass value because step function can't handle missing input
    jobLabels: payload.workflow_job.labels.join(','), // original labels requested by the job
    provider: selection.provider,
    labels: selection.labels.join(','), // labels to use when registering runner
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
