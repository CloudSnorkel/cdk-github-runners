import * as crypto from 'crypto';

const mockSfnSend = jest.fn();

jest.mock('@aws-sdk/client-sfn', () => {
  const actual = jest.requireActual('@aws-sdk/client-sfn');
  return {
    ...actual,
    SFNClient: jest.fn().mockImplementation(() => ({ send: mockSfnSend })),
  };
});

jest.mock('../src/lambda-helpers', () => ({
  getSecretJsonValue: async () => ({ webhookSecret: 'secret' }),
}));

const mockRecordControlledJob = jest.fn();

jest.mock('../src/lambda-tracker', () => ({
  trackerEnabled: () => !!process.env.RUNNER_TRACKER_TABLE,
  recordControlledJob: (...args: unknown[]) => mockRecordControlledJob(...args),
}));

import { handler } from '../src/webhook-handler.lambda';


function webhookEvent(payload: any): any {
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', 'secret').update(Buffer.from(body, 'utf8')).digest('hex');

  return {
    body,
    isBase64Encoded: false,
    headers: {
      'content-type': 'application/json',
      'x-github-event': 'workflow_job',
      'x-github-delivery': 'ea8a0021-6ba6-4986-9102-51c567e55733',
      'x-hub-signature-256': `sha256=${signature}`,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.WEBHOOK_SECRET_ARN = 'arn:secret';
  process.env.STEP_FUNCTION_ARN = 'arn:aws:states:us-east-1:123456789012:stateMachine:runners';
  process.env.PROVIDERS = JSON.stringify({ 'Stack/Provider': ['self-hosted', 'linux'] });
  process.env.REQUIRE_SELF_HOSTED_LABEL = '1';
  process.env.PROVIDER_SELECTOR_ARN = '';
  process.env.RUNNER_TRACKER_TABLE = 'tracker';
  process.env.JOB_ASSIGNMENT_QUEUE_URL = 'hello';
  mockSfnSend.mockResolvedValue({ executionArn: 'arn:execution' });
});

test('queued job is recorded before the runner is started', async () => {
  const result: any = await handler(webhookEvent({
    action: 'queued',
    repository: { name: 'my-repo', owner: { login: 'my-org' } },
    installation: { id: 42 },
    workflow_job: { id: 1234, labels: ['self-hosted', 'linux'], html_url: 'https://job' },
  }));

  const runnerName = 'my-repo-ea8a0021-6ba6-4986-9102-51c567e55733';
  expect(result.statusCode).toBe(202);
  expect(result.body).toBe(runnerName);

  expect(mockRecordControlledJob).toHaveBeenCalledTimes(1);
  expect(mockRecordControlledJob.mock.calls[0][0]).toMatchObject({
    owner: 'my-org', repo: 'my-repo', jobId: 1234, installationId: 42,
  });

  // recorded before the execution starts, so we can never have a runner we don't know about
  expect(mockRecordControlledJob.mock.invocationCallOrder[0]).toBeLessThan(mockSfnSend.mock.invocationCallOrder[0]);
  expect(mockSfnSend.mock.calls[0][0].input.name).toBe(runnerName);
});

test('failure to record a job does not stop the runner', async () => {
  mockRecordControlledJob.mockRejectedValue(new Error('DynamoDB is having a bad day'));

  const result: any = await handler(webhookEvent({
    action: 'queued',
    repository: { name: 'my-repo', owner: { login: 'my-org' } },
    workflow_job: { id: 1234, labels: ['self-hosted', 'linux'], html_url: 'https://job' },
  }));

  expect(result.statusCode).toBe(202);
  expect(mockSfnSend).toHaveBeenCalledTimes(1);
});

test('redelivered queued events do not start a second runner', async () => {
  const { ExecutionAlreadyExists } = jest.requireActual('@aws-sdk/client-sfn');
  mockSfnSend.mockRejectedValue(new ExecutionAlreadyExists({ message: 'already', $metadata: {} }));

  const result: any = await handler(webhookEvent({
    action: 'queued',
    repository: { name: 'my-repo', owner: { login: 'my-org' } },
    workflow_job: { id: 1234, labels: ['self-hosted', 'linux'], html_url: 'https://job' },
  }));

  expect(result.statusCode).toBe(200);
  expect(result.body).toMatch('already started');
});

test.each(['completed', 'waiting'])('%s events are ignored', async (action) => {
  // runners tell us what they picked up, so the webhook only cares about queued jobs
  const result: any = await handler(webhookEvent({
    action,
    repository: { name: 'other-repo', owner: { login: 'other-org' } },
    workflow_job: { id: 5678, runner_name: 'my-repo-1234', labels: ['linux'] },
  }));

  expect(result.statusCode).toBe(200);
  expect(mockSfnSend).not.toHaveBeenCalled();
  expect(mockRecordControlledJob).not.toHaveBeenCalled();
});
