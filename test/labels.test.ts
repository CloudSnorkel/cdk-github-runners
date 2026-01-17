import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { CodeBuildRunnerProvider, FargateRunnerProvider, LambdaRunnerProvider } from '../src';
import { cleanUp } from './test-utils';

describe('Labels', () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'test');
  });

  afterEach(() => cleanUp(app));

  test('CodeBuild provider labels', () => {

    const defaultLabel = new CodeBuildRunnerProvider(stack, 'defaultLabel', {});
    expect(defaultLabel.labels).toStrictEqual(['codebuild']);

    const deprecatedLabel = new CodeBuildRunnerProvider(stack, 'deprecatedLabel', {
      label: 'hello',
    });
    expect(deprecatedLabel.labels).toStrictEqual(['hello']);

    const labels = new CodeBuildRunnerProvider(stack, 'labels', {
      labels: ['hello', 'world'],
    });
    expect(labels.labels).toStrictEqual(['hello', 'world']);

  // TODO test state machine definition
  });

  test('Lambda provider labels', () => {

    const defaultLabel = new LambdaRunnerProvider(stack, 'defaultLabel', {});
    expect(defaultLabel.labels).toStrictEqual(['lambda']);

    const deprecatedLabel = new LambdaRunnerProvider(stack, 'deprecatedLabel', {
      label: 'hello',
    });
    expect(deprecatedLabel.labels).toStrictEqual(['hello']);

    const labels = new LambdaRunnerProvider(stack, 'labels', {
      labels: ['hello', 'world'],
    });
    expect(labels.labels).toStrictEqual(['hello', 'world']);

  // TODO test state machine definition
  });

  test('Fargate provider labels', () => {

    const vpc = new ec2.Vpc(stack, 'vpc');
    const sg = new ec2.SecurityGroup(stack, 'sg', { vpc });

    const defaultLabel = new FargateRunnerProvider(stack, 'defaultLabel', {
      vpc: vpc,
      securityGroups: [sg],
    });
    expect(defaultLabel.labels).toStrictEqual(['fargate']);

    const deprecatedLabel = new FargateRunnerProvider(stack, 'deprecatedLabel', {
      label: 'hello',
      vpc: vpc,
      securityGroups: [sg],
    });
    expect(deprecatedLabel.labels).toStrictEqual(['hello']);

    const labels = new FargateRunnerProvider(stack, 'labels', {
      labels: ['hello', 'world'],
      vpc: vpc,
      securityGroups: [sg],
    });
    expect(labels.labels).toStrictEqual(['hello', 'world']);

  // TODO test state machine definition
  });
});
