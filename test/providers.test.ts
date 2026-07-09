import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2, aws_ecs as ecs, aws_stepfunctions as sfn } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { Architecture, CodeBuildRunnerProvider, Ec2RunnerProvider, EcsRunnerProvider, FargateRunnerProvider, GitHubRunners, LambdaRunnerProvider, Os } from '../src';

describe('Providers', () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'test');
  });

  afterAll(CloudAssembly.cleanupTemporaryDirectories);

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

    test('storageOptions without storageSize adds error annotation and synthesizes', () => {
      const vpc = new ec2.Vpc(stack, 'vpc');
      const sg = new ec2.SecurityGroup(stack, 'sg', { vpc });

      new EcsRunnerProvider(stack, 'providerNoSize', {
        vpc,
        securityGroups: [sg],
        storageOptions: { volumeType: ec2.EbsDeviceVolumeType.GP3 },
      });

      Annotations.fromStack(stack).hasError(
        '/test/providerNoSize',
        'storageSize is required when storageOptions are specified',
      );

      Template.fromStack(stack);
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

    test('Default image builder uses ARM architecture when ARM instance type is selected', () => {
      const vpc = new ec2.Vpc(stack, 'vpc');
      const sg = new ec2.SecurityGroup(stack, 'sg', { vpc });

      new EcsRunnerProvider(stack, 'providerArm', {
        vpc,
        securityGroups: [sg],
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.M6G, ec2.InstanceSize.LARGE),
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', Match.objectLike({
        Environment: {
          Type: 'ARM_CONTAINER',
        },
      }));
    });

    test('Default image builder uses x86 architecture when no ARM instance type is selected', () => {
      const vpc = new ec2.Vpc(stack, 'vpc');
      const sg = new ec2.SecurityGroup(stack, 'sg', { vpc });

      new EcsRunnerProvider(stack, 'providerX86', {
        vpc,
        securityGroups: [sg],
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CodeBuild::Project', Match.objectLike({
        Environment: {
          Type: 'LINUX_CONTAINER',
        },
      }));
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

      const runtimeParamsPlacement = {
        runnerTokenPath: '$.runner.token',
        runnerNamePath: '$$.Execution.Name',
        ownerPath: '$.owner',
        repoPath: '$.repo',
        registrationUrl: 'https://github.com',
        githubDomainPath: 'github.com',
        labelsPath: '$.labels',
        addCatchAndCleanUp: (state: sfn.State | sfn.StateMachineFragment | sfn.Parallel, next?: sfn.IChainable) => {
          (state as sfn.TaskStateBase | sfn.Parallel).addCatch(next ?? new sfn.Pass(stack, 'CleanupStubPlacement'), {
            errors: [sfn.Errors.ALL],
            resultPath: '$.error',
          });
        },
      };
      const task = provider.getStepFunctionTask(runtimeParamsPlacement);

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

      const runtimeParams = {
        runnerTokenPath: '$.runner.token',
        runnerNamePath: '$$.Execution.Name',
        ownerPath: '$.owner',
        repoPath: '$.repo',
        registrationUrl: 'https://github.com',
        githubDomainPath: 'github.com',
        labelsPath: '$.labels',
        addCatchAndCleanUp: (state: sfn.State | sfn.StateMachineFragment | sfn.Parallel, next?: sfn.IChainable) => {
          (state as sfn.TaskStateBase | sfn.Parallel).addCatch(next ?? new sfn.Pass(stack, 'CleanupStubConstraints'), {
            errors: [sfn.Errors.ALL],
            resultPath: '$.error',
          });
        },
      };
      const task = provider.getStepFunctionTask(runtimeParams);

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

      new Ec2RunnerProvider(stack, 'provider 1', {
        vpc: vpc,
        securityGroups: [sg],
        imageBuilder: ib,
      });

      Annotations.fromStack(stack).hasError(
        '/test/provider 1',
        Match.stringLikeRegexp('Runner storage size \\(30 GiB\\) must be at least the same as the image builder storage size \\(50 GiB\\)'),
      );
      Template.fromStack(stack);

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

    test('Default image builder uses ARM build instance when runner instance type is ARM', () => {
      const vpc = new ec2.Vpc(stack, 'vpc');
      const sg = new ec2.SecurityGroup(stack, 'sg', { vpc });

      new Ec2RunnerProvider(stack, 'provider arm', {
        vpc,
        securityGroups: [sg],
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.M6G, ec2.InstanceSize.LARGE),
      });

      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::ImageBuilder::InfrastructureConfiguration', Match.objectLike({
        InstanceTypes: ['m6g.large'],
      }));
    });

    test('No custom user data commands', () => {
      const vpc = new ec2.Vpc(stack, 'vpc');
      const sg = new ec2.SecurityGroup(stack, 'sg', { vpc });

      const provider = new Ec2RunnerProvider(stack, 'provider', {
        vpc,
        securityGroups: [sg],
      });

      const consts = provider.stepFunctionConstants();
      expect(Object.keys(consts)).toEqual(['ec2UserDataLinux']);
      expect(consts.ec2UserDataLinux).not.toContain('%EXTRA_USER_DATA_COMMANDS%');
    });

    test('Custom user data commands', () => {
      const vpc = new ec2.Vpc(stack, 'vpc');
      const sg = new ec2.SecurityGroup(stack, 'sg', { vpc });

      const provider = new Ec2RunnerProvider(stack, 'provider', {
        vpc,
        securityGroups: [sg],
        userDataCommands: [
          'curl -sSL https://example.com/install.sh | bash',
          'echo "braces ${LIKE_THIS} and $& are kept literal"',
        ],
      });

      const consts = provider.stepFunctionConstants();
      const keys = Object.keys(consts);
      expect(keys).toHaveLength(1);
      // key must be unique so multiple providers with different commands don't clash in $.consts
      expect(keys[0]).toMatch(/^ec2UserDataLinux.+/);

      const template = consts[keys[0]];
      expect(template).not.toContain('%EXTRA_USER_DATA_COMMANDS%');
      expect(template).toContain('curl -sSL https://example.com/install.sh | bash');
      // braces in commands must be escaped so States.Format doesn't treat them as placeholders
      expect(template).toContain('echo "braces $\\{LIKE_THIS\\} and $& are kept literal"');
      // commands must run before the runner starts
      expect(template.indexOf('curl -sSL')).toBeLessThan(template.indexOf('heartbeat &'));
      // intentional placeholders must be preserved
      expect(template).toContain('TASK_TOKEN="{}"');
    });

    test('Custom user data commands on Windows', () => {
      const vpc = new ec2.Vpc(stack, 'vpc');
      const sg = new ec2.SecurityGroup(stack, 'sg', { vpc });

      const provider = new Ec2RunnerProvider(stack, 'provider', {
        vpc,
        securityGroups: [sg],
        imageBuilder: Ec2RunnerProvider.imageBuilder(stack, 'builder', {
          vpc,
          securityGroups: [sg],
          os: Os.WINDOWS,
          architecture: Architecture.X86_64,
        }),
        userDataCommands: ['Invoke-WebRequest -Uri https://example.com/install.ps1 | Invoke-Expression'],
      });

      const consts = provider.stepFunctionConstants();
      const keys = Object.keys(consts);
      expect(keys).toHaveLength(1);
      expect(keys[0]).toMatch(/^ec2UserDataWindows.+/);

      const template = consts[keys[0]];
      expect(template).not.toContain('%EXTRA_USER_DATA_COMMANDS%');
      expect(template).toContain('Invoke-WebRequest -Uri https://example.com/install.ps1 | Invoke-Expression');
      expect(template.indexOf('Invoke-WebRequest -Uri https://example.com/install.ps1')).toBeLessThan(template.indexOf('$HeartbeatParentPid'));
    });

    test('Multiple providers with different user data commands', () => {
      const vpc = new ec2.Vpc(stack, 'vpc');
      const sg = new ec2.SecurityGroup(stack, 'sg', { vpc });

      const provider1 = new Ec2RunnerProvider(stack, 'provider 1', {
        labels: ['one'],
        vpc,
        securityGroups: [sg],
        userDataCommands: ['echo one'],
      });
      const provider2 = new Ec2RunnerProvider(stack, 'provider 2', {
        labels: ['two'],
        vpc,
        securityGroups: [sg],
        userDataCommands: ['echo two'],
      });
      const provider3 = new Ec2RunnerProvider(stack, 'provider 3', {
        labels: ['three'],
        vpc,
        securityGroups: [sg],
      });

      // merging constants of all providers must not throw a duplicate key error
      expect(() => new GitHubRunners(stack, 'runners', {
        providers: [provider1, provider2, provider3],
      })).not.toThrow();
    });
  });
});
