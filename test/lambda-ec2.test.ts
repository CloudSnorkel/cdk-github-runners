const mockEc2Send = jest.fn();
const mockPaginateDescribeInstances = jest.fn();

jest.mock('@aws-sdk/client-ec2', () => ({
  EC2Client: jest.fn(() => ({ send: (...args: unknown[]) => mockEc2Send(...args) })),
  TerminateInstancesCommand: jest.fn(input => ({ command: 'TerminateInstances', input })),
  paginateDescribeInstances: (...args: unknown[]) => mockPaginateDescribeInstances(...args),
}));

// Import after mocks are set up
import { ReservedTags } from '../src/lambda-common';
import { terminateRunnerInstances } from '../src/lambda-ec2';

const instance = (id: string, tags: Record<string, string>) => ({
  InstanceId: id,
  Tags: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
});

const ours = (id: string, runnerName = 'runner-1') => instance(id, { [ReservedTags.RUNNER]: runnerName, [ReservedTags.STACK]: 'test' });

/** One page holding one reservation with all the given instances. */
const describeReturns = (...instances: unknown[]) => describePages([[instances]]);

/** Full control: an array of pages, each an array of reservations, each an array of instances. */
const describePages = (pages: unknown[][][]) => {
  mockPaginateDescribeInstances.mockImplementation(async function* () {
    for (const reservations of pages) {
      yield { Reservations: reservations.map(instances => ({ Instances: instances })) };
    }
  });
};

/** The paginator rejecting, which is what a describe failure looks like now. */
const describeThrows = (error: Error) => {
  mockPaginateDescribeInstances.mockImplementation(async function* () {
    throw error;
    // eslint-disable-next-line no-unreachable
    yield {};
  });
};

const terminateCalls = () => mockEc2Send.mock.calls
  .map(c => c[0])
  .filter((c: any) => c.command === 'TerminateInstances');

describe('terminateRunnerInstances', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.STACK_NAME = 'test';

    // clearAllMocks() clears calls but keeps implementations, so a test that makes send() reject would leak into
    // every test after it. reset both to a benign default instead of relying on each test to set them
    mockEc2Send.mockReset().mockResolvedValue({});
    mockPaginateDescribeInstances.mockReset();
    describeReturns();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Terminates instances left behind by a runner', async () => {
    describeReturns(ours('i-1'), ours('i-2'));

    await expect(terminateRunnerInstances('runner-1')).resolves.toEqual(['i-1', 'i-2']);

    expect(terminateCalls()).toEqual([{ command: 'TerminateInstances', input: { InstanceIds: ['i-1', 'i-2'] } }]);
  });

  test('Filters on the runner tag and on instances that are not already going away', async () => {
    describeReturns(ours('i-1'));

    await terminateRunnerInstances('runner-1');

    const [config, input] = mockPaginateDescribeInstances.mock.calls[0];
    expect(config.client).toBeDefined();
    expect(input.Filters).toEqual([
      { Name: `tag:${ReservedTags.RUNNER}`, Values: ['runner-1'] },
      { Name: `tag:${ReservedTags.STACK}`, Values: ['test'] },
      { Name: 'instance-state-name', Values: ['pending', 'running', 'stopping', 'stopped'] },
    ]);
  });

  // this is the one that matters. the describe filter should already have excluded all of these, but if it ever
  // doesn't -- a typo, an API change, a filter that quietly stops matching -- terminating an instance we don't own
  // is far worse than leaving one of ours behind
  test('Never terminates an instance that does not carry our tag for this runner', async () => {
    describeReturns(
      ours('i-mine'),
      instance('i-other-runner', { [ReservedTags.RUNNER]: 'runner-99', [ReservedTags.STACK]: 'test' }),
      // a user instance named after the runner. the Name tag is theirs to set, and it means nothing to us
      instance('i-user-same-name', { Name: 'runner-1' }),
      instance('i-user-lookalike-tag', { GitHubRunnersRunner: 'runner-1', Name: 'runner-1' }),
      instance('i-no-tags-at-all', {}),
    );

    await expect(terminateRunnerInstances('runner-1')).resolves.toEqual(['i-mine']);

    expect(terminateCalls()).toEqual([{ command: 'TerminateInstances', input: { InstanceIds: ['i-mine'] } }]);
  });

  test('Terminates nothing when there is nothing to terminate', async () => {
    describeReturns();

    await expect(terminateRunnerInstances('runner-1')).resolves.toEqual([]);

    expect(terminateCalls()).toEqual([]);
  });

  // callers are clean-up paths, and their own failure would mask the error that got us there
  test('Swallows describe failures', async () => {
    describeThrows(new Error('UnauthorizedOperation'));

    await expect(terminateRunnerInstances('runner-1')).resolves.toEqual([]);

    expect(console.error).toHaveBeenCalled();
  });

  test('Swallows terminate failures', async () => {
    describeReturns(ours('i-1'));
    mockEc2Send.mockRejectedValue(new Error('UnauthorizedOperation'));

    await expect(terminateRunnerInstances('runner-1')).resolves.toEqual([]);

    expect(console.error).toHaveBeenCalled();
  });

  test('Handles instances spread over several reservations', async () => {
    describePages([[[ours('i-1')], [ours('i-2')]]]);

    await expect(terminateRunnerInstances('runner-1')).resolves.toEqual(['i-1', 'i-2']);
  });

  // EC2 applies filters per page, so a page can come back empty with more pages behind it. stopping at the first
  // empty page would silently miss instances
  test('Collects instances across pages, including empty ones', async () => {
    describePages([
      [[ours('i-1')]],
      [[]],
      [[ours('i-2'), ours('i-3')]],
    ]);

    await expect(terminateRunnerInstances('runner-1')).resolves.toEqual(['i-1', 'i-2', 'i-3']);

    expect(terminateCalls()).toEqual([
      { command: 'TerminateInstances', input: { InstanceIds: ['i-1', 'i-2', 'i-3'] } },
    ]);
  });

  test('Terminates nothing when every page is empty', async () => {
    describePages([[[]], [[]]]);

    await expect(terminateRunnerInstances('runner-1')).resolves.toEqual([]);

    expect(terminateCalls()).toEqual([]);
  });

  // TerminateInstances rejects the whole call if it gets too many ids, so a single oversized call would leave every
  // one of them running
  test('Chunks termination into calls TerminateInstances will accept', async () => {
    const many = Array.from({ length: 250 }, (_, i) => ours(`i-${i}`));
    describePages([[many]]);

    const result = await terminateRunnerInstances('runner-1');

    expect(result).toHaveLength(250);
    expect(terminateCalls().map((c: any) => c.input.InstanceIds.length)).toEqual([100, 100, 50]);
    // every id is asked for exactly once, in order
    expect(terminateCalls().flatMap((c: any) => c.input.InstanceIds)).toEqual(result);
  });
});
