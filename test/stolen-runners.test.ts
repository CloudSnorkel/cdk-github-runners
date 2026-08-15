import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { CodeBuildRunnerProvider, GitHubRunners } from '../src';

let app: cdk.App;
let stack: cdk.Stack;

describe('Stolen runner detection', () => {
  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'test');
  });

  afterAll(CloudAssembly.cleanupTemporaryDirectories);

  test('Enabled by default', () => {
    new GitHubRunners(stack, 'runners', {
      providers: [new CodeBuildRunnerProvider(stack, 'p1')],
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::DynamoDB::Table', Match.objectLike({
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
      BillingMode: 'PAY_PER_REQUEST',
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
    }));

    // queue with the default delay
    template.hasResourceProperties('AWS::SQS::Queue', Match.objectLike({
      DelaySeconds: 60,
    }));

    // the webhook records the jobs it starts runners for
    template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
      Description: 'Handle GitHub webhook and start runner orchestrator',
      Environment: {
        Variables: Match.objectLike({
          RUNNER_TRACKER_TABLE: Match.anyValue(),
          RUNNER_TRACKER_TTL_SECONDS: `${3 * 24 * 60 * 60}`,
        }),
      },
    }));

    // the handler reads back what a stolen runner was started for, so it can start another one just like it
    template.hasResourceProperties('AWS::IAM::Policy', Match.objectLike({
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({ Action: 'states:DescribeExecution' }),
        ]),
      }),
    }));
  });

  test('Runners report which job they were handed', () => {
    new GitHubRunners(stack, 'runners', {
      providers: [
        new CodeBuildRunnerProvider(stack, 'p1'),
        new CodeBuildRunnerProvider(stack, 'p2', { labels: ['other'] }),
      ],
    });

    const template = Template.fromStack(stack);

    // one filter per provider log group, but only one permission for all of them
    template.resourceCountIs('AWS::Logs::SubscriptionFilter', 2);
    template.hasResourceProperties('AWS::Logs::SubscriptionFilter', Match.objectLike({
      FilterPattern: 'CDKGHR JOB',
    }));
    const logsPermissions = template.findResources('AWS::Lambda::Permission', {
      Properties: Match.objectLike({ Principal: 'logs.amazonaws.com' }),
    });
    expect(Object.keys(logsPermissions)).toHaveLength(1);
  });

  test('Nothing is tracked per runner', () => {
    // a runner is identified by its step function execution, so nothing else has to write anything down
    const runners = new GitHubRunners(stack, 'runners', {
      providers: [new CodeBuildRunnerProvider(stack, 'p1')],
    });
    runners._ensureWarmRunnerInfra();

    Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
      Description: Match.stringLikeRegexp('Manage warm GitHub runners'),
      Environment: {
        Variables: Match.not(Match.objectLike({ RUNNER_TRACKER_TABLE: Match.anyValue() })),
      },
    }));
  });
});
