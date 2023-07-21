import { verifyBody } from '../src/webhook-handler.lambda';

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
    verifyBody(
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
    verifyBody(
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
});
