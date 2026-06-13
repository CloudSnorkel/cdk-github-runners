import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2, aws_ecr as ecr, aws_logs as logs } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { Construct } from 'constructs';
import {
  CodeBuildRunnerProvider,
  CompositeProvider,
  Ec2RunnerProvider,
  EcsRunnerProvider,
  FargateRunnerProvider,
  GitHubRunners,
  IRunnerProvider,
  LambdaRunnerProvider,
  StaticRunnerImage,
} from '../src';

let app: cdk.App;
let stack: cdk.Stack;

function staticImage(scope: cdk.Stack, id = 'image') {
  return StaticRunnerImage.fromEcrRepository(ecr.Repository.fromRepositoryName(scope, id, 'my-image'));
}

// renders the orchestrator DefinitionString with CloudFormation tokens collapsed, for content assertions
function definitionString(template: Template): string {
  const machines = Object.values(template.findResources('AWS::StepFunctions::StateMachine'));
  expect(machines).toHaveLength(1);
  const definition = machines[0].Properties.DefinitionString;
  if (typeof definition === 'string') {
    return definition;
  }
  return definition['Fn::Join'][1].map((part: any) => typeof part === 'string' ? part : '<TOKEN>').join('');
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

// all state names in the definition, ignoring per-provider tokens
function stateNames(definition: string): string[] {
  return [...definition.matchAll(/"([^"]+)":\{"Type":/g)].map(m => m[1]).sort();
}

describe('Parameterized providers', () => {
  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'test');
  });

  afterAll(CloudAssembly.cleanupTemporaryDirectories);

  test('all providers of a family share a single state-machine fragment', () => {
    new GitHubRunners(stack, 'runners', {
      providers: [
        new CodeBuildRunnerProvider(stack, 'p1', { imageBuilder: staticImage(stack, 'i1') }),
        new CodeBuildRunnerProvider(stack, 'p2', { imageBuilder: staticImage(stack, 'i2'), labels: ['two'] }),
        new CodeBuildRunnerProvider(stack, 'p3', { imageBuilder: staticImage(stack, 'i3'), labels: ['three'] }),
        new LambdaRunnerProvider(stack, 'p4', { imageBuilder: staticImage(stack, 'i4') }),
      ],
    });

    const definition = definitionString(Template.fromStack(stack));

    expect(countOccurrences(definition, 'codebuild:startBuild.sync')).toBe(1);
    expect(countOccurrences(definition, ':states:::lambda:invoke')).toBe(1);

    // family branches route by the selected config, not by provider path
    expect(definition).toContain('{"Variable":"$.providerParams.family","StringEquals":"codebuild"}');
    expect(definition).toContain('{"Variable":"$.providerParams.family","StringEquals":"lambda"}');
    expect(definition).not.toContain('"StringEquals":"test/p1"');
  });

  test('adding providers adds no states, only configs', () => {
    function synth(providerCount: number) {
      const sizeApp = new cdk.App();
      const sizeStack = new cdk.Stack(sizeApp, 'test');
      new GitHubRunners(sizeStack, 'runners', {
        providers: Array.from({ length: providerCount }, (_, i) =>
          new CodeBuildRunnerProvider(sizeStack, `p${i}`, {
            imageBuilder: staticImage(sizeStack, `i${i}`),
            labels: [`label-${i}`],
          }),
        ),
      });
      return definitionString(Template.fromStack(sizeStack));
    }

    const small = synth(2);
    const large = synth(7);

    expect(stateNames(large)).toEqual(stateNames(small));

    // each provider costs one config entry in the definition
    expect(countOccurrences(small, '"family":"codebuild"')).toBe(2);
    expect(countOccurrences(large, '"family":"codebuild"')).toBe(7);
  });

  test('provider configs are embedded in the definition and selected by provider path', () => {
    new GitHubRunners(stack, 'runners', {
      providers: [
        new CodeBuildRunnerProvider(stack, 'p1', {
          imageBuilder: staticImage(stack, 'i1'),
          group: 'my-group',
          defaultLabels: false,
        }),
      ],
    });

    const definition = definitionString(Template.fromStack(stack));

    // the config map and runtime lookup by $.provider
    expect(definition).toContain('"providerConfigs":{"test/p1":{"family":"codebuild","projectName":"<TOKEN>","group1":"--runnergroup","group2":"my-group","defaultLabels":"--no-default-labels"}}');
    expect(definition).toContain('$lookup($states.input.consts.providerConfigs, $states.input.provider)');
  });

  test('fragments read all task parameters from the selected config', () => {
    const vpc = new ec2.Vpc(stack, 'vpc');
    new GitHubRunners(stack, 'runners', {
      providers: [new FargateRunnerProvider(stack, 'f1', { imageBuilder: staticImage(stack, 'i1'), vpc })],
    });

    const definition = definitionString(Template.fromStack(stack));
    expect(definition).toContain('"Cluster":"{% $states.input.providerParams.clusterArn %}"');
    expect(definition).toContain('"TaskDefinition":"{% $states.input.providerParams.taskDefinitionFamily %}"');
    expect(definition).toContain('"AssignPublicIp":"{% $states.input.providerParams.assignPublicIp %}"');
    expect(definition).toContain('"Subnets":"{% $states.input.providerParams.subnets %}"');
    expect(definition).toContain('"SecurityGroups":"{% $states.input.providerParams.securityGroups %}"');
    expect(definition).toContain('"CapacityProvider":"{% $states.input.providerParams.capacityProvider %}"');
    expect(definition).toContain('"PlatformVersion":"LATEST"');
    expect(definition).toContain('"PropagateTags":"TASK_DEFINITION"');
  });

  test('failed providers are cleaned up and fall back to the next config', () => {
    new GitHubRunners(stack, 'runners', {
      providers: [new CodeBuildRunnerProvider(stack, 'p1', { imageBuilder: staticImage(stack, 'i1') })],
    });

    const definition = definitionString(Template.fromStack(stack));

    // Try Provider catches everything into the cleanup task
    expect(definition).toContain('"Try Provider":{"Type":"Parallel"');
    expect(definition).toContain('{"ErrorEquals":["States.ALL"],"ResultPath":"$.error","Next":"Clean Up Failed Runner"}');

    // cleanup re-raises and the catch advances to the fallback choice
    expect(definition).toContain('{"ErrorEquals":["States.ALL"],"ResultPath":null,"Next":"Fallback Configured?"}');
    expect(definition).toContain('"Fallback Configured?":{"Type":"Choice","Choices":[{"Variable":"$.providerParams.fallback","IsPresent":true,"Next":"Use Fallback Config"}],"Default":"All Attempts Failed"}');
    expect(definition).toContain("{'providerParams': $states.input.providerParams.fallback}");

    // out of fallbacks, the original error is re-raised for the outer catch and retry
    expect(definition).toContain('"All Attempts Failed":{"Type":"Fail","ErrorPath":"$.error.Error","CausePath":"$.error.Cause"}');
  });

  test('ec2 providers run one subnet at a time using fallback configs', () => {
    const vpc = new ec2.Vpc(stack, 'vpc', { maxAzs: 2 });
    const imageBuilder = Ec2RunnerProvider.imageBuilder(stack, 'ib', { vpc });
    const provider = new Ec2RunnerProvider(stack, 'p1', { imageBuilder, vpc, spot: true });
    new GitHubRunners(stack, 'runners', { providers: [provider] });

    const definition = definitionString(Template.fromStack(stack));

    // one state for spot and one for on-demand, regardless of provider or subnet count
    expect(countOccurrences(definition, 'ec2:runInstances.waitForTaskToken')).toBe(2);
    expect(definition).toContain('"SubnetId.$":"$.providerParams.subnet"');
    expect(countOccurrences(definition, '"InstanceMarketOptions.$"')).toBe(1);

    // spot configs are routed to the spot state
    expect(definition).toContain('{"Variable":"$.providerParams.instanceMarketOptions","IsPresent":true}');

    // user data template selected at runtime and substituted with States.Format like before
    expect(definition).toContain('States.ArrayGetItem(States.Array($.consts.ec2UserDataLinux, $.consts.ec2UserDataWindows), $.providerParams.userDataTemplateIdx)');
    expect(definition).toContain('"ec2UserDataLinux"');
    expect(definition).toContain('"ec2UserDataWindows"');

    // one config per subnet, chained with fallback
    const config = (provider as any)._runnerConfig();
    expect(config.family).toBe('ec2');
    expect(config.subnet).toBeDefined();
    expect(config.fallback.family).toBe('ec2');
    expect(config.fallback.subnet).toBeDefined();
    expect(config.fallback.fallback).toBeUndefined();
  });

  test('composite fallback chains sub-provider configs', () => {
    const vpc = new ec2.Vpc(stack, 'vpc', { maxAzs: 2 });
    const imageBuilder = Ec2RunnerProvider.imageBuilder(stack, 'ib', { vpc });
    const ec2Provider = new Ec2RunnerProvider(stack, 'e1', { imageBuilder, vpc, labels: ['x'] });
    const codeBuildProvider = new CodeBuildRunnerProvider(stack, 'c1', { imageBuilder: staticImage(stack, 'i1'), labels: ['x'] });
    const composite = CompositeProvider.fallback(stack, 'composite', [ec2Provider, codeBuildProvider]);
    new GitHubRunners(stack, 'runners', { providers: [composite] });

    // the codebuild fallback goes at the end of the EC2 provider's own subnet chain
    const config = (composite as any)._runnerConfig();
    expect(config.family).toBe('ec2');
    expect(config.fallback.family).toBe('ec2');
    expect(config.fallback.fallback.family).toBe('codebuild');
    expect(config.fallback.fallback.fallback).toBeUndefined();

    // both families got their fragments
    const definition = definitionString(Template.fromStack(stack));
    expect(countOccurrences(definition, 'ec2:runInstances.waitForTaskToken')).toBe(2);
    expect(countOccurrences(definition, 'codebuild:startBuild.sync')).toBe(1);
  });

  test('composite distribute picks a weighted config at runtime', () => {
    const vpc = new ec2.Vpc(stack, 'vpc');
    const composite = CompositeProvider.distribute(stack, 'composite', [
      { weight: 3, provider: new FargateRunnerProvider(stack, 'f1', { imageBuilder: staticImage(stack, 'i1'), vpc, labels: ['x'] }) },
      { weight: 2, provider: new FargateRunnerProvider(stack, 'f2', { imageBuilder: staticImage(stack, 'i2'), vpc, labels: ['x'] }) },
    ]);
    new GitHubRunners(stack, 'runners', { providers: [composite] });

    const config = (composite as any)._runnerConfig();
    expect(config.distribute).toHaveLength(2);
    expect(config.distribute[0].weight).toBe(3);
    expect(config.distribute[0].config.family).toBe('fargate');
    expect(config.distribute[1].weight).toBe(2);

    const definition = definitionString(Template.fromStack(stack));
    expect(definition).toContain('{"Variable":"$.providerParams.distribute","IsPresent":true,"Next":"Pick Weighted Config"}');
    expect(definition).toContain('$random()');
    expect(countOccurrences(definition, 'ecs:runTask.sync')).toBe(1);
  });

  test('every provider grants the orchestrator what its family fragment needs', () => {
    const vpc = new ec2.Vpc(stack, 'vpc');
    const imageBuilder = Ec2RunnerProvider.imageBuilder(stack, 'ib', { vpc });
    new GitHubRunners(stack, 'runners', {
      providers: [
        new CodeBuildRunnerProvider(stack, 'cb', { imageBuilder: staticImage(stack, 'i1') }),
        new LambdaRunnerProvider(stack, 'l1', { imageBuilder: staticImage(stack, 'i2'), labels: ['l1'] }),
        new FargateRunnerProvider(stack, 'f1', { imageBuilder: staticImage(stack, 'i3'), vpc, labels: ['f1'] }),
        new EcsRunnerProvider(stack, 'e1', { imageBuilder: staticImage(stack, 'i4'), vpc, labels: ['e1'] }),
        new Ec2RunnerProvider(stack, 'x1', { imageBuilder, vpc, spot: true, labels: ['x1'] }),
      ],
    });

    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', Match.objectLike({
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: ['codebuild:StartBuild', 'codebuild:StopBuild', 'codebuild:BatchGetBuilds', 'codebuild:BatchGetReports'],
            Resource: Match.objectLike({ 'Fn::GetAtt': Match.arrayWith([Match.stringLikeRegexp('^cbCodeBuild')]) }),
          }),
          Match.objectLike({
            Action: 'lambda:InvokeFunction',
            Resource: Match.arrayWith([
              Match.objectLike({ 'Fn::GetAtt': Match.arrayWith([Match.stringLikeRegexp('^l1Function')]) }),
            ]),
          }),
          Match.objectLike({ Action: 'ecs:RunTask' }),
          Match.objectLike({ Action: ['ecs:StopTask', 'ecs:DescribeTasks'], Resource: '*' }),
          Match.objectLike({
            Action: 'iam:PassRole',
            Resource: [
              Match.objectLike({ 'Fn::GetAtt': Match.arrayWith([Match.stringLikeRegexp('^f1task.*TaskRole')]) }),
              Match.objectLike({ 'Fn::GetAtt': Match.arrayWith([Match.stringLikeRegexp('^f1task.*ExecutionRole')]) }),
            ],
          }),
          Match.objectLike({ Action: 'ec2:runInstances', Resource: '*' }),
          Match.objectLike({
            Action: 'iam:PassRole',
            Condition: { StringEquals: { 'iam:PassedToService': 'ec2.amazonaws.com' } },
          }),
          Match.objectLike({ Action: 'ec2:createTags' }),
          Match.objectLike({
            Action: 'iam:CreateServiceLinkedRole',
            Condition: { StringEquals: { 'iam:AWSServiceName': 'spot.amazonaws.com' } },
          }),
        ]),
      }),
      Roles: [Match.objectLike({ Ref: Match.stringLikeRegexp('runnersRunnerOrchestratorRole') })],
    }));
  });

  test('webhook handler reads the providers map from stack metadata', () => {
    new GitHubRunners(stack, 'runners', {
      providers: [
        new CodeBuildRunnerProvider(stack, 'p1', { imageBuilder: staticImage(stack, 'i1') }),
        new LambdaRunnerProvider(stack, 'p2', { imageBuilder: staticImage(stack, 'i2') }),
      ],
    });

    const template = Template.fromStack(stack);
    template.hasResource('AWS::Lambda::Function', {
      Properties: Match.objectLike({
        Description: 'Handle GitHub webhook and start runner orchestrator',
        Environment: {
          Variables: Match.objectLike({
            LOGICAL_ID: Match.stringLikeRegexp('runnersWebhookHandlerwebhookhandler'),
            STACK_NAME: 'test',
          }),
        },
      }),
      Metadata: {
        providers: {
          'test/p1': ['codebuild'],
          'test/p2': ['lambda'],
        },
      },
    });

    template.hasResourceProperties('AWS::IAM::Policy', Match.objectLike({
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({ Action: 'cloudformation:DescribeStackResource' }),
        ]),
      }),
      Roles: [Match.objectLike({ Ref: Match.stringLikeRegexp('runnersWebhookHandlerwebhookhandlerServiceRole') })],
    }));
  });

  test('custom providers are not supported', () => {
    class CustomProvider extends Construct implements IRunnerProvider {
      readonly labels = ['custom'];
      readonly logGroup = new logs.LogGroup(this, 'logs');
      readonly grantPrincipal = new cdk.aws_iam.Role(this, 'role', { assumedBy: new cdk.aws_iam.ServicePrincipal('ec2.amazonaws.com') });
      readonly connections = new ec2.Connections();
    }

    new GitHubRunners(stack, 'runners', {
      providers: [new CustomProvider(stack, 'custom')],
    });

    Annotations.fromStack(stack).hasError('/test/custom', Match.stringLikeRegexp('Custom runner providers are not supported'));
  });

  test('unknown runner family is an error', () => {
    const provider = new CodeBuildRunnerProvider(stack, 'p1', { imageBuilder: staticImage(stack, 'i1') });
    (provider as any)._runnerFamilies = ['bogus'];
    new GitHubRunners(stack, 'runners', { providers: [provider] });

    Annotations.fromStack(stack).hasError('/test/p1', Match.stringLikeRegexp('Unknown runner family "bogus"'));
  });
});
