import * as cdk from 'aws-cdk-lib';
import { aws_events as events } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AlwaysOnWarmRunner, CodeBuildRunnerProvider, CompositeProvider, GitHubRunners, LambdaRunnerProvider, ScheduledWarmRunner } from '../src';
import { cleanUp } from './test-utils';

let app: cdk.App;
let stack: cdk.Stack;

beforeEach(() => {
  app = new cdk.App();
  stack = new cdk.Stack(app, 'test');
});

afterEach(() => cleanUp(app));

describe('Warm runner validation', () => {
  test('org registration with repo throws', () => {
    const provider = new LambdaRunnerProvider(stack, 'p1');
    const runners = new GitHubRunners(stack, 'runners', { providers: [provider] });

    expect(() => {
      new AlwaysOnWarmRunner(stack, 'warm', {
        runners,
        provider,
        count: 1,
        owner: 'my-org',
        registrationLevel: 'org',
        repo: 'my-repo',
      });
    }).toThrow(/Do not specify repo when registrationLevel is 'org'/);
  });

  test('repo registration without repo throws', () => {
    const provider = new LambdaRunnerProvider(stack, 'p1');
    const runners = new GitHubRunners(stack, 'runners', { providers: [provider] });

    expect(() => {
      new AlwaysOnWarmRunner(stack, 'warm', {
        runners,
        provider,
        count: 1,
        owner: 'my-org',
        registrationLevel: 'repo',
      });
    }).toThrow(/repo is required when registrationLevel is 'repo'/);
  });

  test('provider not in providers list throws', () => {
    const p1 = new LambdaRunnerProvider(stack, 'p1');
    const p2 = new LambdaRunnerProvider(stack, 'p2', { labels: ['other'] });

    const runners = new GitHubRunners(stack, 'runners', {
      providers: [p1],
    });

    expect(() => {
      new AlwaysOnWarmRunner(stack, 'warm', {
        runners,
        provider: p2,
        count: 1,
        owner: 'my-org',
        registrationLevel: 'org',
      });
    }).toThrow(/not in the providers list/);
  });
});

describe('AlwaysOnWarmRunner', () => {
  test('creates queue, lambda, EventBridge rule, and custom resource for deployment-fill', () => {
    const provider = new LambdaRunnerProvider(stack, 'p1');

    const runners = new GitHubRunners(stack, 'runners', {
      providers: [provider],
    });

    new AlwaysOnWarmRunner(stack, 'warm', {
      runners,
      provider,
      count: 2,
      owner: 'my-org',
      registrationLevel: 'org',
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::SQS::Queue', {
      VisibilityTimeout: 60,
      RedrivePolicy: Match.absent(),
    });

    template.hasResourceProperties('AWS::SQS::Queue', Match.objectLike({
    }));

    template.hasResourceProperties('AWS::Lambda::Function', {
      Description: 'Manage warm GitHub runners: fill on invoke, keep alive via SQS',
      Timeout: 50,
    });

    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'cron(0 0 * * ? *)',
    });

    template.resourceCountIs('Custom::WarmRunnerFill', 1);
  });

  test('fill payload has 24h maxIdleSeconds', () => {
    const provider = new LambdaRunnerProvider(stack, 'p1');

    const runners = new GitHubRunners(stack, 'runners', {
      providers: [provider],
    });

    const warm = new AlwaysOnWarmRunner(stack, 'warm', {
      runners,
      provider,
      count: 3,
      owner: 'my-org',
      registrationLevel: 'org',
    });

    expect(warm._fillPayload.duration).toBe(86400);
    expect(warm._fillPayload.count).toBe(3);
    expect(warm._fillPayload.owner).toBe('my-org');
    expect(warm._fillPayload.repo).toBe('');
  });

  test('repo-level registration passes repo in payload', () => {
    const provider = new LambdaRunnerProvider(stack, 'p1');

    const runners = new GitHubRunners(stack, 'runners', {
      providers: [provider],
    });

    const warm = new AlwaysOnWarmRunner(stack, 'warm', {
      runners,
      provider,
      count: 1,
      owner: 'my-org',
      registrationLevel: 'repo',
      repo: 'my-repo',
    });

    expect(warm._fillPayload.repo).toBe('my-repo');
  });
});

