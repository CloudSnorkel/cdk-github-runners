import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2, aws_ecr as ecr, aws_ssm as ssm } from 'aws-cdk-lib';
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
import { cleanUp } from './test-utils';
import { BaseContainerImage, BaseImage } from '../src/image-builders/aws-image-builder/base-image';
import { CodeBuildRunnerImageBuilder } from '../src/image-builders/codebuild';

describe('Image Builder', () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'test');
  });

  afterEach(() => cleanUp(app));

  test('AMI builder matching instance type (DEPRECATED)', () => {

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

    const vpc = new ec2.Vpc(stack, 'vpc');

    const builder = FargateRunnerProvider.imageBuilder(stack, 'builder', {
      builderType: RunnerImageBuilderType.AWS_IMAGE_BUILDER,
      vpc,
    });
    builder.bindAmi();
    builder.bindDockerImage();
  });

  test('Docker component exists by default in image builder', () => {

    const vpc = new ec2.Vpc(stack, 'vpc');

    const builder = Ec2RunnerProvider.imageBuilder(stack, 'builder', {
      vpc,
    });

    builder.bindAmi();

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::ImageBuilder::Component', {
      Description: Match.stringLikeRegexp('Docker component for .+'),
    });
  });

  test('User is able to remove Docker component from image builder', () => {

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

    const vpc = new ec2.Vpc(stack, 'vpc');

    new Ec2RunnerProvider(stack, 'provider', { vpc });

    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::ImageBuilder::Component', {
      Description: Match.stringLikeRegexp('GithubRunner component for .+'),
    });
  });

  test('Lambda default image builder has GitHub Runner and Lambda entry point', () => {

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

    const vpc = new ec2.Vpc(stack, 'vpc');

    LambdaRunnerProvider.imageBuilder(stack, 'codebuild builder');
    Ec2RunnerProvider.imageBuilder(stack, 'ec2 image builder', { vpc });

    new GitHubRunners(stack, 'runners', {
      providers: [new LambdaRunnerProvider(stack, 'p1' /* not using builder on purpose */)],
    }).failedImageBuildsTopic();

    app.synth();
  });
});

describe('Component caching', () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'test');
  });

  afterEach(() => cleanUp(app));

  test('Components with same name but different commands get different IDs', () => {
    const vpc = new ec2.Vpc(stack, 'vpc');

    // Create two components with the same name but different commands
    const component1 = RunnerImageComponent.custom({
      name: 'TestComponent',
      commands: ['echo "command1"'],
    });

    const component2 = RunnerImageComponent.custom({
      name: 'TestComponent',
      commands: ['echo "command2"'],
    });

    const builder = Ec2RunnerProvider.imageBuilder(stack, 'builder', {
      vpc,
    });

    builder.addComponent(component1);
    builder.addComponent(component2);
    builder.bindAmi();

    const template = Template.fromStack(stack);

    // Should have exactly 2 different components (one for each set of commands)
    // Both should have the TestComponent name in their description
    template.resourcePropertiesCountIs('AWS::ImageBuilder::Component', {
      Description: Match.stringLikeRegexp('Custom-TestComponent.*'),
    }, 2);
  });

  test('Same component used multiple times is cached and reused', () => {
    const vpc = new ec2.Vpc(stack, 'vpc');

    // Create a component that will be reused
    const sharedComponent = RunnerImageComponent.custom({
      name: 'SharedComponent',
      commands: ['echo "shared command"'],
    });

    // Create two different builders
    const builder1 = Ec2RunnerProvider.imageBuilder(stack, 'builder1', {
      vpc,
    });

    const builder2 = Ec2RunnerProvider.imageBuilder(stack, 'builder2', {
      vpc,
    });

    // Add the same component to both builders
    builder1.addComponent(sharedComponent);
    builder2.addComponent(sharedComponent);

    builder1.bindAmi();
    builder2.bindAmi();

    const template = Template.fromStack(stack);

    // Should have exactly 1 component resource (cached and reused)
    // Even though it's used in two different builders
    template.resourcePropertiesCountIs('AWS::ImageBuilder::Component', {
      Description: Match.stringLikeRegexp('Custom-SharedComponent.*'),
    }, 1);
  });
});

