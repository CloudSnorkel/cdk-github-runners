import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2, aws_ecs as ecs, aws_stepfunctions as sfn } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import { CodeBuildRunnerProvider, Ec2RunnerProvider, EcsRunnerProvider, FargateRunnerProvider, LambdaRunnerProvider } from '../src';
import { cleanUp } from './test-utils';

describe('Providers', () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'test');
  });

  afterEach(() => cleanUp(app));

  test('CodeBuild provider', () => {

    new CodeBuildRunnerProvider(stack, 'provider', {
      timeout: cdk.Duration.hours(2),
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::CodeBuild::Project', Match.objectLike({
      TimeoutInMinutes: 120,
    }));
  });

  test('CodeBuild provider privileged', () => {

    new CodeBuildRunnerProvider(stack, 'provider false', {
      dockerInDocker: false,
    });

    new CodeBuildRunnerProvider(stack, 'provider true', {
      dockerInDocker: true,
    });

    new CodeBuildRunnerProvider(stack, 'provider default');

    const template = Template.fromStack(stack);

    template.resourcePropertiesCountIs('AWS::CodeBuild::Project', Match.objectLike({
      Environment: {
        PrivilegedMode: true,
      },
    }), 2/*runners*/ + 3/*image builders*/);

    template.hasResourceProperties('AWS::CodeBuild::Project', Match.objectLike({
      Environment: {
        PrivilegedMode: false,
      },
    }));
  });

  test('Lambda provider', () => {

    new LambdaRunnerProvider(stack, 'provider', {
      timeout: cdk.Duration.minutes(5),
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
      Timeout: 300,
    }));
  });

  test('Fargate provider', () => {

    const vpc = new ec2.Vpc(stack, 'vpc');
    const sg = new ec2.SecurityGroup(stack, 'sg', { vpc });

    new FargateRunnerProvider(stack, 'provider', {
      vpc: vpc,
      securityGroups: [sg],
      ephemeralStorageGiB: 100,
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
      EphemeralStorage: { SizeInGiB: 100 },
    }));
  });

  describe('ECS provider', () => {
    test('Basic', () => {

      const vpc = new ec2.Vpc(stack, 'vpc');
      const sg = new ec2.SecurityGroup(stack, 'sg', { vpc });

      new EcsRunnerProvider(stack, 'provider', {
        vpc: vpc,
        securityGroups: [sg],
      });

      const template = Template.fromStack(stack);

      template.resourceCountIs('AWS::ECS::Cluster', 1);
      template.resourceCountIs('AWS::AutoScaling::AutoScalingGroup', 1);

      template.hasResourceProperties('AWS::ECS::TaskDefinition', Match.objectLike({
        NetworkMode: 'bridge',
        RequiresCompatibilities: ['EC2'],
        ContainerDefinitions: [
          {
            Name: 'runner',
          },
        ],
      }));
    });

    test('Custom capacity provider', () => {
      const vpc = new ec2.Vpc(stack, 'vpc');
      const sg = new ec2.SecurityGroup(stack, 'sg', { vpc });

      new EcsRunnerProvider(stack, 'provider', {
        vpc: vpc,
        securityGroups: [sg],
        capacityProvider: new ecs.AsgCapacityProvider(stack, 'Capacity Provider', {
          autoScalingGroup: new autoscaling.AutoScalingGroup(stack, 'Auto Scaling Group', {
            vpc: vpc,
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
            machineImage: ecs.EcsOptimizedImage.amazonLinux2(),
            minCapacity: 1,
            maxCapacity: 3,
          }),
        }),
      });

      const template = Template.fromStack(stack);

      // don't create our own autoscaling group when capacity provider is specified
      template.resourceCountIs('AWS::AutoScaling::AutoScalingGroup', 1);
    });

    test('Memory reservation', () => {
      const vpc = new ec2.Vpc(stack, 'vpc');
      const sg = new ec2.SecurityGroup(stack, 'sg', { vpc });

      // test that not specifying any memory settings uses the default values
      new EcsRunnerProvider(stack, 'nothing', {
        vpc: vpc,
        securityGroups: [sg],
      });

      // test that specifying memory limit overrides the default value
      new EcsRunnerProvider(stack, 'with limit', {
        vpc: vpc,
        securityGroups: [sg],
        memoryLimitMiB: 2048,
      });

      // test that specifying memory reservation removes the default value of memory limit
      new EcsRunnerProvider(stack, 'with res', {
        vpc: vpc,
        securityGroups: [sg],
        memoryReservationMiB: 1024,
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::ECS::TaskDefinition', Match.objectLike({
        ContainerDefinitions: [
          {
            Memory: 3500,
            MemoryReservation: Match.absent(),
          },
        ],
      }));

      template.hasResourceProperties('AWS::ECS::TaskDefinition', Match.objectLike({
        ContainerDefinitions: [
          {
            Memory: 2048,
            MemoryReservation: Match.absent(),
          },
        ],
      }));

      template.hasResourceProperties('AWS::ECS::TaskDefinition', Match.objectLike({
        ContainerDefinitions: [
          {
            Memory: Match.absent(),
            MemoryReservation: 1024,
          },
        ],
      }));
    });

    test('passes PlacementStrategy to RunTask', () => {
      const vpc = new ec2.Vpc(stack, 'vpc');
      const sg = new ec2.SecurityGroup(stack, 'sg', { vpc });

      const provider = new EcsRunnerProvider(stack, 'providerPlacement', {
        vpc,
        securityGroups: [sg],
        labels: ['ecs-placement'],
        placementStrategies: [ecs.PlacementStrategy.packedByCpu()],
      });

      const task = provider.getStepFunctionTask({
        runnerTokenPath: '$.runner.token',
        runnerNamePath: '$$.Execution.Name',
        ownerPath: '$.owner',
        repoPath: '$.repo',
        registrationUrl: 'https://github.com',
        githubDomainPath: 'github.com',
        labelsPath: '$.labels',
      });

      new sfn.StateMachine(stack, 'sm', {
        definitionBody: sfn.DefinitionBody.fromChainable(task),
      });

      const template = Template.fromStack(stack);

      function extractStateMachineDefinition(tmpl: Template): string {
        const sms = tmpl.findResources('AWS::StepFunctions::StateMachine');
        const smKeys = Object.keys(sms);
        if (smKeys.length !== 1) throw new Error(`expected 1 SM, got ${smKeys.length}`);
        const sm = sms[smKeys[0]];
        const def = sm.Properties.DefinitionString;
        const parts = def?.['Fn::Join']?.[1];
        if (!Array.isArray(parts)) throw new Error('unexpected DefinitionString shape');
        return parts.map((p: any) => (typeof p === 'string' ? p : '')).join('');
      }

      const def = JSON.parse(extractStateMachineDefinition(template));
      const ecsPlacement = def?.States?.providerPlacement;
      expect(ecsPlacement?.Type).toBe('Task');
      const ps = ecsPlacement?.Parameters?.PlacementStrategy;
      expect(Array.isArray(ps)).toBe(true);
      expect(ps).toEqual([{ Field: 'CPU', Type: 'binpack' }]);
    });

    test('passes PlacementConstraints to RunTask', () => {
      const vpc = new ec2.Vpc(stack, 'vpc');
      const sg = new ec2.SecurityGroup(stack, 'sg', { vpc });

      const provider = new EcsRunnerProvider(stack, 'providerPlacementConstraints', {
        vpc,
        securityGroups: [sg],
        labels: ['ecs-constraints'],
        placementConstraints: [ecs.PlacementConstraint.distinctInstances()],
      });

      const task = provider.getStepFunctionTask({
        runnerTokenPath: '$.runner.token',
        runnerNamePath: '$$.Execution.Name',
        ownerPath: '$.owner',
        repoPath: '$.repo',
        registrationUrl: 'https://github.com',
        githubDomainPath: 'github.com',
        labelsPath: '$.labels',
      });

      new sfn.StateMachine(stack, 'sm-constraints', {
        definitionBody: sfn.DefinitionBody.fromChainable(task),
      });

      const template = Template.fromStack(stack);

      function extractStateMachineDefinition(tmpl: Template): string {
        const sms = tmpl.findResources('AWS::StepFunctions::StateMachine');
        const smKeys = Object.keys(sms);
        if (smKeys.length !== 1) throw new Error(`expected 1 SM, got ${smKeys.length}`);
        const sm = sms[smKeys[0]];
        const def = sm.Properties.DefinitionString;
        const parts = def?.['Fn::Join']?.[1];
        if (!Array.isArray(parts)) throw new Error('unexpected DefinitionString shape');
        return parts.map((p: any) => (typeof p === 'string' ? p : '')).join('');
      }

      const def = JSON.parse(extractStateMachineDefinition(template));
      const ecsTask = def?.States?.providerPlacementConstraints;
      expect(ecsTask?.Type).toBe('Task');
      const pc = ecsTask?.Parameters?.PlacementConstraints;
      expect(Array.isArray(pc)).toBe(true);
      expect(pc).toEqual([{ Type: 'distinctInstance' }]);
    });
  });

  describe('EC2 provider', () => {
    test('Storage size mismatch', () => {
      const vpc = new ec2.Vpc(stack, 'vpc');
      const sg = new ec2.SecurityGroup(stack, 'sg', { vpc });

      const ib = Ec2RunnerProvider.imageBuilder(stack, 'builder', {
        vpc: vpc,
        awsImageBuilderOptions: {
          storageSize: cdk.Size.gibibytes(50),
        },
      });

      expect(() => {
        new Ec2RunnerProvider(stack, 'provider 1', {
          vpc: vpc,
          securityGroups: [sg],
          imageBuilder: ib,
        });
      }).toThrow('Runner storage size (30 GiB) must be at least the same as the image builder storage size (50 GiB)');

      new Ec2RunnerProvider(stack, 'provider 2', {
        vpc: vpc,
        securityGroups: [sg],
        imageBuilder: ib,
        storageSize: cdk.Size.gibibytes(50),
      });

      new Ec2RunnerProvider(stack, 'provider 3', {
        vpc: vpc,
        securityGroups: [sg],
        imageBuilder: ib,
        storageSize: cdk.Size.gibibytes(500),
      });
    });
  });
});