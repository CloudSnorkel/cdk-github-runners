import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2, aws_ecs as ecs, aws_stepfunctions as sfn } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import * as autoscaling from 'aws-cdk-lib/aws-autoscaling';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import {
  Architecture,
  CodeBuildRunnerProvider,
  Ec2RunnerProvider,
  EcsRunnerProvider,
  FargateRunnerProvider,
  IRunnerImageBuilder,
  LambdaRunnerProvider,
  Os,
  RunnerVersion,
} from '../src';
import { stateMachineDefinition } from './sfn-helpers';

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

      const def = stateMachineDefinition(template);
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

      const def = stateMachineDefinition(template);
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

    test('tags are merged into RunInstances TagSpecifications', () => {
      const vpc = new ec2.Vpc(stack, 'vpc');
      const sg = new ec2.SecurityGroup(stack, 'sg', { vpc });

      const provider = new Ec2RunnerProvider(stack, 'provider tags', {
        vpc,
        securityGroups: [sg],
        labels: ['ec2-tags'],
        tags: {
          SecurityMonitoring: 'enabled',
          Name: 'test',
        },
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
          (state as sfn.TaskStateBase | sfn.Parallel).addCatch(next ?? new sfn.Pass(stack, 'CleanupStubTags'), {
            errors: [sfn.Errors.ALL],
            resultPath: '$.error',
          });
        },
      };
      const task = provider.getStepFunctionTask(runtimeParams);

      new sfn.StateMachine(stack, 'sm', {
        definitionBody: sfn.DefinitionBody.fromChainable(task),
      });

      const template = Template.fromStack(stack);

      const def = stateMachineDefinition(template);
      const runInstances = Object.values(def.States).find((state: any) =>
        state?.Parameters?.TagSpecifications,
      ) as any;
      expect(runInstances).toBeDefined();

      for (const spec of runInstances.Parameters.TagSpecifications) {
        expect(['instance', 'volume']).toContain(spec.ResourceType);
        const tags = Object.fromEntries(spec.Tags.map((t: any) => [t.Key, t.Value]));
        expect(tags.SecurityMonitoring).toBe('enabled');
        expect(tags.Name).toBe('test');
        expect(tags['GitHubRunners:Provider']).toBeDefined();
      }
    });
  });

  test('root device resolution re-runs when the AMI recipe changes (issue #962)', () => {
    const vpc = new ec2.Vpc(stack, 'vpc');
    const sg = new ec2.SecurityGroup(stack, 'sg', { vpc });

    const provider = new Ec2RunnerProvider(stack, 'provider', {
      vpc,
      securityGroups: [sg],
    });

    // amiRootDevice() is created inside getStepFunctionTask(), not the constructor, so we have to build it.
    const task = provider.getStepFunctionTask({
      runnerTokenPath: '$.runner.token',
      runnerNamePath: '$$.Execution.Name',
      ownerPath: '$.owner',
      repoPath: '$.repo',
      registrationUrl: 'https://github.com',
      githubDomainPath: 'github.com',
      labelsPath: '$.labels',
      addCatchAndCleanUp: (state: sfn.State | sfn.StateMachineFragment | sfn.Parallel, next?: sfn.IChainable) => {
        (state as sfn.TaskStateBase | sfn.Parallel).addCatch(next ?? new sfn.Pass(stack, 'Cleanup'), {
          errors: [sfn.Errors.ALL],
          resultPath: '$.error',
        });
      },
    });
    new sfn.StateMachine(stack, 'sm', { definitionBody: sfn.DefinitionBody.fromChainable(task) });

    const template = Template.fromStack(stack);

    // The provider sizes the root volume by device name, so it must re-resolve the AMI's root device
    // whenever a new AMI is built. CacheKey is wired to the recipe version so the custom resource re-runs
    // on a recipe change (e.g. a base OS switch that moves the root device) instead of freezing at the
    // first deploy — the #962 bug.
    template.hasResourceProperties('Custom::AmiRootDevice', Match.objectLike({
      CacheKey: {
        'Fn::GetAtt': [Match.stringLikeRegexp('AmiRecipe'), 'Version'],
      },
    }));
  });

  test('externally-provided AMI resolves root device once (no cacheKey, no build dependency)', () => {
    const vpc = new ec2.Vpc(stack, 'vpc');
    const sg = new ec2.SecurityGroup(stack, 'sg', { vpc });

    // object-literal builder pointing at an existing AMI — the interface explicitly allows this
    const byoBuilder: IRunnerImageBuilder = {
      bindDockerImage() { throw new Error('not used'); },
      bindAmi() {
        return {
          launchTemplate: ec2.LaunchTemplate.fromLaunchTemplateAttributes(stack, 'byo-lt', { launchTemplateId: 'lt-01234567' }),
          architecture: Architecture.X86_64,
          os: Os.LINUX_UBUNTU_2404,
          runnerVersion: RunnerVersion.latest(),
          // no cacheKey
        };
      },
    };

    const provider = new Ec2RunnerProvider(stack, 'byo', {
      vpc,
      securityGroups: [sg],
      imageBuilder: byoBuilder,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.LARGE),
    });

    // must not throw: the object-literal builder isn't a construct, so addDependency is skipped
    const task = provider.getStepFunctionTask({
      runnerTokenPath: '$.runner.token',
      runnerNamePath: '$$.Execution.Name',
      ownerPath: '$.owner',
      repoPath: '$.repo',
      registrationUrl: 'https://github.com',
      githubDomainPath: 'github.com',
      labelsPath: '$.labels',
      addCatchAndCleanUp: (state: sfn.State | sfn.StateMachineFragment | sfn.Parallel, next?: sfn.IChainable) => {
        (state as sfn.TaskStateBase | sfn.Parallel).addCatch(next ?? new sfn.Pass(stack, 'CleanupByo'), {
          errors: [sfn.Errors.ALL],
          resultPath: '$.error',
        });
      },
    });
    new sfn.StateMachine(stack, 'sm-byo', { definitionBody: sfn.DefinitionBody.fromChainable(task) });

    const template = Template.fromStack(stack);

    // no version to key on → resolve once, exactly like before the fix
    template.hasResourceProperties('Custom::AmiRootDevice', Match.objectLike({
      CacheKey: Match.absent(),
    }));
  });
});
