import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import {
  AmiBuilder,
  Architecture,
  CodeBuildRunnerProvider,
  ContainerImageBuilder,
  Ec2RunnerProvider,
  FargateRunnerProvider,
  GitHubRunners,
  LambdaRunnerProvider,
  Os,
  RunnerImageBuilder,
  RunnerImageBuilderType,
  RunnerImageComponent,
} from '../src';

test('AMI builder matching instance type (DEPRECATED)', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const vpc = new ec2.Vpc(stack, 'vpc');

  expect(() => {
    new AmiBuilder(stack, 'linux arm64', {
      os: Os.LINUX,
      architecture: Architecture.ARM64,
      vpc,
    });
  }).toThrowError('Builder architecture (ARM64) doesn\'t match selected instance type (m6i.large / x86_64)');
});

test('AMI builder matching instance type', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const vpc = new ec2.Vpc(stack, 'vpc');

  expect(() => {
    RunnerImageBuilder.new(stack, 'linux arm64', {
      os: Os.LINUX_UBUNTU,
      architecture: Architecture.ARM64,
      vpc,
      builderType: RunnerImageBuilderType.AWS_IMAGE_BUILDER,
    });
  }).toThrowError('Builder architecture (ARM64) doesn\'t match selected instance type (m6i.large / x86_64)');
});

test('AMI builder supported OS', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const vpc = new ec2.Vpc(stack, 'vpc');

  new AmiBuilder(stack, 'linux x64', {
    os: Os.LINUX,
    architecture: Architecture.X86_64,
    vpc,
  });
  new AmiBuilder(stack, 'linux arm64', {
    os: Os.LINUX,
    architecture: Architecture.ARM64,
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.M6G, ec2.InstanceSize.LARGE),
    vpc,
  });
  new AmiBuilder(stack, 'win x64', {
    os: Os.WINDOWS,
    architecture: Architecture.X86_64,
    vpc,
  });
  new AmiBuilder(stack, 'win arm64', {
    os: Os.WINDOWS,
    architecture: Architecture.ARM64,
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.M6G, ec2.InstanceSize.LARGE),
    vpc,
  });
});

test('AMI do not skip docker', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const vpc = new ec2.Vpc(stack, 'vpc');

  new AmiBuilder(stack, 'windows', {
    os: Os.WINDOWS,
    vpc,
    installDocker: true,
  });

  const template = Template.fromStack(stack);

  template.hasResourceProperties(
    'AWS::ImageBuilder::Component',
    Match.objectLike({
      Description: 'Install latest version of Docker',
    }),
  );
});

test('AMI skip docker', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const vpc = new ec2.Vpc(stack, 'vpc');

  new AmiBuilder(stack, 'windows', {
    os: Os.WINDOWS,
    vpc,
    installDocker: false,
  });

  const template = Template.fromStack(stack);

  template.resourcePropertiesCountIs(
    'AWS::ImageBuilder::Component',
    Match.objectLike({
      Description: 'Install latest version of Docker',
    }),
    0,
  );
});

test('Container image builder supported OS', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const vpc = new ec2.Vpc(stack, 'vpc');

  expect(() => {
    new ContainerImageBuilder(stack, 'linux x64', {
      os: Os.LINUX,
      architecture: Architecture.X86_64,
      vpc,
    });
  }).toThrowError('Unsupported OS: Linux.');
  expect(() => {
    new ContainerImageBuilder(stack, 'linux arm64', {
      os: Os.LINUX,
      architecture: Architecture.ARM64,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.M6G, ec2.InstanceSize.LARGE),
      vpc,
    });
  }).toThrowError('Unsupported architecture: ARM64. Consider CodeBuild for faster image builds.');
  new ContainerImageBuilder(stack, 'win x64', {
    os: Os.WINDOWS,
    architecture: Architecture.X86_64,
    vpc,
  });
  expect(() => {
    new ContainerImageBuilder(stack, 'win arm64', {
      os: Os.WINDOWS,
      architecture: Architecture.ARM64,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.M6G, ec2.InstanceSize.LARGE),
      vpc,
    });
  }).toThrowError('Unsupported architecture: ARM64. Consider CodeBuild for faster image builds.');
});

