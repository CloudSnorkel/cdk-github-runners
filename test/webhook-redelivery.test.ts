import { WebhookDelivery, WebhookDeliveryDetail } from '../src/lambda-github';
import { shouldRedeliver } from '../src/webhook-redelivery.lambda';

const WEBHOOK_DELIVERY = {
  "id": 1001,
  "guid": "1c27c573-3889-4501-a279-b788794f4876",
  "delivered_at": "2025-06-23T00:21:41Z",
  "redelivery": false,
  "duration": 0.73,
  "status": "502 Bad Gateway",
  "status_code": 502,
  "event": "workflow_job",
  "action": "queued",
  "installation_id": 12345,
  "repository_id": 23456,
  "throttled_at": null
} satisfies WebhookDelivery;

const WORKFLOW_JOB = {
  "id": 2001,
  "run_id": 3001,
  "status": "queued",
  "conclusion": null,
  "created_at": "2025-06-23T00:21:40Z",
  "started_at": "2025-06-23T00:21:40Z",
  "completed_at": null,
  "labels": [
    "self-hosted",
    "ubuntu-codebuild-large"
  ]
};

const WEBHOOK_DELIVERY_DETAIL: WebhookDeliveryDetail = {
  ...WEBHOOK_DELIVERY,
  "request": {
    "headers": {},
    "payload": {
      "action": "queued",
      "workflow_job": WORKFLOW_JOB
    }
  },
  "response": {
    "headers": {},
    "payload": "Internal Server Error"
  }
};

let mockedGetDeliveryDetail = Promise.resolve(WEBHOOK_DELIVERY_DETAIL);
jest.mock('../src/lambda-github', () => ({
  getDeliveryDetail: jest.fn().mockImplementation(() => mockedGetDeliveryDetail),
}));

describe('shouldRedeliver', () => {
  const octokit = {} as any; // Mock Octokit

  beforeEach(() => {
    mockedGetDeliveryDetail = Promise.resolve(WEBHOOK_DELIVERY_DETAIL);
  });

  it('should return true for a delivery that failed the first time', async () => {
    expect(await shouldRedeliver(octokit, WEBHOOK_DELIVERY)).toBe(true);
  });

  it('should return false when action is not queued', async () => {
    const delivery = { ...WEBHOOK_DELIVERY, action: 'completed' };

    expect(await shouldRedeliver(octokit, delivery)).toBe(false);
  });

  it('should return false for a non-workflow_job event', async () => {
    const delivery = { ...WEBHOOK_DELIVERY, event: 'installation_repositories', action: 'added' };

    expect(await shouldRedeliver(octokit, delivery)).toBe(false);
  });

  it('should return false when job does not request for self-hosted runner', async () => {
    const deliveryDetail: WebhookDeliveryDetail = {
      ...WEBHOOK_DELIVERY_DETAIL,
      request: {
        ...WEBHOOK_DELIVERY_DETAIL.request,
        payload: {
          ...WEBHOOK_DELIVERY_DETAIL.request.payload,
          workflow_job: {
            ...WORKFLOW_JOB,
            "labels": ["ubuntu-latest"]
          }
        }
      }
    };
    mockedGetDeliveryDetail = Promise.resolve(deliveryDetail);

    expect(await shouldRedeliver(octokit, WEBHOOK_DELIVERY)).toBe(false);
  });

  it('should return false for a redelivery of a job that started more than 30 minutes ago', async () => {
    const deliveryDetail: WebhookDeliveryDetail = {
      ...WEBHOOK_DELIVERY_DETAIL,
      redelivery: true,
      request: {
        ...WEBHOOK_DELIVERY_DETAIL.request,
        payload: {
          ...WEBHOOK_DELIVERY_DETAIL.request.payload,
          workflow_job: {
            ...WORKFLOW_JOB,
            started_at: "2025-06-22T23:51:40Z"
          }
        }
      }
    };
    mockedGetDeliveryDetail = Promise.resolve(deliveryDetail);

    expect(await shouldRedeliver(octokit, { ...WEBHOOK_DELIVERY, redelivery: true })).toBe(false);
  });

  it('should return false for a delivery with unexpected payload', async () => {
    const invalidDeliveryDetail: WebhookDeliveryDetail = {
      ...WEBHOOK_DELIVERY_DETAIL,
      request: {
        ...WEBHOOK_DELIVERY_DETAIL.request,
        payload: {}
      }
    };
    mockedGetDeliveryDetail = Promise.resolve(invalidDeliveryDetail);

    expect(await shouldRedeliver(octokit, WEBHOOK_DELIVERY)).toBe(false);
  });
});