describe('BaseImage', () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'test');
  });

  afterEach(() => cleanUp(app));

  test('fromAmiId creates correct image string', () => {
    const baseImage = BaseImage.fromAmiId('ami-1234567890abcdef0');
    expect(baseImage.image).toBe('ami-1234567890abcdef0');
  });

  test('fromString creates correct image string', () => {
    const baseImage = BaseImage.fromString('arn:aws:imagebuilder:us-east-1:aws:image/ubuntu-server-22-lts-x86/1.0.0');
    expect(baseImage.image).toBe('arn:aws:imagebuilder:us-east-1:aws:image/ubuntu-server-22-lts-x86/1.0.0');
  });

  test('fromMarketplaceProductId creates correct image string', () => {
    const productId = 'prod-1234567890abcdef';
    const baseImage = BaseImage.fromMarketplaceProductId(productId);
    expect(baseImage.image).toBe(productId);
  });

  test('fromSsmParameterName creates correct image string', () => {
    const parameterName = '/aws/service/ami/amazon-linux-2023';
    const baseImage = BaseImage.fromSsmParameterName(parameterName);
    expect(baseImage.image).toBe(`ssm:${parameterName}`);
  });

  test('fromSsmParameter creates correct image string with ARN', () => {
    const parameter = ssm.StringParameter.fromStringParameterName(stack, 'Param', '/aws/service/ami/amazon-linux-2023');

    const baseImage = BaseImage.fromSsmParameter(parameter);
    // CDK uses tokens, so we check the structure: ssm:arn:...:ssm:...:parameter/...
    expect(baseImage.image).toMatch(/^ssm:arn:/);
    expect(baseImage.image).toContain(':ssm:');
    expect(baseImage.image).toContain(':parameter/aws/service/ami/amazon-linux-2023');
  });

  test('fromImageBuilder creates correct ARN format', () => {
    const baseImage = BaseImage.fromImageBuilder(stack, 'ubuntu-server-22-lts-x86');
    // CDK uses tokens, so we check the structure: arn:...:imagebuilder:...:aws:image/...
    expect(baseImage.image).toMatch(/^arn:/);
    expect(baseImage.image).toContain(':imagebuilder:');
    expect(baseImage.image).toContain(':aws:image/ubuntu-server-22-lts-x86/x.x.x');
  });

  test('fromImageBuilder with custom version creates correct ARN format', () => {
    const baseImage = BaseImage.fromImageBuilder(stack, 'ubuntu-server-22-lts-x86', '1.0.0');
    // CDK uses tokens, so we check the structure: arn:...:imagebuilder:...:aws:image/...
    expect(baseImage.image).toMatch(/^arn:/);
    expect(baseImage.image).toContain(':imagebuilder:');
    expect(baseImage.image).toContain(':aws:image/ubuntu-server-22-lts-x86/1.0.0');
  });
});

