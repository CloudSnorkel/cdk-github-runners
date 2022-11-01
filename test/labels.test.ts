import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { CodeBuildRunner, FargateRunner, LambdaRunner } from '../src';

test('CodeBuild provider labels', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const defaultLabel = new CodeBuildRunner(stack, 'defaultLabel', {});
  expect(defaultLabel.labels).toStrictEqual(['codebuild']);

  const deprecatedLabel = new CodeBuildRunner(stack, 'deprecatedLabel', {
    label: 'hello',
  });
  expect(deprecatedLabel.labels).toStrictEqual(['hello']);

  const labels = new CodeBuildRunner(stack, 'labels', {
    labels: ['hello', 'world'],
  });
  expect(labels.labels).toStrictEqual(['hello', 'world']);

  // TODO test state machine definition
});

test('Lambda provider labels', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const defaultLabel = new LambdaRunner(stack, 'defaultLabel', {});
  expect(defaultLabel.labels).toStrictEqual(['lambda']);

  const deprecatedLabel = new LambdaRunner(stack, 'deprecatedLabel', {
    label: 'hello',
  });
  expect(deprecatedLabel.labels).toStrictEqual(['hello']);

  const labels = new LambdaRunner(stack, 'labels', {
    labels: ['hello', 'world'],
  });
  expect(labels.labels).toStrictEqual(['hello', 'world']);

  // TODO test state machine definition
});

test('Fargate provider labels', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const vpc = new ec2.Vpc(stack, 'vpc');
  const sg = new ec2.SecurityGroup(stack, 'sg', { vpc });

  const defaultLabel = new FargateRunner(stack, 'defaultLabel', {
    vpc: vpc,
    securityGroup: sg,
  });
  expect(defaultLabel.labels).toStrictEqual(['fargate']);

  const deprecatedLabel = new FargateRunner(stack, 'deprecatedLabel', {
    label: 'hello',
    vpc: vpc,
    securityGroup: sg,
  });
  expect(deprecatedLabel.labels).toStrictEqual(['hello']);

  const labels = new FargateRunner(stack, 'labels', {
    labels: ['hello', 'world'],
    vpc: vpc,
    securityGroup: sg,
  });
  expect(labels.labels).toStrictEqual(['hello', 'world']);

  // TODO test state machine definition
});
