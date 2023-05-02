import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { GitHubRunners, LambdaAccess, LambdaRunnerProvider } from '../src';

test('Default access', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  new GitHubRunners(stack, 'runners', { providers: [new LambdaRunnerProvider(stack, 'lambda')] });

  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::Lambda::Url', 2);
  template.resourceCountIs('AWS::ApiGateway::RestApi', 0);
});

test('No access', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  new GitHubRunners(stack, 'runners', {
    setupAccess: LambdaAccess.noAccess(),
    webhookAccess: LambdaAccess.noAccess(),
    statusAccess: LambdaAccess.noAccess(),
    providers: [new LambdaRunnerProvider(stack, 'lambda')],
  });

  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::Lambda::Url', 0);
  template.resourceCountIs('AWS::ApiGateway::RestApi', 0);
});

test('Lambda URL access', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  new GitHubRunners(stack, 'runners', {
    setupAccess: LambdaAccess.lambdaUrl(),
    webhookAccess: LambdaAccess.lambdaUrl(),
    statusAccess: LambdaAccess.lambdaUrl(),
    providers: [new LambdaRunnerProvider(stack, 'lambda')],
  });

  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::Lambda::Url', 3);
  template.resourceCountIs('AWS::ApiGateway::RestApi', 0);
});

test('API Gateway access', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  new GitHubRunners(stack, 'runners', {
    setupAccess: LambdaAccess.apiGateway(),
    webhookAccess: LambdaAccess.apiGateway(),
    statusAccess: LambdaAccess.apiGateway(),
    providers: [new LambdaRunnerProvider(stack, 'lambda')],
  });

  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::Lambda::Url', 0);
  template.resourceCountIs('AWS::ApiGateway::RestApi', 3);
});

test('Private API Gateway access', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const vpc = new ec2.Vpc(stack, 'vpc');
  const sg = new ec2.SecurityGroup(stack, 'sg', { vpc });

  new GitHubRunners(stack, 'runners', {
    setupAccess: LambdaAccess.apiGateway(),
    webhookAccess: LambdaAccess.apiGateway({
      allowedVpc: vpc,
      allowedSecurityGroups: [sg],
      allowedIps: ['1.2.3.4/32', '2002::1234:abcd:ffff:c0a8:101/64'],
    }),
    statusAccess: LambdaAccess.apiGateway(),
    providers: [new LambdaRunnerProvider(stack, 'lambda')],
  });

  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::Lambda::Url', 0);
  template.resourceCountIs('AWS::ApiGateway::RestApi', 3);
  template.resourceCountIs('AWS::EC2::VPCEndpoint', 1);
  template.hasResourceProperties('AWS::EC2::SecurityGroup', {
    SecurityGroupIngress: [
      {
        CidrIp: '1.2.3.4/32',
        Description: 'from 1.2.3.4/32:443',
        FromPort: 443,
        IpProtocol: 'tcp',
        ToPort: 443,
      },
      {
        CidrIpv6: '2002::1234:abcd:ffff:c0a8:101/64',
        Description: 'from 2002::1234:abcd:ffff:c0a8:101/64:443',
        FromPort: 443,
        IpProtocol: 'tcp',
        ToPort: 443,
      },
    ],
  });
});
