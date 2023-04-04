import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { GitHubRunners, LambdaAccess, LambdaRunnerProvider } from '../src';

test('Default access', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  new GitHubRunners(stack, 'runners', { providers: [new LambdaRunnerProvider(stack, 'lambda')] });

  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::Lambda::Url', 2);
});

test('No access', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  new GitHubRunners(stack, 'runners', {
    setupAccess: LambdaAccess.noAccess(),
    webhookAccess: LambdaAccess.noAccess(),
    providers: [new LambdaRunnerProvider(stack, 'lambda')],
  });

  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::Lambda::Url', 0);
  template.resourceCountIs('AWS::ApiGateway::RestApi', 0);
});

test('Lamnda URL access', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  new GitHubRunners(stack, 'runners', {
    setupAccess: LambdaAccess.lambdaUrl(),
    webhookAccess: LambdaAccess.lambdaUrl(),
    providers: [new LambdaRunnerProvider(stack, 'lambda')],
  });

  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::Lambda::Url', 2);
  template.resourceCountIs('AWS::ApiGateway::RestApi', 0);
});

test('API Gateway access', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  new GitHubRunners(stack, 'runners', {
    setupAccess: LambdaAccess.apiGateway(),
    webhookAccess: LambdaAccess.apiGateway(),
    providers: [new LambdaRunnerProvider(stack, 'lambda')],
  });

  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::Lambda::Url', 0);
  template.resourceCountIs('AWS::ApiGateway::RestApi', 2);
});
