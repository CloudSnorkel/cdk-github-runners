import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { Architecture, ContainerImageBuilder, Os } from '../src';
import { AmiBuilder } from '../src/providers/image-builders/ami';

test('AMI builder matching instance type', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const vpc = new ec2.Vpc(stack, 'vpc');

  expect(() => {
    new AmiBuilder(stack, 'linux arm64', {
      os: Os.LINUX,
      architecture: Architecture.ARM64,
      vpc,
    });
  }).toThrowError('Builder architecture (ARM64) doesn\'t match selected instance type (m5.large / x86_64)');
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