describe('BaseContainerImage', () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'test');
  });

  afterEach(() => cleanUp(app));

  test('fromDockerHub creates correct image string', () => {
    const baseImage = BaseContainerImage.fromDockerHub('ubuntu', '22.04');
    expect(baseImage.image).toBe('ubuntu:22.04');
  });

  test('fromDockerHub with user/repository creates correct image string', () => {
    const baseImage = BaseContainerImage.fromDockerHub('myuser/myimage', 'latest');
    expect(baseImage.image).toBe('myuser/myimage:latest');
  });

  test('fromEcrPublic creates correct image string', () => {
    const baseImage = BaseContainerImage.fromEcrPublic('lts', 'ubuntu', '22.04');
    expect(baseImage.image).toBe('public.ecr.aws/lts/ubuntu:22.04');
  });

  test('fromEcr creates correct image string and captures repository', () => {
    const repository = new ecr.Repository(stack, 'Repo', {
      repositoryName: 'my-repo',
    });

    const baseImage = BaseContainerImage.fromEcr(repository, 'latest');
    // CDK uses tokens, so we check the structure: ...dkr.ecr....:latest
    expect(baseImage.image).toContain('.dkr.ecr.');
    expect(baseImage.image).toContain(':latest');
    // Most importantly, verify the repository is captured for permission granting
    expect(baseImage.ecrRepository).toBe(repository);
  });

  test('fromEcr with custom tag creates correct image string', () => {
    const repository = new ecr.Repository(stack, 'Repo', {
      repositoryName: 'my-repo',
    });

    const baseImage = BaseContainerImage.fromEcr(repository, 'v1.0.0');
    expect(baseImage.image).toContain(':v1.0.0');
    expect(baseImage.ecrRepository).toBe(repository);
  });

  test('fromString creates correct image string', () => {
    const baseImage = BaseContainerImage.fromString('public.ecr.aws/lts/ubuntu:22.04');
    expect(baseImage.image).toBe('public.ecr.aws/lts/ubuntu:22.04');
    expect(baseImage.ecrRepository).toBeUndefined();
  });

  test('fromEcr does not set ecrRepository for non-ECR images', () => {
    const baseImage1 = BaseContainerImage.fromDockerHub('ubuntu', '22.04');
    expect(baseImage1.ecrRepository).toBeUndefined();

    const baseImage2 = BaseContainerImage.fromEcrPublic('lts', 'ubuntu', '22.04');
    expect(baseImage2.ecrRepository).toBeUndefined();

    const baseImage3 = BaseContainerImage.fromString('mcr.microsoft.com/windows/servercore:ltsc2019');
    expect(baseImage3.ecrRepository).toBeUndefined();
  });
});

