import { ProviderSelectorResult } from '../src/webhook';
import * as webhook from '../src/webhook-handler.lambda';

const EMPTY_EVENT = {
  version: '2.0',
  routeKey: '$default',
  rawPath: '/',
  rawQueryString: '',
  cookies: [],
  queryStringParameters: {},
  requestContext: {
    accountId: '123456789012',
    apiId: 'api-id',
    domainName: 'id.execute-api.us-east-1.amazonaws.com',
    domainPrefix: 'id',
    http: {
      method: 'POST',
      path: '/my/path',
      protocol: 'HTTP/1.1',
      sourceIp: '192.0.2.1',
      userAgent: 'agent',
    },
    requestId: 'id',
    routeKey: '$default',
    stage: '$default',
    time: '12/Mar/2020:19:03:58 +0000',
    timeEpoch: 1583348638390,
  },
  pathParameters: {},
  isBase64Encoded: false,
  stageVariables: {},
};

test('Signature verification', () => {
  expect(() => {
    webhook.verifyBody(
      {
        ...EMPTY_EVENT,
        body: JSON.stringify({
          action: 'queued',
        }),
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'workflow_job',
          'x-hub-signature-256': 'bad',
        },
      },
      'bad',
    );
  }).toThrow('Signature mismatch');

  expect(
    webhook.verifyBody(
      {
        ...EMPTY_EVENT,
        body: JSON.stringify({
          action: 'queued',
        }),
        headers: {
          'content-type': 'application/json',
          'x-github-event': 'workflow_job',
          'x-hub-signature-256': 'sha256=57aa67ee965ce46922aa32fe939e794fbb6df5c93809bf46ed24fc13714a0506',
        },
      },
      'secret',
    ),
  ).toBe('{"action":"queued"}');

  const generatedName = webhook.generateExecutionName(
    {
      headers: {
        'content-type': 'application/json',
        'x-github-event': 'workflow_job',
        'x-hub-signature-256': 'sha256=57aa67ee965ce46922aa32fe939e794fbb6df5c93809bf46ed24fc13714a0506',
        'x-github-delivery': 'ea8a0021-6ba6-4986-9102-51c567e55733',
      },
    },
    {
      repository: { name: 'my-repo-name-that-is-very-long-and-should-be-truncated' },
    },
  );

  expect(generatedName).toHaveLength(64);
  expect(generatedName).toBe('my-repo-name-that-is-very-l-ea8a0021-6ba6-4986-9102-51c567e55733');
});

