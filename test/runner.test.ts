import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2, aws_ecr as ecr } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import { CodeBuildRunnerProvider, CompositeProvider, GitHubRunners, LambdaRunnerProvider, StaticRunnerImage } from '../src';

let app: cdk.App;
let stack: cdk.Stack;

describe('GitHubRunners', () => {
  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'test');
  });

  test('Create GithubRunners with state machine logging enabled', () => {
    new GitHubRunners(stack, 'runners', {
      providers: [new LambdaRunnerProvider(stack, 'p1')],
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

  test('Duplicate labels error with composite providers', () => {
    const p1 = new CodeBuildRunnerProvider(stack, 'p1', { labels: ['a'] });
    const p1b = new CodeBuildRunnerProvider(stack, 'p1b', { labels: ['a'] });
    const p2 = new CodeBuildRunnerProvider(stack, 'p2', { labels: ['a'] });
    const composite = CompositeProvider.fallback(stack, 'composite', [p1, p1b]);

    expect(() => {
      new GitHubRunners(stack, 'runners', {
        providers: [p2, composite],
      });
    }).toThrow('Both test/p2 and test/composite use the same labels [a]');
  });

  test('Duplicate labels error between composite providers', () => {
    const p1 = new CodeBuildRunnerProvider(stack, 'p1', { labels: ['a'] });
    const p1b = new CodeBuildRunnerProvider(stack, 'p1b', { labels: ['a'] });
    const p2 = new CodeBuildRunnerProvider(stack, 'p2', { labels: ['a'] });
    const p2b = new CodeBuildRunnerProvider(stack, 'p2b', { labels: ['a'] });
    const composite1 = CompositeProvider.fallback(stack, 'composite1', [p1, p1b]);
    const composite2 = CompositeProvider.fallback(stack, 'composite2', [p2, p2b]);

    expect(() => {
      new GitHubRunners(stack, 'runners', {
        providers: [composite1, composite2],
      });
    }).toThrow('Both test/composite1 and test/composite2 use the same labels [a]');
  });

  test('Intersecting labels warning with composite providers', () => {
    const p1 = new CodeBuildRunnerProvider(stack, 'p1', { labels: ['a'] });
    const p1b = new CodeBuildRunnerProvider(stack, 'p1b', { labels: ['a'] });
    const p2 = new CodeBuildRunnerProvider(stack, 'p2', { labels: ['a', 'b'] });
    const composite = CompositeProvider.fallback(stack, 'composite', [p1, p1b]);

    new GitHubRunners(stack, 'runners', {
      providers: [p2, composite],
    });

    Annotations.fromStack(stack).hasWarning(
      '/test/composite',
      Match.stringLikeRegexp('Labels \\[a\\] intersect with another provider \\(test/p2 -- \\[a, b\\]\\).*'),
    );
  });

  test('Metric filters include all sub-providers from fallback composite', () => {
    const p1 = new CodeBuildRunnerProvider(stack, 'p1', { labels: ['test'] });
    const p2 = new LambdaRunnerProvider(stack, 'p2', { labels: ['test'] });
    const p3 = new CodeBuildRunnerProvider(stack, 'p3', { labels: ['other'] });
    const composite = CompositeProvider.fallback(stack, 'composite', [p1, p2]);

    const runners = new GitHubRunners(stack, 'runners', {
      providers: [p3, composite],
    });

    runners.metricJobCompleted();

    const template = Template.fromStack(stack);

    // Should have 3 metric filters: one for p1, p2 (from composite), and p3
    template.resourceCountIs(
      'AWS::Logs::MetricFilter',
      3,
    );
  });

  test('Metric filters include all sub-providers from distributed composite', () => {
    const p1 = new CodeBuildRunnerProvider(stack, 'p1', { labels: ['test'] });
    const p2 = new LambdaRunnerProvider(stack, 'p2', { labels: ['test'] });
    const p3 = new CodeBuildRunnerProvider(stack, 'p3', { labels: ['other'] });
    const composite = CompositeProvider.distribute(stack, 'composite', [
      { provider: p1, weight: 1 },
      { provider: p2, weight: 2 },
    ]);

    const runners = new GitHubRunners(stack, 'runners', {
      providers: [p3, composite],
    });

    runners.metricJobCompleted();

    const template = Template.fromStack(stack);

    // Should have 3 metric filters: one for p1, p2 (from composite), and p3
    template.resourceCountIs(
      'AWS::Logs::MetricFilter',
      3,
    );
  });

  test('Metric filters include all unique sub-providers from multiple composites', () => {
    // Create providers with same labels for each composite (required by composite validation)
    const p1 = new CodeBuildRunnerProvider(stack, 'p1', { labels: ['composite1'] });
    const p2 = new LambdaRunnerProvider(stack, 'p2', { labels: ['composite1'] });
    const p3 = new CodeBuildRunnerProvider(stack, 'p3', { labels: ['composite2'] });
    const p4 = new CodeBuildRunnerProvider(stack, 'p4', { labels: ['composite2'] });
    const p5 = new CodeBuildRunnerProvider(stack, 'p5', { labels: ['other'] });

    // Create composites with different labels to avoid duplicate label errors
    const composite1 = CompositeProvider.fallback(stack, 'composite1', [p1, p2]);
    const composite2 = CompositeProvider.fallback(stack, 'composite2', [p3, p4]);

    const runners = new GitHubRunners(stack, 'runners', {
      providers: [p5, composite1, composite2],
    });

    runners.metricJobCompleted();

    const template = Template.fromStack(stack);

    // Should have exactly 5 metric filters (p1, p2 from composite1, p3, p4 from composite2, and p5)
    template.resourceCountIs(
      'AWS::Logs::MetricFilter',
      5,
    );
  });

  test('Metric filters work with mixed regular and composite providers', () => {
    const p1 = new CodeBuildRunnerProvider(stack, 'p1', { labels: ['a'] });
    const p2 = new LambdaRunnerProvider(stack, 'p2', { labels: ['b'] });
    const p3 = new CodeBuildRunnerProvider(stack, 'p3', { labels: ['test'] });
    const p4 = new LambdaRunnerProvider(stack, 'p4', { labels: ['test'] });
    const composite = CompositeProvider.fallback(stack, 'composite', [p3, p4]);

    const runners = new GitHubRunners(stack, 'runners', {
      providers: [p1, p2, composite],
    });

    runners.metricJobCompleted();

    const template = Template.fromStack(stack);

    // Should have 4 metric filters: p1, p2 (regular), p3, p4 (from composite)
    template.resourceCountIs(
      'AWS::Logs::MetricFilter',
      4,
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

  test('Management security group', () => {
    const vpc = new ec2.Vpc(stack, 'vpc');
    const sg = new ec2.SecurityGroup(stack, 'github sg', { vpc });

    const runners = new GitHubRunners(stack, 'runners', {
      providers: [new LambdaRunnerProvider(stack, 'p1')],
      vpc,
    });

    sg.connections.allowFrom(runners, ec2.Port.tcp(8888));

    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::EC2::SecurityGroup', 2);
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      SourceSecurityGroupId: {
        'Fn::GetAtt': [
          stack.getLogicalId(runners.connections.securityGroups[0].node.defaultChild as ec2.CfnSecurityGroup),
          'GroupId',
        ],
      },
      GroupId: {
        'Fn::GetAtt': [
          stack.getLogicalId(sg.node.defaultChild as ec2.CfnSecurityGroup),
          'GroupId',
        ],
      },
      FromPort: 8888,
      ToPort: 8888,
    });
  });

  test('Webhook PROVIDERS env var includes only top-level providers (not subproviders) with composites', () => {
    const p1 = new LambdaRunnerProvider(stack, 'p1', { labels: ['linux'] });
    const p2 = new LambdaRunnerProvider(stack, 'p2', { labels: ['linux'] });
    const composite = CompositeProvider.fallback(stack, 'composite', [p1, p2]);
    const p3 = new LambdaRunnerProvider(stack, 'p3', { labels: ['macos'] });

    new GitHubRunners(stack, 'runners', {
      providers: [composite, p3],
    });

    const template = Template.fromStack(stack);

    template.hasResource('AWS::Lambda::Function', {
      Properties: {
        Description: 'Handle GitHub webhook and start runner orchestrator',
        Environment: {
          Variables: {
            // The PROVIDERS env var should include only 'test/composite' and 'test/p3'
            PROVIDERS: JSON.stringify({
              'test/composite': ['linux'],
              'test/p3': ['macos'],
            }),
          },
        },
      },
    });
  });

  test('All management Lambda functions are in VPC when VPC is specified', () => {
    const vpc = new ec2.Vpc(stack, 'vpc');

    // Use CodeBuild provider which doesn't create Lambda functions
    // so all Lambda functions in the template are management functions
    new GitHubRunners(stack, 'runners', {
      providers: [new CodeBuildRunnerProvider(stack, 'p1', {
        // Use a static image builder that doesn't create Lambda functions
        imageBuilder: StaticRunnerImage.fromEcrRepository(ecr.Repository.fromRepositoryName(stack, 'image-builder', 'amazonlinux:2023')),
      })],
      vpc,
    });

    const template = Template.fromStack(stack);

    // Assert that all Lambda functions are in VPC
    template.allResourcesProperties('AWS::Lambda::Function', {
      VpcConfig: Match.objectLike({
        SubnetIds: Match.anyValue(),
        SecurityGroupIds: Match.anyValue(),
      }),
    });
  });
});
