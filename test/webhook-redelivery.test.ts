import { Octokit } from '@octokit/rest';
import { getAppOctokit, redeliver } from '../src/lambda-github';
import { handler } from '../src/webhook-redelivery.lambda';

// Mock the imported modules
jest.mock('../src/lambda-github', () => ({
  getAppOctokit: jest.fn(),
  redeliver: jest.fn().mockResolvedValue(undefined),
}));

describe('webhook-redelivery lambda', () => {
  // Create a mock Octokit instance
  const mockIterator = jest.fn();
  const mockOctokit = {
    paginate: {
      iterator: mockIterator,
    },
  } as unknown as Octokit;

  beforeEach(() => {
    jest.clearAllMocks();
    (getAppOctokit as jest.Mock).mockResolvedValue(mockOctokit);
  });

  it('should call paginate.iterator with the correct endpoint', async () => {
    // Mock minimal successful response
    mockIterator.mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield { status: 200, data: [] };
      },
    }));

    await handler();

    expect(mockOctokit.paginate.iterator).toHaveBeenCalledWith('GET /app/hook/deliveries');
  });

  it('should redeliver failed deliveries within time limit', async () => {
    const now = new Date();

    // Mock webhook deliveries with one failure
    mockIterator.mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          status: 200,
          data: [
            {
              id: 1001,
              guid: 'guid-1',
              status: 'Failed',
              status_code: 502,
              delivered_at: now.toISOString(),
              redelivery: false,
            },
            {
              id: 1002,
              guid: 'guid-2',
              status: 'OK',
              status_code: 200,
              delivered_at: now.toISOString(),
              redelivery: false,
            },
          ],
        };
      },
    }));

    await handler();

    // Only the failed delivery should be redelivered
    expect(redeliver).toHaveBeenCalledTimes(1);
    expect(redeliver).toHaveBeenCalledWith(mockOctokit, 1001);
  });

  it('should handle pagination of webhook deliveries', async () => {
    const now = new Date();

    // Mock multiple pages of webhook deliveries
    mockIterator.mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          status: 200,
          data: [
            { id: 1001, guid: 'guid-1', status: 'Failed', status_code: 502, delivered_at: now.toISOString(), redelivery: false },
          ],
        };
        yield {
          status: 200,
          data: [
            { id: 1002, guid: 'guid-3', status: 'Failed', status_code: 502, delivered_at: now.toISOString(), redelivery: false },
          ],
        };
      },
    }));

    await handler();

    // Both failed deliveries should be redelivered
    expect(redeliver).toHaveBeenCalledTimes(2);
    expect(redeliver).toHaveBeenCalledWith(mockOctokit, 1001);
    expect(redeliver).toHaveBeenCalledWith(mockOctokit, 1002);
  });

  it('should stop paginating when finding deliveries older than the time limit', async () => {
    const now = new Date();
    const oldTime = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours old

    mockIterator.mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          status: 200,
          data: [
            { id: 1001, guid: 'guid-1', status: 'Failed', status_code: 502, delivered_at: now.toISOString(), redelivery: false },
            { id: 1002, guid: 'guid-2', status: 'Failed', status_code: 502, delivered_at: oldTime.toISOString(), redelivery: false },
          ],
        };
        // This page should never be requested
        yield {
          status: 200,
          data: [
            { id: 1003, guid: 'guid-3', status: 'Failed', status_code: 502, delivered_at: oldTime.toISOString(), redelivery: false },
          ],
        };
      },
    }));

    await handler();

    // Only the first delivery should be redelivered
    expect(redeliver).toHaveBeenCalledTimes(1);
    expect(redeliver).toHaveBeenCalledWith(mockOctokit, 1001);
  });

  it('should throw error if fetching webhook deliveries fails', async () => {
    mockIterator.mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield { status: 500, data: [] };
      },
    }));

    await expect(handler()).rejects.toThrow('Failed to fetch webhook deliveries');
  });
});
