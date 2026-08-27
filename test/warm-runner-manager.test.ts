import * as AWSLambda from 'aws-lambda';
import type { WarmRunnerKeeperMessage, WarmRunnerFillPayload } from '../src/warm-runner-manager.lambda';

// Mock AWS SDK clients before importing the handler
const mockSfnSend = jest.fn();
const mockSqsSend = jest.fn();

jest.mock('@aws-sdk/client-sfn', () => {
  const actual = jest.requireActual('@aws-sdk/client-sfn');
  return {
    ...actual,
    SFNClient: jest.fn().mockImplementation(() => ({
      send: mockSfnSend,
    })),
  };
});

jest.mock('@aws-sdk/client-sqs', () => {
  const actual = jest.requireActual('@aws-sdk/client-sqs');
  return {
    ...actual,
    SQSClient: jest.fn().mockImplementation(() => ({
      send: mockSqsSend,
    })),
  };
});

const mockGetOctokit = jest.fn();
const mockGetRunner = jest.fn();
const mockDeleteRunner = jest.fn();
const mockGetAppOctokit = jest.fn();

jest.mock('../src/lambda-github', () => ({
  getOctokit: (...args: unknown[]) => mockGetOctokit(...args),
  getRunner: (...args: unknown[]) => mockGetRunner(...args),
  deleteRunner: (...args: unknown[]) => mockDeleteRunner(...args),
  getAppOctokit: (...args: unknown[]) => mockGetAppOctokit(...args),
}));

const mockCustomResourceRespond = jest.fn();

jest.mock('../src/lambda-helpers', () => ({
  customResourceRespond: (...args: unknown[]) => mockCustomResourceRespond(...args),
}));

// Import handler after mocks are set up
import { handler } from '../src/warm-runner-manager.lambda';

const VALID_CONFIG_HASH = 'abc123def456';
const EXECUTION_ARN = 'arn:aws:states:us-east-1:123456789012:execution:test:runner-1';

function createKeeperMessage(overrides: Partial<WarmRunnerKeeperMessage> = {}): WarmRunnerKeeperMessage {
  return {
    executionArn: EXECUTION_ARN,
    runnerName: 'warm-runner-1',
    owner: 'my-org',
    repo: 'my-repo',
    providerPath: '/stack/Provider',
    providerLabels: ['linux'],
    absoluteDeadline: Date.now() + 3600_000, // 1 hour from now
    configHash: VALID_CONFIG_HASH,
    ...overrides,
  };
}

function createSqsEvent(records: Array<{ body: string; messageId?: string }>): AWSLambda.SQSEvent {
  return {
    Records: records.map((r, i) => ({
      messageId: r.messageId ?? `msg-${i}`,
      receiptHandle: `receipt-${i}`,
      body: r.body,
      attributes: {},
      messageAttributes: {},
      md5OfBody: '',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:queue',
      awsRegion: 'us-east-1',
    })),
  };
}

function createKeeperSqsRecord(message: WarmRunnerKeeperMessage, messageId = 'msg-1'): { body: string; messageId: string } {
  return {
    messageId,
    body: JSON.stringify(message),
  };
}

function createFillSqsRecord(payload: WarmRunnerFillPayload, messageId = 'msg-fill'): { body: string; messageId: string } {
  return {
    messageId,
    body: JSON.stringify(payload),
  };
}

const mockOctokit = {} as unknown;
const mockSecrets = { runnerLevel: 'repo' as const };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.WARM_CONFIG_HASHES = VALID_CONFIG_HASH;
  process.env.STEP_FUNCTION_ARN = 'arn:aws:states:us-east-1:123456789012:stateMachine:test';
  process.env.WARM_RUNNER_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/warm-runner-queue';
  mockGetAppOctokit.mockResolvedValue(null);
  mockGetOctokit.mockResolvedValue({ octokit: mockOctokit, githubSecrets: mockSecrets });
});