describe('ScheduledWarmRunner', () => {
  test('does not create custom resource (no deployment-fill)', () => {
    const provider = new LambdaRunnerProvider(stack, 'p1');
    const runners = new GitHubRunners(stack, 'runners', { providers: [provider] });

    new ScheduledWarmRunner(stack, 'warm', {
      runners,
      provider,
      count: 2,
      owner: 'my-org',
      registrationLevel: 'org',
      schedule: events.Schedule.cron({ hour: '14', minute: '0' }),
      duration: cdk.Duration.hours(2),
    });

    const template = Template.fromStack(stack);
    const customResources = template.findResources('Custom::WarmRunnerFill');
    expect(Object.keys(customResources)).toHaveLength(0);
  });

  test('uses provided schedule and duration', () => {
    const provider = new LambdaRunnerProvider(stack, 'p1');

    const runners = new GitHubRunners(stack, 'runners', {
      providers: [provider],
    });

    const warm = new ScheduledWarmRunner(stack, 'warm', {
      runners,
      provider,
      count: 5,
      owner: 'my-org',
      registrationLevel: 'org',
      schedule: events.Schedule.cron({ hour: '13', minute: '0', weekDay: 'MON-FRI' }),
      duration: cdk.Duration.hours(2),
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'cron(0 13 ? * MON-FRI *)',
    });

    expect(warm._fillPayload.duration).toBe(7200);
    expect(warm._fillPayload.count).toBe(5);
  });
});

describe('Warm runners with composite providers', () => {
  test('composite fallback provider works', () => {
    const p1 = new CodeBuildRunnerProvider(stack, 'p1', { labels: ['linux'] });
    const p2 = new LambdaRunnerProvider(stack, 'p2', { labels: ['linux'] });
    const composite = CompositeProvider.fallback(stack, 'composite', [p1, p2]);

    const runners = new GitHubRunners(stack, 'runners', {
      providers: [composite],
    });

    const warm = new AlwaysOnWarmRunner(stack, 'warm', {
      runners,
      provider: composite,
      count: 2,
      owner: 'my-org',
      registrationLevel: 'org',
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'cron(0 0 * * ? *)',
    });

    expect(warm._fillPayload.providerPath).toBe(composite.node.path);
    expect(warm._fillPayload.providerLabels).toEqual(['linux']);
  });

  test('composite distribute provider works', () => {
    const p1 = new CodeBuildRunnerProvider(stack, 'p1', { labels: ['linux'] });
    const p2 = new LambdaRunnerProvider(stack, 'p2', { labels: ['linux'] });
    const composite = CompositeProvider.distribute(stack, 'composite', [
      { provider: p1, weight: 1 },
      { provider: p2, weight: 2 },
    ]);

    const runners = new GitHubRunners(stack, 'runners', {
      providers: [composite],
    });

    const warm = new ScheduledWarmRunner(stack, 'warm', {
      runners,
      provider: composite,
      count: 3,
      owner: 'my-org',
      registrationLevel: 'repo',
      repo: 'my-repo',
      schedule: events.Schedule.cron({ hour: '9', minute: '0' }),
      duration: cdk.Duration.hours(8),
    });

    expect(warm._fillPayload.providerPath).toBe(composite.node.path);
    expect(warm._fillPayload.duration).toBe(28800);
    expect(warm._fillPayload.repo).toBe('my-repo');
  });

  test('sub-provider of composite is rejected', () => {
    const p1 = new CodeBuildRunnerProvider(stack, 'p1', { labels: ['linux'] });
    const p2 = new LambdaRunnerProvider(stack, 'p2', { labels: ['linux'] });
    const composite = CompositeProvider.fallback(stack, 'composite', [p1, p2]);

    const runners = new GitHubRunners(stack, 'runners', {
      providers: [composite],
    });

    expect(() => {
      new AlwaysOnWarmRunner(stack, 'warm', {
        runners,
        provider: p1,
        count: 1,
        owner: 'my-org',
        registrationLevel: 'org',
      });
    }).toThrow(/not in the providers list/);
  });
});

