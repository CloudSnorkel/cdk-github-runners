import { Octokit } from '@octokit/rest';
import { getAppOctokit, redeliver } from '../src/lambda-github';
import { clearFailuresCache, handler } from '../src/webhook-redelivery.lambda';

jest.mock('../src/lambda-github', () => ({
  getAppOctokit: jest.fn(),
  redeliver: jest.fn().mockResolvedValue(undefined),
}));

describe('webhook-redelivery.lambda handler', () => {
  const mockIterator = jest.fn();
  const mockOctokit = {
    paginate: {
      iterator: mockIterator,
    },
  } as unknown as Octokit;

  beforeEach(() => {
    jest.clearAllMocks();
    (getAppOctokit as jest.Mock).mockResolvedValue(mockOctokit);
    clearFailuresCache();
  });

  it('should skip if getAppOctokit returns null', async () => {
    (getAppOctokit as jest.Mock).mockResolvedValue(null);
    await handler();
    expect(mockIterator).not.toHaveBeenCalled();
    expect(redeliver).not.toHaveBeenCalled();
  });

  it('should redeliver failed deliveries (not redelivery, within 1 hour)', async () => {
    const now = new Date();
    mockIterator.mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          status: 200,
          data: [
            { id: 1, guid: 'g1', status: 'Failed', delivered_at: now.toISOString(), redelivery: false },
            { id: 2, guid: 'g2', status: 'OK', delivered_at: now.toISOString(), redelivery: false },
          ],
        };
      },
    }));
    await handler();
    expect(redeliver).toHaveBeenCalledTimes(1);
    expect(redeliver).toHaveBeenCalledWith(mockOctokit, 1);
  });

  it('should not redeliver successful deliveries', async () => {
    const now = new Date();
    mockIterator.mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          status: 200,
          data: [
            { id: 3, guid: 'g3', status: 'OK', delivered_at: now.toISOString(), redelivery: false },
          ],
        };
      },
    }));
    await handler();
    expect(redeliver).not.toHaveBeenCalled();
  });

  it('should redeliver if redelivery and within 1 hour of original failure', async () => {
    const now = new Date();
    // First run: original failure
    mockIterator.mockImplementationOnce(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          status: 200,
          data: [
            { id: 4, guid: 'g4', status: 'Failed', delivered_at: now.toISOString(), redelivery: false },
          ],
        };
      },
    }));
    await handler();
    // Second run: redelivery (should find original in failures map)
    mockIterator.mockImplementationOnce(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          status: 200,
          data: [
            { id: 5, guid: 'g4', status: 'Failed', delivered_at: now.toISOString(), redelivery: true },
          ],
        };
      },
    }));
    await handler();
    // Both original and redelivery should be called
    expect(redeliver).toHaveBeenCalledTimes(2);
    expect(redeliver).toHaveBeenCalledWith(mockOctokit, 4);
    expect(redeliver).toHaveBeenCalledWith(mockOctokit, 5);
  });

  it('should skip redelivery if original failure is older than 3 hours', async () => {
    const baseTime = Date.now();

    jest.useFakeTimers();

    const firstFailureTime = new Date(baseTime - 1000 * 60 * 60 * 4); // 4 hours ago
    const redeliveryFailureTime = new Date(baseTime - 1000 * 60 * 20); // 20 minutes ago

    // original delivery is within 30 minutes
    jest.setSystemTime(firstFailureTime.getTime() + 1000 * 60 * 10); // Set time to 10 minutes after first failure
    mockIterator.mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          status: 200,
          data: [
            { id: 6, guid: 'g5', status: 'Failed', delivered_at: firstFailureTime.toISOString(), redelivery: false },
          ],
        };
      },
    }));
    await handler();

    // redelivery failure over 3 hours after the original failure
    jest.setSystemTime(redeliveryFailureTime.getTime() + 1000 * 60 * 10); // Set time to 10 minutes after redelivery failure
    mockIterator.mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield {
          status: 200,
          data: [
            { id: 7, guid: 'g5', status: 'Failed', delivered_at: redeliveryFailureTime.toISOString(), redelivery: true },
          ],
        };
      },
    }));
    await handler();

    // Only the original should be redelivered, not the old redelivery
    expect(redeliver).toHaveBeenCalledTimes(1);
    expect(redeliver).toHaveBeenCalledWith(mockOctokit, 6);
  });

  it('should handle pagination and redeliver all failures', async () => {
    const now = new Date();
    mockIterator.mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield { status: 200, data: [{ id: 8, guid: 'g6', status: 'Failed', delivered_at: now.toISOString(), redelivery: false }] };
        yield { status: 200, data: [{ id: 9, guid: 'g7', status: 'Failed', delivered_at: now.toISOString(), redelivery: false }] };
      },
    }));
    await handler();
    expect(redeliver).toHaveBeenCalledTimes(2);
    expect(redeliver).toHaveBeenCalledWith(mockOctokit, 8);
    expect(redeliver).toHaveBeenCalledWith(mockOctokit, 9);
  });

  it('should throw if response status is not 200', async () => {
    mockIterator.mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield { status: 500, data: [] };
      },
    }));
    await expect(handler()).rejects.toThrow('Failed to fetch webhook deliveries');
  });

  it('should not redeliver already successful deliveries on lambda cold-start', async () => {
    // normal redelivery
    const now = new Date();
    mockIterator.mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield { status: 200, data: [{ id: 8, guid: 'g6', status: 'Failed', delivered_at: now.toISOString(), redelivery: false }] };
      },
    }));
    await handler();
    expect(redeliver).toHaveBeenCalledTimes(1);
    expect(redeliver).toHaveBeenCalledWith(mockOctokit, 8);

    // simulate cold-start
    clearFailuresCache();

    // second run should not redeliver the same delivery
    mockIterator.mockImplementation(() => ({
      [Symbol.asyncIterator]: async function* () {
        yield { status: 200, data: [{ id: 9, guid: 'g6', status: 'OK', delivered_at: now.toISOString(), redelivery: true }] };
        yield { status: 200, data: [{ id: 8, guid: 'g6', status: 'Failed', delivered_at: now.toISOString(), redelivery: false }] };
      },
    }));
    await handler();
    expect(redeliver).toHaveBeenCalledTimes(1); // should not redeliver the already processed delivery
  });
});
