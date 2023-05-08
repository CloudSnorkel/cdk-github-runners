import * as cdk from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import { CodeBuildRunnerProvider, GitHubRunners } from '../src';

let app: cdk.App;
let stack: cdk.Stack;

describe('GitHubRunners', () => {
  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'test');
  });

  test('Create GithubRunners with state machine logging enabled', () => {
    new GitHubRunners(stack, 'runners', {
      providers: [],
      logOptions: {
        logRetention: 1,
        logGroupName: 'test',
      },
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties(
      'AWS::Logs::LogGroup',
      Match.objectLike({
        LogGroupName: 'test',
        RetentionInDays: 1,
      }),
    );
  });

  test('Intersecting labels warning', () => {
    new GitHubRunners(stack, 'runners', {
      providers: [
        new CodeBuildRunnerProvider(stack, 'p1', {
          labels: ['a'],
        }),
        new CodeBuildRunnerProvider(stack, 'p2', {
          labels: ['a', 'b'],
        }),
        new CodeBuildRunnerProvider(stack, 'p3', {
          labels: ['c'],
        }),
        new CodeBuildRunnerProvider(stack, 'p4', {
          labels: ['b'],
        }),
      ],
    });

    Annotations.fromStack(stack).hasWarning(
      '/test/p1',
      Match.stringLikeRegexp('Labels \\[a\\] intersect with another provider \\(test/p2 -- \\[a, b\\]\\).*'),
    );
    Annotations.fromStack(stack).hasNoWarning(
      '/test/p2',
      Match.anyValue(),
    );
    Annotations.fromStack(stack).hasNoWarning(
      '/test/p3',
      Match.anyValue(),
    );
    Annotations.fromStack(stack).hasWarning(
      '/test/p4',
      Match.stringLikeRegexp('Labels \\[b\\] intersect with another provider \\(test/p2 -- \\[a, b\\]\\).*'),
    );
  });

  test('Duplicate labels error', () => {
    expect(() => {
      new GitHubRunners(stack, 'runners', {
        providers: [
          new CodeBuildRunnerProvider(stack, 'p1', {
            labels: ['a'],
          }),
          new CodeBuildRunnerProvider(stack, 'p2', {
            labels: ['a'],
          }),
        ],
      });
    }).toThrow('Both test/p1 and test/p2 use the same labels [a]');
  });

  test('Metrics', () => {
    const runners = new GitHubRunners(stack, 'runners', {
      providers: [new CodeBuildRunnerProvider(stack, 'p1')],
    });

    // second time shouldn't add more filters (tested below)
    runners.metricJobCompleted();
    runners.metricJobCompleted();

    // just test these don't crash and burn
    runners.metricFailed();
    runners.metricSucceeded();
    runners.metricTime();

    const template = Template.fromStack(stack);

    template.resourceCountIs(
      'AWS::Logs::MetricFilter',
      1,
    );
  });

  test('Retry warnings', () => {
    new GitHubRunners(stack, 'no', {
      providers: [new CodeBuildRunnerProvider(stack, 'p1')],
    });
    new GitHubRunners(stack, 'yes', {
      providers: [new CodeBuildRunnerProvider(stack, 'p2')],
      retryOptions: {
        maxAttempts: 30,
      },
    });

    Annotations.fromStack(stack).hasNoWarning('/test/no', Match.anyValue());
    Annotations.fromStack(stack).hasWarning(
      '/test/yes',
      Match.stringLikeRegexp('Total retry time is greater than 24 hours \\(145 hours\\)\\. Jobs expire after 24 hours so it would be a waste of resources to retry further\\.'),
    );
  });
});
