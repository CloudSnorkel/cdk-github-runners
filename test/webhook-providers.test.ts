// Mock AWS SDK clients before importing the handler
const mockCfnSend = jest.fn();

jest.mock('@aws-sdk/client-cloudformation', () => {
  const actual = jest.requireActual('@aws-sdk/client-cloudformation');
  return {
    ...actual,
    CloudFormationClient: jest.fn().mockImplementation(() => ({
      send: mockCfnSend,
    })),
  };
});

import { availableProviders, clearProvidersCache } from '../src/webhook-handler.lambda';

beforeEach(() => {
  clearProvidersCache();
  mockCfnSend.mockReset();
  process.env.STACK_NAME = 'test-stack';
  process.env.LOGICAL_ID = 'webhookhandler123';
});

afterEach(() => {
  delete process.env.STACK_NAME;
  delete process.env.LOGICAL_ID;
  delete process.env.PROVIDERS;
});

describe('availableProviders', () => {
  test('reads providers map from stack resource metadata', async () => {
    mockCfnSend.mockResolvedValue({
      StackResourceDetail: {
        Metadata: JSON.stringify({
          providers: {
            'Stack/P1': ['codebuild'],
            'Stack/P2': ['lambda'],
          },
        }),
      },
    });

    const providers = await availableProviders();

    expect(mockCfnSend).toHaveBeenCalledTimes(1);
    expect(mockCfnSend.mock.calls[0][0].input).toEqual({
      StackName: 'test-stack',
      LogicalResourceId: 'webhookhandler123',
    });
    expect(providers).toEqual({
      'Stack/P1': ['codebuild'],
      'Stack/P2': ['lambda'],
    });
  });

  test('caches the providers map between calls', async () => {
    mockCfnSend.mockResolvedValue({
      StackResourceDetail: {
        Metadata: JSON.stringify({ providers: { 'Stack/P1': ['codebuild'] } }),
      },
    });

    await availableProviders();
    await availableProviders();

    expect(mockCfnSend).toHaveBeenCalledTimes(1);
  });

  test('cache expires after TTL', async () => {
    mockCfnSend.mockResolvedValue({
      StackResourceDetail: {
        Metadata: JSON.stringify({ providers: { 'Stack/P1': ['codebuild'] } }),
      },
    });

    const realNow = Date.now;
    try {
      Date.now = jest.fn().mockReturnValue(1000000);
      await availableProviders();
      Date.now = jest.fn().mockReturnValue(1000000 + 61 * 1000);
      await availableProviders();
    } finally {
      Date.now = realNow;
    }

    expect(mockCfnSend).toHaveBeenCalledTimes(2);
  });

  test('throws when metadata is missing', async () => {
    mockCfnSend.mockResolvedValue({
      StackResourceDetail: {
        Metadata: JSON.stringify({}),
      },
    });

    await expect(availableProviders()).rejects.toThrow('Providers metadata is missing');
  });

  test('PROVIDERS environment variable overrides metadata for unit tests', async () => {
    process.env.PROVIDERS = JSON.stringify({ 'Stack/Test': ['test'] });

    const providers = await availableProviders();

    expect(mockCfnSend).not.toHaveBeenCalled();
    expect(providers).toEqual({ 'Stack/Test': ['test'] });
  });
});