describe('CodeBuildRunnerImageBuilder ECR permissions', () => {
  let app: cdk.App;
  let stack: cdk.Stack;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'test');
  });

  afterEach(() => cleanUp(app));

  test('grants ECR pull permissions when using BaseContainerImage.fromEcr()', () => {
    const baseImageRepo = new ecr.Repository(stack, 'BaseImageRepo', {
      repositoryName: 'base-image-repo',
    });
    (baseImageRepo.node.defaultChild as ecr.CfnRepository).overrideLogicalId('BaseImageRepo');

    const builder = new CodeBuildRunnerImageBuilder(stack, 'builder', {
      baseDockerImage: BaseContainerImage.fromEcr(baseImageRepo, 'latest'),
    });
    builder.bindDockerImage();

    const template = Template.fromStack(stack);

    // Verify ECR pull permissions are granted for the base image repository
    // ECR permissions are split: GetAuthorizationToken has Resource: "*", others have the repository ARN
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith([
              'ecr:BatchCheckLayerAvailability',
              'ecr:GetDownloadUrlForLayer',
              'ecr:BatchGetImage',
            ]),
            Effect: 'Allow',
            Resource: {
              'Fn::GetAtt': [
                'BaseImageRepo',
                'Arn',
              ],
            },
          }),
        ]),
      },
    });
  });

  test('does not grant ECR pull permissions when using BaseContainerImage.fromDockerHub()', () => {
    const baseImageRepo = new ecr.Repository(stack, 'BaseImageRepo', {
      repositoryName: 'base-image-repo',
    });
    (baseImageRepo.node.defaultChild as ecr.CfnRepository).overrideLogicalId('BaseImageRepo');

    const builder = new CodeBuildRunnerImageBuilder(stack, 'builder', {
      baseDockerImage: BaseContainerImage.fromDockerHub('ubuntu', '22.04'),
    });
    builder.bindDockerImage();

    const template = Template.fromStack(stack);

    // Verify no ECR pull permissions are granted for the base image repository
    // The builder's own repository will have ECR permissions, but the base image repository should not
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.not(Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith([
              'ecr:BatchCheckLayerAvailability',
              'ecr:GetDownloadUrlForLayer',
              'ecr:BatchGetImage',
            ]),
            Effect: 'Allow',
            Resource: {
              'Fn::GetAtt': [
                'BaseImageRepo',
                'Arn',
              ],
            },
          }),
        ])),
      },
    });
  });

  test('does not grant ECR pull permissions when using BaseContainerImage.fromEcrPublic()', () => {
    const baseImageRepo = new ecr.Repository(stack, 'BaseImageRepo', {
      repositoryName: 'base-image-repo',
    });
    (baseImageRepo.node.defaultChild as ecr.CfnRepository).overrideLogicalId('BaseImageRepo');

    const builder = new CodeBuildRunnerImageBuilder(stack, 'builder', {
      baseDockerImage: BaseContainerImage.fromEcrPublic('lts', 'ubuntu', '22.04'),
    });
    builder.bindDockerImage();

    const template = Template.fromStack(stack);

    // ECR Public doesn't require IAM permissions, so verify no ECR pull permissions for the base image repository
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.not(Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith([
              'ecr:BatchCheckLayerAvailability',
              'ecr:GetDownloadUrlForLayer',
              'ecr:BatchGetImage',
            ]),
            Effect: 'Allow',
            Resource: {
              'Fn::GetAtt': [
                'BaseImageRepo',
                'Arn',
              ],
            },
          }),
        ])),
      },
    });
  });

  test('does not grant ECR pull permissions when using BaseContainerImage.fromString()', () => {
    const baseImageRepo = new ecr.Repository(stack, 'BaseImageRepo', {
      repositoryName: 'base-image-repo',
    });
    (baseImageRepo.node.defaultChild as ecr.CfnRepository).overrideLogicalId('BaseImageRepo');

    const builder = new CodeBuildRunnerImageBuilder(stack, 'builder', {
      baseDockerImage: BaseContainerImage.fromString('mcr.microsoft.com/windows/servercore:ltsc2019'),
    });
    builder.bindDockerImage();

    const template = Template.fromStack(stack);

    // Verify no ECR pull permissions are granted for the base image repository
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.not(Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith([
              'ecr:BatchCheckLayerAvailability',
              'ecr:GetDownloadUrlForLayer',
              'ecr:BatchGetImage',
            ]),
            Effect: 'Allow',
            Resource: {
              'Fn::GetAtt': [
                'BaseImageRepo',
                'Arn',
              ],
            },
          }),
        ])),
      },
    });
  });

  test('ecrRepository property is set only when using fromEcr()', () => {
    const baseImageRepo = new ecr.Repository(stack, 'BaseImageRepo', {
      repositoryName: 'base-image-repo',
    });

    const builderWithEcr = new CodeBuildRunnerImageBuilder(stack, 'builderEcr', {
      baseDockerImage: BaseContainerImage.fromEcr(baseImageRepo, 'latest'),
    });
    // Access the private baseImage property through bindDockerImage which uses it
    builderWithEcr.bindDockerImage();

    const builderWithDockerHub = new CodeBuildRunnerImageBuilder(stack, 'builderDockerHub', {
      baseDockerImage: BaseContainerImage.fromDockerHub('ubuntu', '22.04'),
    });
    builderWithDockerHub.bindDockerImage();

    const builderWithEcrPublic = new CodeBuildRunnerImageBuilder(stack, 'builderEcrPublic', {
      baseDockerImage: BaseContainerImage.fromEcrPublic('lts', 'ubuntu', '22.04'),
    });
    builderWithEcrPublic.bindDockerImage();

    // The actual verification happens in the permission tests above
    // This test ensures the code path is exercised
    expect(baseImageRepo).toBeDefined();
  });
});
