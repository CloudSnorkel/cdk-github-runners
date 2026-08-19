import * as crypto from 'crypto';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import { ExecutionAlreadyExists, SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import * as AWSLambda from 'aws-lambda';
import { MAX_RUNNER_NAME_LENGTH, OrchestratorInput } from './lambda-common';
import { getOctokit } from './lambda-github';
import { getSecretJsonValue } from './lambda-helpers';
import { recordControlledJob, RunnerReportMessage, trackerEnabled } from './lambda-tracker';
import { ProviderSelectorInput, ProviderSelectorResult } from './webhook';

const lambdaClient = new LambdaClient();
const sf = new SFNClient();
const sqs = new SQSClient();

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
      error: e,
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
  const repoNameTruncated = payload.repository.name.slice(0, MAX_RUNNER_NAME_LENGTH - deliveryId.length - 1);
  return `${repoNameTruncated}-${deliveryId}`;
}

export async function handler(event: AWSLambda.APIGatewayProxyEventV2): Promise<AWSLambda.APIGatewayProxyResultV2> {
  if (!process.env.WEBHOOK_SECRET_ARN ||
    !process.env.STEP_FUNCTION_ARN ||
    !process.env.PROVIDERS ||
    !process.env.REQUIRE_SELF_HOSTED_LABEL ||
    !process.env.JOB_ASSIGNMENT_QUEUE_URL) {
    throw new Error('Missing environment variables');
  }

  const webhookSecret = (await getSecretJsonValue(process.env.WEBHOOK_SECRET_ARN)).webhookSecret;

  let body;
  try {
    body = verifyBody(event, webhookSecret);
  } catch (e) {
    console.error({
      notice: 'Bad signature',
      error: e,
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

  if (payload.action !== 'queued' && payload.action !== 'in_progress') {
    console.log({
      notice: `Ignoring action "${payload.action}", expecting "queued" or "in_progress"`,
      job: payload.workflow_job,
    });
    return {
      statusCode: 200,
      body: 'OK. No runner started (action is not "queued").',
    };
  }

  if (payload.action === 'in_progress') {
    if (payload.workflow_job.runner_group_name !== 'GitHub Actions') { // ignore non self-hosted runners
      // report a job being assigned to a runner to the stolen runner detector
      // this is a much more trustworthy and reliable source than our runner log shtick
      // sadly it's not enough for cases like repos where the app is not installed stealing our jobs
      if (payload.workflow_job.runner_name && payload.workflow_job.run_id && payload.workflow_job.id) {
        await sqs.send(new SendMessageCommand({
          QueueUrl: process.env.JOB_ASSIGNMENT_QUEUE_URL,
          MessageBody: JSON.stringify(<RunnerReportMessage>{
            kind: 'report',
            runnerName: payload.workflow_job.runner_name,
            repo: `${payload.repository.owner.login}/${payload.repository.name}`,
            workflowId: payload.workflow_job.run_id,
            jobId: payload.workflow_job.id,
          }),
        }));
      }
    }
    return {
      statusCode: 200,
      body: 'OK. No runner started (action is "in_progress").',
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
  const idleTimeoutSeconds = process.env.IDLE_TIMEOUT_SECONDS ? parseInt(process.env.IDLE_TIMEOUT_SECONDS, 10) : 300; // default 5 minutes
  const input: OrchestratorInput = {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    jobId: payload.workflow_job.id,
    jobUrl: payload.workflow_job.html_url,
    installationId: payload.installation?.id ?? -1, // always pass value because step function can't handle missing input
    jobLabels: payload.workflow_job.labels.join(','), // original labels requested by the job
    provider: selection.provider,
    labels: selection.labels.join(','), // labels to use when registering runner
    maxIdleSeconds: idleTimeoutSeconds,
  };

  // remember that this job is one we serve, before its runner can possibly exist. best-effort on purpose --
  // starting the runner matters more than being able to tell later that we started it.
  if (trackerEnabled()) {
    try {
      await recordControlledJob(input);
    } catch (e) {
      console.error({
        notice: 'Failed to record job for stolen runner detection. The runner will still start, but a runner that takes this job may be mistaken for a stolen one.',
        jobId: input.jobId,
        jobUrl: input.jobUrl,
        error: `${e}`,
      });
    }
  }

  let executionArn: string | undefined;
  try {
    const execution = await sf.send(new StartExecutionCommand({
      stateMachineArn: process.env.STEP_FUNCTION_ARN,
      input: JSON.stringify(input),
      // name is not random so multiple execution of this webhook won't cause multiple builders to start
      name: executionName,
    }));
    executionArn = execution.executionArn;
  } catch (e) {
    if (e instanceof ExecutionAlreadyExists) {
      // this delivery already started a runner. happens when GitHub or our own redelivery function redelivers an
      // event we already handled. without this, every redelivery fails and gets redelivered again for hours.
      console.log({
        notice: 'Runner already started for this delivery',
        runnerName: executionName,
        job: payload.workflow_job,
      });
      return {
        statusCode: 200,
        body: 'OK. Runner already started for this delivery.',
      };
    }
    throw e;
  }

  console.log({
    notice: 'Started orchestrator',
    execution: executionArn,
    sfnInput: input,
    job: payload.workflow_job,
  });

  return {
    statusCode: 202,
    body: executionName,
  };
}
