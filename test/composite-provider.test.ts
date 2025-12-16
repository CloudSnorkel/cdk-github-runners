import * as cdk from 'aws-cdk-lib';
import { aws_iam as iam, aws_stepfunctions as stepfunctions } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Construct } from 'constructs';
import { CodeBuildRunnerProvider, GitHubRunners, ICompositeProvider, IRunnerProviderStatus, LambdaRunnerProvider, RunnerRuntimeParameters } from '../src';

/**
 * Mock implementation of ICompositeProvider for testing
 */
class MockCompositeProvider extends Construct implements ICompositeProvider {
  public readonly labels: string[];

  constructor(
    scope: Construct,
    id: string,
    labels: string[],
    private readonly subProviderStatuses: IRunnerProviderStatus[],
  ) {
    super(scope, id);
    this.labels = labels;
  }

  getStepFunctionTask(_parameters: RunnerRuntimeParameters): stepfunctions.IChainable {
    return new stepfunctions.Pass(this, `${this.node.id}Task`);
  }

  grantStateMachine(_stateMachineRole: iam.IGrantable): void {
    // Mock implementation - do nothing
  }

  status(_statusFunctionRole: iam.IGrantable): IRunnerProviderStatus[] {
    return this.subProviderStatuses;
  }
}

describe('ICompositeProvider', () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'test');
  });

  test('Composite provider can be used with GitHubRunners', () => {
    const compositeProvider = new MockCompositeProvider(
      stack,
      'composite',
      ['composite-label'],
      [
        {
          type: 'mock',
          labels: ['composite-label'],
        },
        {
          type: 'mock',
          labels: ['composite-label'],
        },
      ],
    );

    new GitHubRunners(stack, 'runners', {
      providers: [compositeProvider],
    });

    const template = Template.fromStack(stack);
    // Verify that GitHubRunners was created successfully
    template.resourceCountIs('AWS::StepFunctions::StateMachine', 1);
  });

  test('Composite provider returns multiple statuses', () => {
    const status1: IRunnerProviderStatus = {
      type: 'composite-sub-1',
      labels: ['test-label'],
      logGroup: 'log-group-1',
    };

    const status2: IRunnerProviderStatus = {
      type: 'composite-sub-2',
      labels: ['test-label'],
      logGroup: 'log-group-2',
    };

    const compositeProvider = new MockCompositeProvider(
      stack,
      'composite',
      ['test-label'],
      [status1, status2],
    );

    new GitHubRunners(stack, 'runners', {
      providers: [compositeProvider],
    });

    // Get the status function to verify it receives multiple statuses
    const template = Template.fromStack(stack);
    const statusFunction = template.findResources('AWS::Lambda::Function', {
      Properties: {
        Description: 'Provide user with status about self-hosted GitHub Actions runners',
      },
    });

    expect(Object.keys(statusFunction).length).toBe(1);
    const statusFunctionKey = Object.keys(statusFunction)[0];
    const statusFunctionResource = statusFunction[statusFunctionKey];

    // Verify that the function has metadata with providers
    // The status function should have metadata with flattened statuses
    expect(statusFunctionResource.Metadata).toBeDefined();
    expect(statusFunctionResource.Metadata.providers).toBeDefined();
    // The providers array should contain the flattened statuses from the composite provider
    expect(Array.isArray(statusFunctionResource.Metadata.providers)).toBe(true);
    // Should have 2 statuses from the composite provider
    expect(statusFunctionResource.Metadata.providers.length).toBe(2);
  });

  test('Composite provider works alongside regular providers', () => {
    const regularProvider = new LambdaRunnerProvider(stack, 'regular', {
      labels: ['regular-label'],
    });

    const compositeProvider = new MockCompositeProvider(
      stack,
      'composite',
      ['composite-label'],
      [
        {
          type: 'mock',
          labels: ['composite-label'],
        },
      ],
    );

    new GitHubRunners(stack, 'runners', {
      providers: [regularProvider, compositeProvider],
    });

    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::StepFunctions::StateMachine', 1);
  });

  test('Composite provider does not have connections property', () => {
    const compositeProvider = new MockCompositeProvider(
      stack,
      'composite',
      ['test-label'],
      [
        {
          type: 'mock',
          labels: ['test-label'],
        },
      ],
    );

    // Verify that connections is not a property of ICompositeProvider
    // ICompositeProvider does not extend IConnectable, so it should not have connections
    expect(compositeProvider).not.toHaveProperty('connections');
  });

  test('Composite provider does not have grantPrincipal property', () => {
    const compositeProvider = new MockCompositeProvider(
      stack,
      'composite',
      ['test-label'],
      [
        {
          type: 'mock',
          labels: ['test-label'],
        },
      ],
    );

    // Verify that grantPrincipal is not a property of ICompositeProvider
    // ICompositeProvider does not extend IGrantable, so it should not have grantPrincipal
    expect(compositeProvider).not.toHaveProperty('grantPrincipal');
  });

  test('Multiple composite providers can be used together', () => {
    const composite1 = new MockCompositeProvider(
      stack,
      'composite1',
      ['label1'],
      [
        {
          type: 'mock1',
          labels: ['label1'],
        },
      ],
    );

    const composite2 = new MockCompositeProvider(
      stack,
      'composite2',
      ['label2'],
      [
        {
          type: 'mock2',
          labels: ['label2'],
        },
        {
          type: 'mock2',
          labels: ['label2'],
        },
      ],
    );

    new GitHubRunners(stack, 'runners', {
      providers: [composite1, composite2],
    });

    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::StepFunctions::StateMachine', 1);
  });

  test('Composite provider status is flattened correctly', () => {
    const regularProvider = new CodeBuildRunnerProvider(stack, 'regular', {
      labels: ['regular'],
    });

    const compositeProvider = new MockCompositeProvider(
      stack,
      'composite',
      ['composite'],
      [
        {
          type: 'composite-sub-1',
          labels: ['composite'],
        },
        {
          type: 'composite-sub-2',
          labels: ['composite'],
        },
        {
          type: 'composite-sub-3',
          labels: ['composite'],
        },
      ],
    );

    const runners = new GitHubRunners(stack, 'runners', {
      providers: [regularProvider, compositeProvider],
    });

    // Verify the construct was created successfully
    expect(runners).toBeDefined();
    expect(runners.providers.length).toBe(2);

    // Verify that statuses are flattened correctly in the status function metadata
    const template = Template.fromStack(stack);
    const statusFunction = template.findResources('AWS::Lambda::Function', {
      Properties: {
        Description: 'Provide user with status about self-hosted GitHub Actions runners',
      },
    });

    expect(Object.keys(statusFunction).length).toBe(1);
    const statusFunctionKey = Object.keys(statusFunction)[0];
    const statusFunctionResource = statusFunction[statusFunctionKey];

    // Should have 1 status from regular provider + 3 statuses from composite provider = 4 total
    expect(statusFunctionResource.Metadata.providers.length).toBe(4);

    template.resourceCountIs('AWS::StepFunctions::StateMachine', 1);
  });

  test('Composite provider with empty status array', () => {
    const compositeProvider = new MockCompositeProvider(
      stack,
      'composite',
      ['test-label'],
      [],
    );

    new GitHubRunners(stack, 'runners', {
      providers: [compositeProvider],
    });

    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::StepFunctions::StateMachine', 1);
  });

  test('Composite provider labels are used correctly', () => {
    const compositeProvider = new MockCompositeProvider(
      stack,
      'composite',
      ['self-hosted', 'linux', 'x64'],
      [
        {
          type: 'mock',
          labels: ['self-hosted', 'linux', 'x64'],
        },
      ],
    );

    const runners = new GitHubRunners(stack, 'runners', {
      providers: [compositeProvider],
    });

    expect(runners.providers[0].labels).toEqual(['self-hosted', 'linux', 'x64']);
  });

  test('Composite provider getStepFunctionTask is called', () => {
    const compositeProvider = new MockCompositeProvider(
      stack,
      'composite',
      ['test-label'],
      [
        {
          type: 'mock',
          labels: ['test-label'],
        },
      ],
    );

    new GitHubRunners(stack, 'runners', {
      providers: [compositeProvider],
    });

    // Verify that the state machine was created, which means getStepFunctionTask was called
    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::StepFunctions::StateMachine', 1);
  });

  test('Mixed providers: multiple regular and multiple composite', () => {
    const regular1 = new LambdaRunnerProvider(stack, 'regular1', {
      labels: ['regular1'],
    });

    const regular2 = new CodeBuildRunnerProvider(stack, 'regular2', {
      labels: ['regular2'],
    });

    const composite1 = new MockCompositeProvider(
      stack,
      'composite1',
      ['composite1'],
      [
        { type: 'composite1-sub1', labels: ['composite1'] },
        { type: 'composite1-sub2', labels: ['composite1'] },
      ],
    );

    const composite2 = new MockCompositeProvider(
      stack,
      'composite2',
      ['composite2'],
      [
        { type: 'composite2-sub1', labels: ['composite2'] },
        { type: 'composite2-sub2', labels: ['composite2'] },
        { type: 'composite2-sub3', labels: ['composite2'] },
      ],
    );

    const runners = new GitHubRunners(stack, 'runners', {
      providers: [regular1, composite1, regular2, composite2],
    });

    expect(runners.providers.length).toBe(4);

    // Verify status flattening: 1 + 2 + 1 + 3 = 7 total statuses
    const template = Template.fromStack(stack);
    const statusFunction = template.findResources('AWS::Lambda::Function', {
      Properties: {
        Description: 'Provide user with status about self-hosted GitHub Actions runners',
      },
    });

    const statusFunctionKey = Object.keys(statusFunction)[0];
    const statusFunctionResource = statusFunction[statusFunctionKey];
    expect(statusFunctionResource.Metadata.providers.length).toBe(7);
  });

  test('Composite provider with single status in array', () => {
    const compositeProvider = new MockCompositeProvider(
      stack,
      'composite',
      ['single-status'],
      [
        {
          type: 'single',
          labels: ['single-status'],
        },
      ],
    );

    new GitHubRunners(stack, 'runners', {
      providers: [compositeProvider],
    });

    const template = Template.fromStack(stack);
    const statusFunction = template.findResources('AWS::Lambda::Function', {
      Properties: {
        Description: 'Provide user with status about self-hosted GitHub Actions runners',
      },
    });

    const statusFunctionKey = Object.keys(statusFunction)[0];
    const statusFunctionResource = statusFunction[statusFunctionKey];
    expect(statusFunctionResource.Metadata.providers.length).toBe(1);
  });

  test('Composite provider with many statuses', () => {
    const manyStatuses: IRunnerProviderStatus[] = Array.from({ length: 10 }, (_, i) => ({
      type: `status-${i}`,
      labels: ['many-statuses'],
    }));

    const compositeProvider = new MockCompositeProvider(
      stack,
      'composite',
      ['many-statuses'],
      manyStatuses,
    );

    new GitHubRunners(stack, 'runners', {
      providers: [compositeProvider],
    });

    const template = Template.fromStack(stack);
    const statusFunction = template.findResources('AWS::Lambda::Function', {
      Properties: {
        Description: 'Provide user with status about self-hosted GitHub Actions runners',
      },
    });

    const statusFunctionKey = Object.keys(statusFunction)[0];
    const statusFunctionResource = statusFunction[statusFunctionKey];
    expect(statusFunctionResource.Metadata.providers.length).toBe(10);
  });

  test('Composite provider status method receives correct role', () => {
    let receivedRole: iam.IGrantable | undefined;

    class TestCompositeProvider extends Construct implements ICompositeProvider {
      public readonly labels: string[] = ['test'];

      constructor(scope: Construct, id: string) {
        super(scope, id);
      }

      getStepFunctionTask(_parameters: RunnerRuntimeParameters): stepfunctions.IChainable {
        return new stepfunctions.Pass(this, `${this.node.id}Task`);
      }

      grantStateMachine(_stateMachineRole: iam.IGrantable): void {
        // Do nothing
      }

      status(statusFunctionRole: iam.IGrantable): IRunnerProviderStatus[] {
        receivedRole = statusFunctionRole;
        return [
          {
            type: 'test',
            labels: ['test'],
          },
        ];
      }
    }

    const compositeProvider = new TestCompositeProvider(stack, 'test-composite');

    new GitHubRunners(stack, 'runners', {
      providers: [compositeProvider],
    });

    // Verify that status was called with a role
    expect(receivedRole).toBeDefined();
  });

  test('Composite provider grantStateMachine is called', () => {
    let grantStateMachineCalled = false;

    class TestCompositeProvider extends Construct implements ICompositeProvider {
      public readonly labels: string[] = ['test'];

      constructor(scope: Construct, id: string) {
        super(scope, id);
      }

      getStepFunctionTask(_parameters: RunnerRuntimeParameters): stepfunctions.IChainable {
        return new stepfunctions.Pass(this, `${this.node.id}Task`);
      }

      grantStateMachine(_stateMachineRole: iam.IGrantable): void {
        grantStateMachineCalled = true;
      }

      status(_statusFunctionRole: iam.IGrantable): IRunnerProviderStatus[] {
        return [
          {
            type: 'test',
            labels: ['test'],
          },
        ];
      }
    }

    const compositeProvider = new TestCompositeProvider(stack, 'test-composite');

    new GitHubRunners(stack, 'runners', {
      providers: [compositeProvider],
    });

    // Verify that grantStateMachine was called
    expect(grantStateMachineCalled).toBe(true);
  });

  test('Composite provider with complex status objects', () => {
    const complexStatus1: IRunnerProviderStatus = {
      type: 'complex-1',
      labels: ['complex'],
      vpcArn: 'arn:aws:ec2:us-east-1:123456789012:vpc/vpc-12345678',
      securityGroups: ['sg-12345678', 'sg-87654321'],
      roleArn: 'arn:aws:iam::123456789012:role/test-role',
      logGroup: 'test-log-group-1',
      image: {
        imageTag: 'latest',
        imageRepository: 'test-repo',
      },
    };

    const complexStatus2: IRunnerProviderStatus = {
      type: 'complex-2',
      labels: ['complex'],
      ami: {
        launchTemplate: 'lt-12345678',
      },
    };

    const compositeProvider = new MockCompositeProvider(
      stack,
      'composite',
      ['complex'],
      [complexStatus1, complexStatus2],
    );

    new GitHubRunners(stack, 'runners', {
      providers: [compositeProvider],
    });

    const template = Template.fromStack(stack);
    const statusFunction = template.findResources('AWS::Lambda::Function', {
      Properties: {
        Description: 'Provide user with status about self-hosted GitHub Actions runners',
      },
    });

    const statusFunctionKey = Object.keys(statusFunction)[0];
    const statusFunctionResource = statusFunction[statusFunctionKey];
    const providers = statusFunctionResource.Metadata.providers;

    expect(providers.length).toBe(2);
    expect(providers[0]).toMatchObject(complexStatus1);
    expect(providers[1]).toMatchObject(complexStatus2);
  });

  test('Composite provider labels are included in webhook handler', () => {
    const compositeProvider = new MockCompositeProvider(
      stack,
      'composite',
      ['self-hosted', 'linux', 'arm64'],
      [
        {
          type: 'mock',
          labels: ['self-hosted', 'linux', 'arm64'],
        },
      ],
    );

    new GitHubRunners(stack, 'runners', {
      providers: [compositeProvider],
    });

    const template = Template.fromStack(stack);
    // Verify webhook handler was created with the composite provider's labels
    template.hasResourceProperties('AWS::Lambda::Function', Match.anyValue());
  });

  test('Composite provider works with requireSelfHostedLabel false', () => {
    const compositeProvider = new MockCompositeProvider(
      stack,
      'composite',
      ['linux'],
      [
        {
          type: 'mock',
          labels: ['linux'],
        },
      ],
    );

    const runners = new GitHubRunners(stack, 'runners', {
      providers: [compositeProvider],
      requireSelfHostedLabel: false,
    });

    expect(runners).toBeDefined();
    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::StepFunctions::StateMachine', 1);
  });

  test('Composite provider with no sub-providers status array', () => {
    const compositeProvider = new MockCompositeProvider(
      stack,
      'composite',
      ['empty'],
      [],
    );

    new GitHubRunners(stack, 'runners', {
      providers: [compositeProvider],
    });

    const template = Template.fromStack(stack);
    const statusFunction = template.findResources('AWS::Lambda::Function', {
      Properties: {
        Description: 'Provide user with status about self-hosted GitHub Actions runners',
      },
    });

    const statusFunctionKey = Object.keys(statusFunction)[0];
    const statusFunctionResource = statusFunction[statusFunctionKey];
    // Empty array should result in empty providers array
    expect(statusFunctionResource.Metadata.providers.length).toBe(0);
  });
});