describe('Warm runner infra is shared', () => {
  test('multiple warm runner constructs share one lambda and one queue', () => {
    const p1 = new CodeBuildRunnerProvider(stack, 'p1', { labels: ['a'] });
    const p2 = new LambdaRunnerProvider(stack, 'p2', { labels: ['b'] });

    const runners = new GitHubRunners(stack, 'runners', {
      providers: [p1, p2],
    });

    const warm1 = new AlwaysOnWarmRunner(stack, 'warm1', {
      runners,
      provider: p1,
      count: 2,
      owner: 'my-org',
      registrationLevel: 'org',
    });

    const warm2 = new ScheduledWarmRunner(stack, 'warm2', {
      runners,
      provider: p2,
      count: 1,
      owner: 'my-org',
      registrationLevel: 'repo',
      repo: 'my-repo',
      schedule: events.Schedule.cron({ hour: '14', minute: '0' }),
      duration: cdk.Duration.hours(1),
    });

    const template = Template.fromStack(stack);

    const lambdas = template.findResources('AWS::Lambda::Function', {
      Properties: {
        Description: 'Manage warm GitHub runners: fill on invoke, keep alive via SQS',
      },
    });
    expect(Object.keys(lambdas)).toHaveLength(1);

    const warmRules = template.findResources('AWS::Events::Rule', {
      Properties: {
        ScheduleExpression: Match.stringLikeRegexp('^cron\\('),
        Targets: Match.arrayWith([Match.objectLike({
          Input: Match.serializedJson(Match.objectLike({ action: 'fill' })),
        })]),
      },
    });
    expect(Object.keys(warmRules)).toHaveLength(2);

    expect(warm1._fillPayload.duration).toBe(86400);
    expect(warm2._fillPayload.duration).toBe(3600);
  });

  test('WARM_CONFIG_HASHES env var contains all config hashes', () => {
    const p1 = new CodeBuildRunnerProvider(stack, 'p1', { labels: ['a'] });
    const p2 = new LambdaRunnerProvider(stack, 'p2', { labels: ['b'] });

    const runners = new GitHubRunners(stack, 'runners', {
      providers: [p1, p2],
    });

    const warm1 = new AlwaysOnWarmRunner(stack, 'warm1', {
      runners,
      provider: p1,
      count: 2,
      owner: 'my-org',
      registrationLevel: 'org',
    });

    const warm2 = new ScheduledWarmRunner(stack, 'warm2', {
      runners,
      provider: p2,
      count: 1,
      owner: 'my-org',
      registrationLevel: 'repo',
      repo: 'my-repo',
      schedule: events.Schedule.cron({ hour: '14', minute: '0' }),
      duration: cdk.Duration.hours(1),
    });

    const template = Template.fromStack(stack);

    const lambdas = template.findResources('AWS::Lambda::Function', {
      Properties: {
        Description: 'Manage warm GitHub runners: fill on invoke, keep alive via SQS',
      },
    });
    const logicalId = Object.keys(lambdas)[0];
    const envVars = lambdas[logicalId].Properties.Environment.Variables;

    const hashes = envVars.WARM_CONFIG_HASHES.split(',');
    expect(hashes).toHaveLength(2);
    expect(hashes).toContain(warm1._fillPayload.configHash);
    expect(hashes).toContain(warm2._fillPayload.configHash);
    expect(hashes[0]).not.toBe(hashes[1]);
  });
});
