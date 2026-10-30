import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { CodeBuildRunnerProvider, FargateRunnerProvider, LambdaRunnerProvider } from '../src';

describe('Labels', () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'test');
  });

  afterAll(CloudAssembly.cleanupTemporaryDirectories);

  test('CodeBuild provider labels', () => {

    const defaultLabel = new CodeBuildRunnerProvider(stack, 'defaultLabel', {});
    expect(defaultLabel.labels).toStrictEqual(['codebuild']);

    const labels = new CodeBuildRunnerProvider(stack, 'labels', {
      labels: ['hello', 'world'],
    });
    expect(labels.labels).toStrictEqual(['hello', 'world']);

  // TODO test state machine definition
  });

  test('Lambda provider labels', () => {

    const defaultLabel = new LambdaRunnerProvider(stack, 'defaultLabel', {});
    expect(defaultLabel.labels).toStrictEqual(['lambda']);

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

    const labels = new FargateRunnerProvider(stack, 'labels', {
      labels: ['hello', 'world'],
      vpc: vpc,
      securityGroups: [sg],
    });
    expect(labels.labels).toStrictEqual(['hello', 'world']);

  // TODO test state machine definition
  });
});
