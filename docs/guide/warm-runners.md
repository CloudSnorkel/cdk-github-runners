# Warm Runners

Warm runners are pre-provisioned and stay idle until a job arrives, reducing startup latency. Use [`AlwaysOnWarmRunner`](/api/AlwaysOnWarmRunner) for 24/7 pools or [`ScheduledWarmRunner`](/api/ScheduledWarmRunner) for time-windowed pools. You specify the provider directly.

```typescript
import { AlwaysOnWarmRunner, CodeBuildRunnerProvider, GitHubRunners } from '@cloudsnorkel/cdk-github-runners';

const provider = new CodeBuildRunnerProvider(this, 'provider', { labels: ['codebuild', 'linux'] });
const runners = new GitHubRunners(this, 'runners', { providers: [provider] });

new AlwaysOnWarmRunner(this, 'warm', {
  runners,
  provider,
  count: 2,
  owner: 'my-org',
  repo: 'my-repo',
});
```

Warm runner pools can be stacked. If you want 2 warm runners always available but 3 during peak work hours, you can create one pool with 2 runners always on and another pool with 1 runner during work hours.

```typescript
import { aws_events as events, Duration } from 'aws-cdk-lib';
import { AlwaysOnWarmRunner, ScheduledWarmRunner, CodeBuildRunnerProvider, GitHubRunners } from '@cloudsnorkel/cdk-github-runners';

const provider = new CodeBuildRunnerProvider(this, 'provider', { labels: ['codebuild', 'linux'] });
const runners = new GitHubRunners(this, 'runners', { providers: [provider] });

new AlwaysOnWarmRunner(this, 'warm', {
  runners,
  provider,
  count: 2,
  owner: 'my-org',
  repo: 'my-repo',
});

new ScheduledWarmRunner(this, 'work hours warm', {
  runners,
  provider,
  count: 1,
  owner: 'my-org',
  repo: 'my-repo',
  schedule: events.Schedule.cron({ hour: '13', minute: '0', weekDay: 'MON-FRI' }),
  duration: Duration.hours(2),
});
```

See the [warm-runners example](https://github.com/CloudSnorkel/cdk-github-runners/tree/main/examples/typescript/warm-runners/) for a complete setup.