test('AWS Image Builder reuse', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const vpc = new ec2.Vpc(stack, 'vpc');

  const builder = FargateRunnerProvider.imageBuilder(stack, 'builder', {
    builderType: RunnerImageBuilderType.AWS_IMAGE_BUILDER,
    vpc,
  });
  builder.bindAmi();
  builder.bindDockerImage();
});

test('Docker component exists by default in image builder', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const vpc = new ec2.Vpc(stack, 'vpc');

  const builder = Ec2RunnerProvider.imageBuilder(stack, 'builder', {
    vpc,
  });

  builder.bindAmi();

  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::ImageBuilder::Component', {
    Description: Match.stringLikeRegexp('Component [0-9]+ Docker'),
  });
});

test('User is able to remove Docker component from image builder', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const vpc = new ec2.Vpc(stack, 'vpc');

  const builder = Ec2RunnerProvider.imageBuilder(stack, 'builder', {
    vpc,
  });

  builder.removeComponent(RunnerImageComponent.docker());
  builder.bindAmi();

  const template = Template.fromStack(stack);

  template.resourcePropertiesCountIs('AWS::ImageBuilder::Component', {
    Description: Match.stringLikeRegexp('Component [0-9]+ Docker'),
  }, 0);
});

test('CodeBuild default image builder has GitHub Runner and Docker-in-Docker', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  new CodeBuildRunnerProvider(stack, 'provider');

  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Source: {
      BuildSpec: {
        'Fn::Join': [
          '',
          Match.arrayWith([
            Match.stringLikeRegexp('component[0-9]+-Docker.sh'),
          ]),
        ],
      },
    },
  });
  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Source: {
      BuildSpec: {
        'Fn::Join': [
          '',
          Match.arrayWith([
            Match.stringLikeRegexp('component[0-9]+-GithubRunner.sh'),
          ]),
        ],
      },
    },
  });
});

test('Fargate default image builder has GitHub Runner', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const vpc = new ec2.Vpc(stack, 'vpc');

  new FargateRunnerProvider(stack, 'provider', { vpc });

  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Source: {
      BuildSpec: {
        'Fn::Join': [
          '',
          Match.arrayWith([
            Match.stringLikeRegexp('component[0-9]+-GithubRunner.sh'),
          ]),
        ],
      },
    },
  });
});

test('EC2 default image builder has GitHub Runner', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const vpc = new ec2.Vpc(stack, 'vpc');

  new Ec2RunnerProvider(stack, 'provider', { vpc });

  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::ImageBuilder::Component', {
    Description: Match.stringLikeRegexp('Component [0-9]+ GithubRunner'),
  });
});

test('Lambda default image builder has GitHub Runner and Lambda entry point', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  new LambdaRunnerProvider(stack, 'provider');

  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::CodeBuild::Project', {
    Source: {
      BuildSpec: {
        'Fn::Join': [
          '',
          Match.arrayWith([
            Match.stringLikeRegexp('component[0-9]+-GithubRunner.sh'),
            Match.stringLikeRegexp('component[0-9]+-Lambda-Entrypoint.sh'),
          ]),
        ],
      },
    },
  });
});

test('Unused builder doesn\'t throw exceptions', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const vpc = new ec2.Vpc(stack, 'vpc');

  LambdaRunnerProvider.imageBuilder(stack, 'codebuild builder');
  Ec2RunnerProvider.imageBuilder(stack, 'ec2 image builder', { vpc });

  new GitHubRunners(stack, 'runners', {
    providers: [new LambdaRunnerProvider(stack, 'p1' /* not using builder on purpose */)],
  }).failedImageBuildsTopic();

  app.synth();
});
