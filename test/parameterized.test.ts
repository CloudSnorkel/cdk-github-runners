import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2, aws_ecr as ecr, aws_ecs as ecs, aws_logs as logs } from 'aws-cdk-lib';
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

// the orchestrator's definitionSubstitutions map (token -> intrinsic), where each distinct CloudFormation token
// renders once instead of once per occurrence in the definition
function definitionSubstitutions(template: Template): Record<string, any> {
  const machines = Object.values(template.findResources('AWS::StepFunctions::StateMachine'));
  expect(machines).toHaveLength(1);
  return machines[0].Properties.DefinitionSubstitutions ?? {};
}

// a literal shaped exactly like the placeholders dedupeStateMachineTokens() generates
const COLLIDES = '${__sfnsub_0}';

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
    expect(definition).toContain('{"Variable":"$.providerParams.family","StringEquals":"codebuild"');
    expect(definition).toContain('{"Variable":"$.providerParams.family","StringEquals":"lambda"');
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

    const template = Template.fromStack(stack);
    const definition = definitionString(template);

    // the configs go in a workflow variable, not the execution state, and the lookup reads it by $.provider.
    // dynamic tokens (the project name) are de-duplicated into definitionSubstitutions, so the config carries a
    // ${...} placeholder rather than the token
    expect(definition).toContain('"Assign":{"providerConfigs":{"test/p1":{"family":"codebuild","provider":"test/p1","projectName":"${__sfnsub_0}","group1":"--runnergroup","group2":"my-group","defaultLabels":"--no-default-labels"}}}');
    expect(definition).toContain('$lookup($providerConfigs, $states.input.provider)');
    expect(definitionSubstitutions(template).__sfnsub_0).toBeDefined();
  });

  test('tokens shared across providers are de-duplicated into one substitution', () => {
    const vpc = new ec2.Vpc(stack, 'vpc');
    new GitHubRunners(stack, 'runners', {
      providers: [
        new FargateRunnerProvider(stack, 'f1', { vpc, imageBuilder: staticImage(stack, 'i1') }),
        new FargateRunnerProvider(stack, 'f2', { vpc, imageBuilder: staticImage(stack, 'i2') }),
        new FargateRunnerProvider(stack, 'f3', { vpc, imageBuilder: staticImage(stack, 'i3') }),
      ],
    });

    const template = Template.fromStack(stack);
    const definition = definitionString(template);
    const subs = definitionSubstitutions(template);

    // all three providers share the VPC's public subnets (Fargate defaults to assignPublicIp), so each subnet's
    // intrinsic must appear once in the substitutions map even though the definition references it once per provider
    const subnetSubKeys = Object.entries(subs).filter(([, v]) => JSON.stringify(v).includes('PublicSubnet')).map(([k]) => k);
    expect(subnetSubKeys.length).toBe(vpc.publicSubnets.length);
    for (const key of subnetSubKeys) {
      // referenced once per provider (3x), but the heavy intrinsic lives in the map only once
      expect(countOccurrences(definition, `\${${key}}`)).toBe(3);
    }
  });

  test('fragments read all task parameters from the selected config', () => {
    const vpc = new ec2.Vpc(stack, 'vpc');
    new GitHubRunners(stack, 'runners', {
      providers: [new FargateRunnerProvider(stack, 'f1', { imageBuilder: staticImage(stack, 'i1'), vpc })],
    });

    const definition = definitionString(Template.fromStack(stack));
    expect(definition).toContain('"Cluster.$":"$.providerParams.clusterArn"');
    expect(definition).toContain('"TaskDefinition.$":"$.providerParams.taskDefinitionFamily"');
    expect(definition).toContain('"AssignPublicIp.$":"$.providerParams.assignPublicIp"');
    expect(definition).toContain('"Subnets.$":"$.providerParams.subnets"');
    expect(definition).toContain('"SecurityGroups.$":"$.providerParams.securityGroups"');
    expect(definition).toContain('"CapacityProvider.$":"$.providerParams.capacityProvider"');

    // the fragments are all JSONPath now; only the orchestrator's config states need JSONata
    expect(definition).not.toContain('"QueryLanguage":"JSONata","Resource":"arn:');

    // runner environment renders as name/value pairs, not name-arrays with integer values
    expect(definition).toContain('{"Name":"RUNNER_TOKEN","Value.$":"$.runner.token"}');
    expect(definition).toContain('{"Name":"RUNNER_GROUP1","Value.$":"$.providerParams.group1"}');
    expect(definition).toContain('"PlatformVersion":"LATEST"');
    expect(definition).toContain('"PropagateTags":"TASK_DEFINITION"');
  });

  test('ecs placement strategies and constraints reach ecs:runTask', () => {
    const vpc = new ec2.Vpc(stack, 'vpc');
    new GitHubRunners(stack, 'runners', {
      providers: [
        new EcsRunnerProvider(stack, 'e1', {
          imageBuilder: staticImage(stack, 'i1'),
          vpc,
          placementStrategies: [ecs.PlacementStrategy.packedByCpu()],
          placementConstraints: [ecs.PlacementConstraint.distinctInstances()],
        }),
      ],
    });

    // ecs:runTask wants these in its own casing, and the provider renders them at synth time. the fragment only
    // points at the config, so a rename on either side has to break here
    const definition = definitionString(Template.fromStack(stack));
    expect(definition).toContain('"PlacementStrategy.$":"$.providerParams.placementStrategies"');
    expect(definition).toContain('"PlacementConstraints.$":"$.providerParams.placementConstraints"');
    expect(definition).toContain('"placementStrategies":[{"Type":"binpack","Field":"CPU"}]');
    expect(definition).toContain('"placementConstraints":[{"Type":"distinctInstance"}]');
  });

  test('failed providers are cleaned up and fall back to the next config', () => {
    new GitHubRunners(stack, 'runners', {
      providers: [new CodeBuildRunnerProvider(stack, 'p1', { imageBuilder: staticImage(stack, 'i1') })],
    });

    const definition = definitionString(Template.fromStack(stack));

    // Try Provider catches everything into the cleanup task
    expect(definition).toContain('"Try Provider":{"Type":"Parallel"');
    expect(definition).toContain('{"ErrorEquals":["States.ALL"],"ResultPath":"$.error","Next":"Clean Up Failed Runner"}');

    // cleanup reports what it did and advances to the fallback choice on its normal path, so it never goes red
    // just for re-raising the error that got us here (#989); the catch is only for a cleanup that really failed
    expect(definition).toContain('"Clean Up Failed Runner":{"Next":"Fallback Configured?"');
    expect(definition).toContain('{"ErrorEquals":["States.ALL"],"ResultPath":null,"Next":"Fallback Configured?"}');
    expect(definition).toContain('"Fallback Configured?":{"Type":"Choice","Choices":[{"Variable":"$.providerParams.fallback","IsPresent":true,"Next":"Use Fallback Config"}],"Default":"All Attempts Failed"}');
    expect(definition).toContain('$selected := $states.input.providerParams.fallback;');

    // out of fallbacks, a state of its own re-raises the original error for the outer catch and retry
    expect(definition).toContain('"All Attempts Failed":{"Type":"Fail","Comment":"Fail the execution with the original error that stopped the runner","ErrorPath":"$.error.Error","CausePath":"$.error.Cause"}');
  });

  test('ec2 providers run one subnet at a time using fallback configs', () => {
    const vpc = new ec2.Vpc(stack, 'vpc', { maxAzs: 2 });
    const imageBuilder = Ec2RunnerProvider.imageBuilder(stack, 'ib', { vpc });
    const provider = new Ec2RunnerProvider(stack, 'p1', { imageBuilder, vpc, spot: true });
    new GitHubRunners(stack, 'runners', { providers: [provider] });

    const definition = definitionString(Template.fromStack(stack));

    // one state, regardless of provider count, subnet count or spot
    expect(countOccurrences(definition, 'ec2:runInstances.waitForTaskToken')).toBe(1);
    expect(definition).toContain('"SubnetId.$":"$.providerParams.subnet"');
    expect(countOccurrences(definition, '"InstanceMarketOptions.$"')).toBe(1);

    // spot options come from the config, so spot and on-demand providers share the state
    expect((provider as any)._runnerConfig().instanceMarketOptions).toEqual({ MarketType: 'spot', SpotOptions: { SpotInstanceType: 'one-time' } });

    // user data template selected at runtime and substituted with States.Format like before
    expect(definition).toContain('States.ArrayGetItem(States.Array($ec2UserDataLinux, $ec2UserDataWindows), $.providerParams.userDataTemplateIdx)');
    expect(definition).toContain('"ec2UserDataLinux"');
    expect(definition).toContain('"ec2UserDataWindows"');

    // the templates are assigned to variables, so a JSONPath fragment can read them without them riding along
    // in the execution state
    const parsed = JSON.parse(definition.replace(/<TOKEN>/g, 'token'));
    expect(Object.keys(parsed.States['Load Config'])).toEqual(['Type', 'Next', 'Assign']);
    expect(Object.keys(parsed.States['Load Config'].Assign).sort()).toEqual(['ec2UserDataLinux', 'ec2UserDataWindows', 'providerConfigs']);

    // assigned once per execution, not once per retry
    expect(Object.keys(parsed.States['Run Providers'].Branches[0].States)).not.toContain('Load Config');

    // one config per subnet, chained with fallback
    const config = (provider as any)._runnerConfig();
    expect(config.family).toBe('ec2');
    expect(config.subnet).toBeDefined();
    expect(config.fallback.family).toBe('ec2');
    expect(config.fallback.subnet).toBeDefined();
    expect(config.fallback.fallback).toBeUndefined();

    // an empty struct, not a missing field: the shared state reads this path unconditionally, and a missing
    // reference path fails the state at runtime
    const onDemand = new Ec2RunnerProvider(stack, 'p2', { imageBuilder, vpc, labels: ['od'] });
    expect((onDemand as any)._runnerConfig().instanceMarketOptions).toEqual({});
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
    expect(countOccurrences(definition, 'ec2:runInstances.waitForTaskToken')).toBe(1);
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
    expect(config.totalWeight).toBe(5);
    expect(config.distribute[0].threshold).toBe(3);
    expect(config.distribute[0].config.family).toBe('fargate');
    expect(config.distribute[1].threshold).toBe(5); // running sum, always ends at totalWeight

    const definition = definitionString(Template.fromStack(stack));
    expect(definition).toContain('$random()');
    expect(countOccurrences(definition, 'ecs:runTask.sync')).toBe(1);

    // the pick is part of selecting the config, so it happens before 'Try Provider' and takes no state of its
    // own. it has to stay outside: a Parallel hands its own input to its Catch, so picking inside would throw
    // away the picked config, and its fallback chain, on failure
    const parsed = JSON.parse(definition.replace(/<TOKEN>/g, 'token'));
    const branch = parsed.States['Run Providers'].Branches[0].States;
    expect(Object.keys(branch)).toEqual([
      'Get Runner Token', 'Select Provider Config', 'Try Provider',
      'Use Fallback Config', 'Fallback Configured?', 'Clean Up Failed Runner', 'All Attempts Failed',
    ]);
    expect(branch['Select Provider Config'].Next).toBe('Try Provider');
    expect(branch['Use Fallback Config'].Next).toBe('Try Provider');
  });

  test('a distributed config keeps the picked provider fallback chain', () => {
    const vpc = new ec2.Vpc(stack, 'vpc', { maxAzs: 2 });
    const imageBuilder = Ec2RunnerProvider.imageBuilder(stack, 'ib', { vpc });
    const composite = CompositeProvider.distribute(stack, 'composite', [
      { weight: 1, provider: new Ec2RunnerProvider(stack, 'e1', { imageBuilder, vpc, labels: ['x'] }) },
      { weight: 1, provider: new CodeBuildRunnerProvider(stack, 'c1', { imageBuilder: staticImage(stack, 'i1'), labels: ['x'] }) },
    ]);
    new GitHubRunners(stack, 'runners', { providers: [composite] });

    // the EC2 provider's per-subnet chain survives inside the weighted config, so a failed subnet still falls
    // back to the next one
    const config = (composite as any)._runnerConfig();
    expect(config.distribute[0].config.family).toBe('ec2');
    expect(config.distribute[0].config.fallback.family).toBe('ec2');
    expect(config.distribute[0].config.fallback.subnet).not.toBe(config.distribute[0].config.subnet);
    expect(config.distribute[1].config.fallback).toBeUndefined();
  });

  test('every config names the provider that runs it, at every depth', () => {
    const vpc = new ec2.Vpc(stack, 'vpc', { maxAzs: 2 });
    const imageBuilder = Ec2RunnerProvider.imageBuilder(stack, 'ib', { vpc });
    new GitHubRunners(stack, 'runners', {
      providers: [
        // one of every family, plus a composite of each kind. composite members need matching labels
        new CodeBuildRunnerProvider(stack, 'cb', { imageBuilder: staticImage(stack, 'i1') }),
        new LambdaRunnerProvider(stack, 'l1', { imageBuilder: staticImage(stack, 'i2'), labels: ['l1'] }),
        new FargateRunnerProvider(stack, 'f1', { imageBuilder: staticImage(stack, 'i3'), vpc, labels: ['f1'] }),
        new EcsRunnerProvider(stack, 'e1', { imageBuilder: staticImage(stack, 'i4'), vpc, labels: ['e1'] }),
        new Ec2RunnerProvider(stack, 'x1', { imageBuilder, vpc, labels: ['x1'] }),
        CompositeProvider.fallback(stack, 'fb', [
          new Ec2RunnerProvider(stack, 'fb1', { imageBuilder, vpc, labels: ['fb'] }),
          new CodeBuildRunnerProvider(stack, 'fb2', { imageBuilder: staticImage(stack, 'i5'), labels: ['fb'] }),
        ]),
        CompositeProvider.distribute(stack, 'dist', [
          { weight: 1, provider: new LambdaRunnerProvider(stack, 'd1', { imageBuilder: staticImage(stack, 'i6'), labels: ['dist'] }) },
          { weight: 1, provider: new EcsRunnerProvider(stack, 'd2', { imageBuilder: staticImage(stack, 'i7'), vpc, labels: ['dist'] }) },
        ]),
      ],
    });

    // GitHubRunners:Provider comes from the config, not from $.provider, so every config we can land on has to
    // name its own provider. behind a composite $.provider is the composite
    const configs = JSON.parse(definitionString(Template.fromStack(stack)).replace(/<TOKEN>/g, 'token'))
      .States['Load Config'].Assign.providerConfigs;
    const runners = new Set<string>();
    function walk(config: any) {
      if (config.distribute) {
        config.distribute.forEach((option: any) => walk(option.config));
        return;
      }
      expect(typeof config.provider).toBe('string');
      runners.add(config.provider);
      if (config.fallback) {
        walk(config.fallback);
      }
    }
    Object.values(configs).forEach(walk);

    expect([...runners].sort()).toEqual([
      'test/cb', 'test/d1', 'test/d2', 'test/e1', 'test/f1', 'test/fb1', 'test/fb2', 'test/l1', 'test/x1',
    ]);
    // composites are keyed in providerConfigs, but never name themselves as the runner
    expect(Object.keys(configs)).toEqual(expect.arrayContaining(['test/fb', 'test/dist']));
    expect(runners.has('test/fb')).toBe(false);
    expect(runners.has('test/dist')).toBe(false);
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

  test('a value colliding with the definition substitutions is an error', () => {
    const vpc = new ec2.Vpc(stack, 'vpc');
    const imageBuilder = Ec2RunnerProvider.imageBuilder(stack, 'ib', { vpc });
    new GitHubRunners(stack, 'runners', {
      providers: [new Ec2RunnerProvider(stack, 'p1', { imageBuilder, vpc, tags: { Team: '${Team}' } })],
    });

    // Step Functions would otherwise reject the deployment with an unhelpful message about a missing substitution
    Annotations.fromStack(stack).hasError('/test/runners', Match.stringLikeRegexp('collides with the state machine definition substitutions'));
  });

  // every way a user string reaches the definition. the construct id ones are the sneaky pair: the provider's path
  // lands in `provider` on every config, and in `taskDefinitionFamily` for ecs and fargate. a composite's own path is
  // sneakier still -- its config names only its sub-providers, so the path shows up nowhere but the providerConfigs key
  test.each([
    ['ec2 tag value', (s: cdk.Stack, vpc: ec2.Vpc) => new Ec2RunnerProvider(s, 'p', { imageBuilder: Ec2RunnerProvider.imageBuilder(s, 'ib', { vpc }), vpc, tags: { Team: COLLIDES } })],
    ['ec2 tag key', (s: cdk.Stack, vpc: ec2.Vpc) => new Ec2RunnerProvider(s, 'p', { imageBuilder: Ec2RunnerProvider.imageBuilder(s, 'ib', { vpc }), vpc, tags: { [COLLIDES]: 'x' } })],
    ['codebuild group', (s: cdk.Stack) => new CodeBuildRunnerProvider(s, 'p', { imageBuilder: staticImage(s, 'i'), group: COLLIDES })],
    ['lambda group', (s: cdk.Stack) => new LambdaRunnerProvider(s, 'p', { imageBuilder: staticImage(s, 'i'), group: COLLIDES })],
    ['construct id', (s: cdk.Stack) => new CodeBuildRunnerProvider(s, `p${COLLIDES}`, { imageBuilder: staticImage(s, 'i') })],
    ['ecs construct id', (s: cdk.Stack, vpc: ec2.Vpc) => new EcsRunnerProvider(s, `p${COLLIDES}`, { imageBuilder: staticImage(s, 'i'), vpc })],
    ['fallback construct id', (s: cdk.Stack) => CompositeProvider.fallback(s, `fb${COLLIDES}`, [
      new CodeBuildRunnerProvider(s, 'fb1', { imageBuilder: staticImage(s, 'i1'), labels: ['fb'] }),
      new CodeBuildRunnerProvider(s, 'fb2', { imageBuilder: staticImage(s, 'i2'), labels: ['fb'] }),
    ])],
    ['distribute construct id', (s: cdk.Stack) => CompositeProvider.distribute(s, `d${COLLIDES}`, [
      { weight: 1, provider: new CodeBuildRunnerProvider(s, 'd1', { imageBuilder: staticImage(s, 'i1'), labels: ['d'] }) },
      { weight: 1, provider: new CodeBuildRunnerProvider(s, 'd2', { imageBuilder: staticImage(s, 'i2'), labels: ['d'] }) },
    ])],
  ])('a value shaped like our own placeholder is an error too: %s', (_name, build) => {
    const vpc = new ec2.Vpc(stack, 'vpc');
    new GitHubRunners(stack, 'runners', { providers: [build(stack, vpc)] });

    // without the check this passes synth and then gets overwritten by whatever token owns __sfnsub_0
    Annotations.fromStack(stack).hasError('/test/runners', Match.stringLikeRegexp('collides with the state machine definition substitutions'));
  });

  test('weights that cannot serialize are rejected at synth', () => {
    const vpc = new ec2.Vpc(stack, 'vpc');
    let counter = 0;
    const providers = () => [
      new FargateRunnerProvider(stack, `f${counter}`, { imageBuilder: staticImage(stack, `i${counter++}`), vpc, labels: ['x'] }),
      new FargateRunnerProvider(stack, `f${counter}`, { imageBuilder: staticImage(stack, `i${counter++}`), vpc, labels: ['x'] }),
    ];

    // NaN and Infinity both lose `weight <= 0`, then JSON.stringify turns totalWeight into null and every job dies
    // in 'Select Provider Config' with "must evaluate to a number"
    for (const weight of [NaN, Infinity, 0, -1]) {
      const [a, b] = providers();
      expect(() => CompositeProvider.distribute(stack, `d${counter}`, [{ provider: a, weight }, { provider: b, weight: 1 }]))
        .toThrow('All weights must be positive finite numbers');
    }

    // finite weights can still add up to Infinity
    const [a, b] = providers();
    expect(() => CompositeProvider.distribute(stack, 'dsum', [{ provider: a, weight: 1e308 }, { provider: b, weight: 1e308 }]))
      .toThrow('Total weight must be a finite number');

    // fractions are fine, and used to be broken: the old code drew with States.MathRandom(1, totalWeight + 1) and
    // compared with <=, so anything under 1 could never win
    const [c, d] = providers();
    const fractional = CompositeProvider.distribute(stack, 'dfrac', [{ provider: c, weight: 0.25 }, { provider: d, weight: 0.75 }]);
    const config = (fractional as any)._runnerConfig();
    expect(config.totalWeight).toBe(1);
    expect(config.distribute.map((o: any) => o.threshold)).toEqual([0.25, 1]);
  });

  test('unknown runner family is an error', () => {
    const provider = new CodeBuildRunnerProvider(stack, 'p1', { imageBuilder: staticImage(stack, 'i1') });
    (provider as any)._runnerConfig = () => ({ family: 'bogus' });
    new GitHubRunners(stack, 'runners', { providers: [provider] });

    Annotations.fromStack(stack).hasError('/test/p1', Match.stringLikeRegexp('Unknown runner family "bogus"'));
  });
});