describe('selectProvider', () => {
  const mockPayload = {
    repository: { name: 'test-repo', owner: { login: 'test-owner' } },
    workflow_job: { id: 123, labels: ['self-hosted', 'linux'] },
  };

  beforeEach(() => {
    process.env.PROVIDERS = JSON.stringify({
      'Stack/Provider1': ['linux'],
      'Stack/Provider2': ['windows'],
    });
    delete process.env.PROVIDER_SELECTOR_ARN;
  });

  afterEach(() => {
    delete process.env.PROVIDERS;
    delete process.env.PROVIDER_SELECTOR_ARN;
  });

  test('returns default provider and labels when no selector configured', async () => {
    const result = await webhook.selectProvider(mockPayload, ['linux']);

    expect(result.provider).toBe('Stack/Provider1');
    expect(result.labels).toEqual(['linux']);
  });

  test('returns undefined provider when no match found', async () => {
    const result = await webhook.selectProvider(mockPayload, ['self-hosted', 'macos']);

    expect(result.provider).toBeUndefined();
    expect(result.labels).toBeUndefined();
  });

  test('handles case-insensitive label matching', async () => {
    const result = await webhook.selectProvider(mockPayload, ['SELF-HOSTED', 'LiNUX']);

    expect(result.provider).toBe('Stack/Provider1');
    expect(result.labels).toEqual(['linux']);
  });

  test('does not match provider with subset of labels', async () => {
    // Provider1 has ['self-hosted', 'linux']
    // Job requests ['self-hosted', 'linux', 'ubuntu'] - should not match
    const result = await webhook.selectProvider(mockPayload, ['self-hosted', 'linux', 'ubuntu']);

    expect(result.provider).toBeUndefined();
    expect(result.labels).toBeUndefined();
  });

  describe('with provider selector', () => {
    const mockCallProviderSelector = jest.fn();

    afterEach(() => {
      jest.clearAllMocks();
    });

    test('calls selector with correct input and uses result', async () => {
      const selectorResult: ProviderSelectorResult = {
        provider: 'Stack/Provider2',
        labels: ['windows', 'custom-label'],
      };
      mockCallProviderSelector.mockResolvedValue(selectorResult);

      const result = await webhook.selectProvider(mockPayload, ['linux'], mockCallProviderSelector);

      expect(mockCallProviderSelector).toHaveBeenCalledTimes(1);
      const [payload, providers, defaultSelection] = mockCallProviderSelector.mock.calls[0];
      expect(payload).toEqual(mockPayload);
      expect(providers).toEqual({
        'Stack/Provider1': ['linux'],
        'Stack/Provider2': ['windows'],
      });
      expect(defaultSelection.provider).toBe('Stack/Provider1');
      expect(defaultSelection.labels).toEqual(['linux']);

      expect(result.provider).toBe('Stack/Provider2');
      expect(result.labels).toEqual(['windows', 'custom-label']);
    });

    test('uses selector result with custom labels', async () => {
      const selectorResult: ProviderSelectorResult = {
        provider: 'Stack/Provider1',
        labels: ['linux', 'dynamic-branch', 'custom'],
      };
      mockCallProviderSelector.mockResolvedValue(selectorResult);

      const result = await webhook.selectProvider(mockPayload, ['linux'], mockCallProviderSelector);

      expect(result.provider).toBe('Stack/Provider1');
      expect(result.labels).toEqual(['linux', 'dynamic-branch', 'custom']);
    });

    test('returns undefined provider when selector returns undefined', async () => {
      const selectorResult: ProviderSelectorResult = {
        provider: undefined,
      };
      mockCallProviderSelector.mockResolvedValue(selectorResult);

      const result = await webhook.selectProvider(mockPayload, ['linux'], mockCallProviderSelector);

      expect(result.provider).toBeUndefined();
      expect(result.labels).toBeUndefined();
    });

    test('uses default selection when selector returns undefined', async () => {
      mockCallProviderSelector.mockResolvedValue(undefined);

      const result = await webhook.selectProvider(mockPayload, ['linux'], mockCallProviderSelector);

      expect(result.provider).toBe('Stack/Provider1');
      expect(result.labels).toEqual(['linux']);
    });

    test('selector can return default provider with modified labels', async () => {
      const selectorResult: ProviderSelectorResult = {
        provider: 'Stack/Provider1',
        labels: ['linux', 'modified'],
      };
      mockCallProviderSelector.mockResolvedValue(selectorResult);

      const result = await webhook.selectProvider(mockPayload, ['linux'], mockCallProviderSelector);

      expect(result.provider).toBe('Stack/Provider1');
      expect(result.labels).toEqual(['linux', 'modified']);
    });

    test('selector can choose different provider', async () => {
      const selectorResult: ProviderSelectorResult = {
        provider: 'Stack/Provider2',
        labels: ['windows'],
      };
      mockCallProviderSelector.mockResolvedValue(selectorResult);

      const result = await webhook.selectProvider(mockPayload, ['linux'], mockCallProviderSelector);

      expect(result.provider).toBe('Stack/Provider2');
      expect(result.labels).toEqual(['windows']);
    });

    test('throws error when selector throws an error', async () => {
      mockCallProviderSelector.mockRejectedValue(new Error('Internal Lambda failure'));

      await expect(webhook.selectProvider(mockPayload, ['linux'], mockCallProviderSelector))
        .rejects.toThrow('Internal Lambda failure');
    });

    test('throws error when selector returns non-existent provider', async () => {
      mockCallProviderSelector.mockResolvedValue({
        provider: 'Stack/NonExistentProvider',
        labels: ['custom'],
      });

      await expect(webhook.selectProvider(mockPayload, ['linux'], mockCallProviderSelector))
        .rejects.toThrow('Provider selector returned unknown provider Stack/NonExistentProvider');
    });

    test('throws error when selector returns empty labels array', async () => {
      const selectorResult: ProviderSelectorResult = {
        provider: 'Stack/Provider1',
        labels: [],
      };
      mockCallProviderSelector.mockResolvedValue(selectorResult);

      await expect(webhook.selectProvider(mockPayload, ['linux'], mockCallProviderSelector))
        .rejects.toThrow('Provider selector must return non-empty labels when provider is set');
    });

    test('throws error when selector returns provider without labels', async () => {
      const selectorResult: ProviderSelectorResult = {
        provider: 'Stack/Provider1',
      };
      mockCallProviderSelector.mockResolvedValue(selectorResult);

      await expect(webhook.selectProvider(mockPayload, ['linux'], mockCallProviderSelector))
        .rejects.toThrow('Provider selector must return non-empty labels when provider is set');
    });

    test('throws error when selector returns empty provider string', async () => {
      mockCallProviderSelector.mockResolvedValue({
        provider: '',
        labels: ['linux'],
      });

      await expect(webhook.selectProvider(mockPayload, ['linux'], mockCallProviderSelector))
        .rejects.toThrow('Provider selector returned empty provider');
    });
  });
});
