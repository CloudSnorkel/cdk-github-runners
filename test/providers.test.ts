import * as cdk from 'aws-cdk-lib';
import {
  aws_ec2 as ec2,
} from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { CodeBuildRunner, FargateRunner, LambdaRunner } from '../src';

test('CodeBuild provider', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  new CodeBuildRunner(stack, 'provider', {
    timeout: cdk.Duration.hours(2),
  });

  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::CodeBuild::Project', Match.objectLike({
    TimeoutInMinutes: 120,
  }));
});

test('CodeBuild provider privileged', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  new CodeBuildRunner(stack, 'provider false', {
    dockerInDocker: false,
  });

  new CodeBuildRunner(stack, 'provider true', {
    dockerInDocker: true,
  });

  new CodeBuildRunner(stack, 'provider default');

  const template = Template.fromStack(stack);

  template.resourcePropertiesCountIs('AWS::CodeBuild::Project', Match.objectLike({
    Environment: {
      PrivilegedMode: true,
    },
  }), 2/*runners*/+3/*image builders*/);

  template.hasResourceProperties('AWS::CodeBuild::Project', Match.objectLike({
    Environment: {
      PrivilegedMode: false,
    },
  }));
});

test('Lambda provider', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  new LambdaRunner(stack, 'provider', {
    timeout: cdk.Duration.minutes(5),
  });

  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
    Timeout: 300,
  }));
});

test('Fargate provider', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const vpc = new ec2.Vpc(stack, 'vpc');
  const sg = new ec2.SecurityGroup(stack, 'sg', { vpc });

  new FargateRunner(stack, 'provider', {
    vpc: vpc,
    securityGroup: sg,
  });

  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::ECS::Cluster', Match.objectLike({
  }));

  template.hasResourceProperties('AWS::ECS::TaskDefinition', Match.objectLike({
    NetworkMode: 'awsvpc',
    ContainerDefinitions: [
      {
        Name: 'runner',
      },
    ],
  }));
});
