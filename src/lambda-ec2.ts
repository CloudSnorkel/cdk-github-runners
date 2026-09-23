import { DescribeInstancesCommand, DescribeInstancesCommandOutput, EC2Client, Instance, TerminateInstancesCommand } from '@aws-sdk/client-ec2';
import { ReservedTags } from './lambda-common';

const ec2 = new EC2Client();

function tagValue(instance: Instance, key: string): string | undefined {
  return instance.Tags?.find(t => t.Key === key)?.Value;
}

/**
 * Terminate any instance still running for a given runner.
 *
 * EC2 runners terminate themselves by calling `poweroff` at the end of their user data script, with `InstanceInitiatedShutdownBehavior=terminate`
 * turning that into a termination. When the user data script never runs (e.g. IMDS not serving it at boot, the OOM killer taking the shell, a wedged
 * `poweroff`) nothing else in the stack cleans the instance up, and it runs until a human notices it.
 *
 * Instances are found by {@link ReservedTags.RUNNER} and {@link ReservedTags.STACK}. The tags have reserved prefix and contains the step function
 * execution name which also matches the runner name on GitHub Actions. Step function execution names are unique for 90 days and runner names are also
 * unique within their registration scope. This allows us to only terminate instances that were launched by us for this specific runner.
 *
 * Call this only from places that already know the runner is finished with like the step function's failure path, or the idle reaper once it has
 * decided a runner is done. Never call it while a runner may still be working. We have no way to tell a busy instance apart from an idle or broken
 * instance.
 *
 * Best effort: a failure is logged and swallowed, because the callers are cleanup paths whose own failure would mask the error that got us there. An
 * instance we miss is an instance that would have been missed anyway before this existed.
 *
 * @param runnerName runner name, which is also the step function execution name
 * @returns ids of the instances we asked to terminate
 *
 * @internal
 */
export async function terminateRunnerInstances(runnerName: string): Promise<string[]> {
  const stackName = process.env.STACK_NAME;
  if (!stackName) {
    console.error({
      notice: 'Missing STACK_NAME environment variable, cannot terminate runner instances',
      runnerName,
    });
    return [];
  }

  try {
    let nextToken: string | undefined = undefined;
    const ids = [];

    do {
      const described: DescribeInstancesCommandOutput = await ec2.send(new DescribeInstancesCommand({
        Filters: [
          { Name: `tag:${ReservedTags.RUNNER}`, Values: [runnerName] },
          { Name: `tag:${ReservedTags.STACK}`, Values: [stackName] },
          // anything not already on its way out. a runner should never be stopped, but if one somehow is, it still holds an EBS volume we are paying for
          { Name: 'instance-state-name', Values: ['pending', 'running', 'stopping', 'stopped'] },
        ],
        NextToken: nextToken,
      }));

      const instances = (described.Reservations ?? []).flatMap(r => r.Instances ?? []);

      // re-check the tag ourselves instead of trusting the filter. terminating someone else's instance would be far worse than leaving one of ours
      // behind, so this is worth the few lines
      ids.push(...instances
        .filter(i => tagValue(i, ReservedTags.RUNNER) === runnerName)
        .filter(i => tagValue(i, ReservedTags.STACK) === stackName)
        .map(i => i.InstanceId)
        .filter((id): id is string => !!id));

      nextToken = described.NextToken;
    } while (nextToken);

    if (ids.length === 0) {
      return [];
    }

    console.log({
      notice: 'Terminating runner instances that outlived their job',
      runnerName,
      instanceIds: ids,
    });

    await ec2.send(new TerminateInstancesCommand({ InstanceIds: ids }));

    return ids;
  } catch (e) {
    console.error({
      notice: 'Failed to terminate leftover runner instances',
      runnerName,
      error: e,
    });
    return [];
  }
}
