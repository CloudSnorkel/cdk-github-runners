const mockEc2Send = jest.fn();

jest.mock('@aws-sdk/client-ec2', () => ({
  EC2Client: jest.fn(() => ({ send: (...args: unknown[]) => mockEc2Send(...args) })),
  DescribeInstancesCommand: jest.fn(input => ({ command: 'DescribeInstances', input })),
  TerminateInstancesCommand: jest.fn(input => ({ command: 'TerminateInstances', input })),
}));

// Import after mocks are set up
import { ReservedTags } from '../src/lambda-common';
import { terminateRunnerInstances } from '../src/lambda-ec2';

const instance = (id: string, tags: Record<string, string>) => ({
  InstanceId: id,
  Tags: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
});

const ours = (id: string, runnerName = 'runner-1') => instance(id, { [ReservedTags.RUNNER]: runnerName, [ReservedTags.STACK]: 'test' });

const describeReturns = (...instances: unknown[]) => {
  mockEc2Send.mockImplementation((cmd: any) => {
    if (cmd.command === 'DescribeInstances') {
      return Promise.resolve({ Reservations: [{ Instances: instances }] });
    }
    return Promise.resolve({});
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

    const describe = mockEc2Send.mock.calls[0][0];
    expect(describe.input.Filters).toEqual([
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
    mockEc2Send.mockRejectedValue(new Error('UnauthorizedOperation'));

    await expect(terminateRunnerInstances('runner-1')).resolves.toEqual([]);

    expect(console.error).toHaveBeenCalled();
  });

  test('Swallows terminate failures', async () => {
    mockEc2Send.mockImplementation((cmd: any) => {
      if (cmd.command === 'DescribeInstances') {
        return Promise.resolve({ Reservations: [{ Instances: [ours('i-1')] }] });
      }
      return Promise.reject(new Error('UnauthorizedOperation'));
    });

    await expect(terminateRunnerInstances('runner-1')).resolves.toEqual([]);

    expect(console.error).toHaveBeenCalled();
  });

  test('Handles instances spread over several reservations', async () => {
    mockEc2Send.mockImplementation((cmd: any) => {
      if (cmd.command === 'DescribeInstances') {
        return Promise.resolve({ Reservations: [{ Instances: [ours('i-1')] }, { Instances: [ours('i-2')] }] });
      }
      return Promise.resolve({});
    });

    await expect(terminateRunnerInstances('runner-1')).resolves.toEqual(['i-1', 'i-2']);
  });
});
