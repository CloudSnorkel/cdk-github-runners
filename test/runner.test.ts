import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { GitHubRunners } from '../src';

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
});