describe('warm-runner-manager.lambda handler', () => {
  describe('keeper messages', () => {
    test('deadline expired - stops and deletes runner, acknowledges message', async () => {
      jest.useFakeTimers();
      const pastDeadline = Date.now() - 1000;
      jest.setSystemTime(pastDeadline + 500);

      const message = createKeeperMessage({ absoluteDeadline: pastDeadline });
      const event = createSqsEvent([createKeeperSqsRecord(message)]);

      mockSfnSend.mockResolvedValue(undefined);
      mockGetRunner.mockResolvedValue({ id: 123, busy: false });
      mockDeleteRunner.mockResolvedValue(undefined);

      const result = await handler(event);

      expect(result.batchItemFailures).toEqual([]);
      expect(mockSfnSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            executionArn: EXECUTION_ARN,
            error: 'WarmRunnerExpired',
          }),
        }),
      );
      expect(mockGetRunner).toHaveBeenCalledWith(mockOctokit, 'repo', 'my-org', 'my-repo', 'warm-runner-1');
      expect(mockDeleteRunner).toHaveBeenCalledWith(mockOctokit, 'repo', 'my-org', 'my-repo', 123);

      jest.useRealTimers();
    });

    test('config hash mismatch - calls discardStaleRunner and acknowledges message', async () => {
      const message = createKeeperMessage({ configHash: 'stale-hash' });
      process.env.WARM_CONFIG_HASHES = VALID_CONFIG_HASH;
      const event = createSqsEvent([createKeeperSqsRecord(message)]);

      mockSfnSend.mockResolvedValue(undefined);
      mockGetRunner.mockResolvedValue({ id: 123, busy: false });
      mockDeleteRunner.mockResolvedValue(undefined);

      const result = await handler(event);

      expect(result.batchItemFailures).toEqual([]);
      expect(mockSfnSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            executionArn: EXECUTION_ARN,
            error: 'StaleWarmRunner',
          }),
        }),
      );
      expect(mockGetRunner).toHaveBeenCalledWith(mockOctokit, 'repo', 'my-org', 'my-repo', 'warm-runner-1');
      expect(mockDeleteRunner).toHaveBeenCalledWith(mockOctokit, 'repo', 'my-org', 'my-repo', 123);
    });

    test('step function finished - starts replacement and acknowledges message', async () => {
      const message = createKeeperMessage();
      const event = createSqsEvent([createKeeperSqsRecord(message)]);

      mockSfnSend
        .mockResolvedValueOnce({ status: 'SUCCEEDED' })
        .mockResolvedValueOnce({ executionArn: 'arn:aws:states:us-east-1:123456789012:execution:test:new-runner' });
      mockGetRunner.mockResolvedValue({ id: 123, busy: false });
      mockSqsSend.mockResolvedValue({});

      const result = await handler(event);

      expect(result.batchItemFailures).toEqual([]);
      expect(mockSfnSend).toHaveBeenCalledTimes(2);
      expect(mockSfnSend).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          input: expect.objectContaining({
            executionArn: EXECUTION_ARN,
          }),
        }),
      );
      expect(mockSfnSend).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: expect.objectContaining({
            stateMachineArn: process.env.STEP_FUNCTION_ARN,
            name: expect.any(String),
          }),
        }),
      );
      expect(mockSqsSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            QueueUrl: process.env.WARM_RUNNER_QUEUE_URL,
            MessageBody: expect.stringContaining('"executionArn":"arn:aws:states:us-east-1:123456789012:execution:test:new-runner"'),
          }),
        }),
      );
    });

    test('runner busy - starts replacement and acknowledges message', async () => {
      const message = createKeeperMessage();
      const event = createSqsEvent([createKeeperSqsRecord(message)]);

      mockSfnSend
        .mockResolvedValueOnce({ status: 'RUNNING' })
        .mockResolvedValueOnce({ executionArn: 'arn:aws:states:us-east-1:123456789012:execution:test:new-runner' });
      mockGetRunner.mockResolvedValue({ id: 123, busy: true });
      mockSqsSend.mockResolvedValue({});

      const result = await handler(event);

      expect(result.batchItemFailures).toEqual([]);
      expect(mockSfnSend).toHaveBeenCalledTimes(2);
      expect(mockSqsSend).toHaveBeenCalled();
    });

    test('runner not found yet - retries later', async () => {
      const message = createKeeperMessage();
      const event = createSqsEvent([createKeeperSqsRecord(message, 'msg-retry')]);

      mockSfnSend.mockResolvedValue({ status: 'RUNNING' });
      mockGetRunner.mockResolvedValue(null);

      const result = await handler(event);

      expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-retry' }]);
      expect(mockSfnSend).toHaveBeenCalledTimes(1);
      expect(mockSqsSend).not.toHaveBeenCalled();
    });

    test('still idle within deadline - retries later', async () => {
      const message = createKeeperMessage();
      const event = createSqsEvent([createKeeperSqsRecord(message, 'msg-idle')]);

      mockSfnSend.mockResolvedValue({ status: 'RUNNING' });
      mockGetRunner.mockResolvedValue({ id: 123, busy: false });

      const result = await handler(event);

      expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-idle' }]);
      expect(mockSfnSend).toHaveBeenCalledTimes(1);
      expect(mockSqsSend).not.toHaveBeenCalled();
    });
  });

  describe('fill messages', () => {
    test('fill payload - starts runners and enqueues keeper messages', async () => {
      const fillPayload: WarmRunnerFillPayload = {
        action: 'fill',
        providerPath: '/stack/Provider',
        providerLabels: ['linux'],
        count: 2,
        duration: 3600,
        owner: 'my-org',
        repo: 'my-repo',
        configHash: VALID_CONFIG_HASH,
      };
      const event = createSqsEvent([createFillSqsRecord(fillPayload)]);

      mockSfnSend.mockResolvedValue({ executionArn: 'arn:aws:states:us-east-1:123456789012:execution:test:warm-1' });
      mockSqsSend.mockResolvedValue({});

      const result = await handler(event);

      expect(result.batchItemFailures).toEqual([]);
      expect(mockSfnSend).toHaveBeenCalledTimes(2);
      expect(mockSqsSend).toHaveBeenCalledTimes(2);
      expect(mockGetAppOctokit).toHaveBeenCalled();
    });
  });

  describe('custom resource', () => {
    test('Create/Update - runs filler and responds with SUCCESS', async () => {
      const event: AWSLambda.CloudFormationCustomResourceEvent = {
        RequestType: 'Create',
        ResponseURL: 'https://example.com',
        StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test/123',
        RequestId: 'test-request-id',
        ResourceType: 'Custom::WarmRunnerFill',
        LogicalResourceId: 'WarmRunnerFill',
        PhysicalResourceId: undefined,
        ResourceProperties: {
          action: 'fill',
          providerPath: '/stack/Provider',
          providerLabels: ['linux'],
          count: 1,
          duration: 86400,
          owner: 'my-org',
          repo: '',
          configHash: VALID_CONFIG_HASH,
        },
        ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:test',
      };

      mockSfnSend.mockResolvedValue({ executionArn: 'arn:aws:states:us-east-1:123456789012:execution:test:warm-1' });
      mockSqsSend.mockResolvedValue({});

      await handler(event);

      expect(mockCustomResourceRespond).toHaveBeenCalledWith(event, 'SUCCESS', 'OK', 'WarmRunnerFill', {});
      expect(mockSfnSend).toHaveBeenCalled();
      expect(mockSqsSend).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    test('invalid JSON body - skips message and continues', async () => {
      const validMessage = createKeeperMessage();
      const event = createSqsEvent([
        { body: 'not valid json', messageId: 'msg-bad' },
        createKeeperSqsRecord(validMessage, 'msg-good'),
      ]);

      mockSfnSend.mockResolvedValue({ status: 'RUNNING' });
      mockGetRunner.mockResolvedValue({ id: 123, busy: false });

      const result = await handler(event);

      expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-good' }]);
      expect(mockSfnSend).toHaveBeenCalledTimes(1);
    });

    test('unknown event type - logs and returns', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await handler({ foo: 'bar' } as unknown as AWSLambda.SQSEvent);

      expect(result).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.objectContaining({ notice: 'Unknown event type; ignoring', event: { foo: 'bar' } }),
      );

      consoleSpy.mockRestore();
    });
  });
});
