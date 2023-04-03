import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2, aws_s3 as s3 } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import {
  AwsImageBuilderRunnerImageBuilder,
  CodeBuildRunnerImageBuilder,
  CodeBuildRunnerProvider,
  Ec2RunnerProvider,
  FargateRunnerProvider,
  LambdaRunnerProvider,
} from '../src';

const bucketReadMatch = Match.objectLike({
  PolicyDocument: {
    Statement: Match.arrayWith([
      {
        Action: [
          's3:GetObject*',
          's3:GetBucket*',
          's3:List*',
        ],
        Effect: 'Allow',
        Resource: [
          {
            'Fn::GetAtt': [
              'bucket',
              'Arn',
            ],
          },
          {
            'Fn::Join': [
              '',
              [
                {
                  'Fn::GetAtt': [
                    'bucket',
                    'Arn',
                  ],
                },
                '/*',
              ],
            ],
          },
        ],
      },
    ]),
  },
});

test('Adding permissions to CodeBuildRunnerProvider', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const bucket = new s3.Bucket(stack, 'bucket');
  (bucket.node.defaultChild as s3.CfnBucket).overrideLogicalId('bucket');
  const provider = new CodeBuildRunnerProvider(stack, 'provider');
  bucket.grantRead(provider);

  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::IAM::Policy', bucketReadMatch);
});

test('Adding permissions to FargateRunnerProvider', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const vpc = new ec2.Vpc(stack, 'vpc');

  const bucket = new s3.Bucket(stack, 'bucket');
  (bucket.node.defaultChild as s3.CfnBucket).overrideLogicalId('bucket');
  const provider = new FargateRunnerProvider(stack, 'provider', { vpc });
  bucket.grantRead(provider);

  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::IAM::Policy', bucketReadMatch);
});

test('Adding permissions to LambdaRunnerProvider', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const bucket = new s3.Bucket(stack, 'bucket');
  (bucket.node.defaultChild as s3.CfnBucket).overrideLogicalId('bucket');
  const provider = new LambdaRunnerProvider(stack, 'provider');
  bucket.grantRead(provider);

  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::IAM::Policy', bucketReadMatch);
});

test('Adding permissions to Ec2RunnerProvider', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const vpc = new ec2.Vpc(stack, 'vpc');

  const bucket = new s3.Bucket(stack, 'bucket');
  (bucket.node.defaultChild as s3.CfnBucket).overrideLogicalId('bucket');
  const provider = new Ec2RunnerProvider(stack, 'provider', { vpc });
  bucket.grantRead(provider);

  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::IAM::Policy', bucketReadMatch);
});

test('Adding permissions to CodeBuildRunnerImageBuilder', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const bucket = new s3.Bucket(stack, 'bucket');
  (bucket.node.defaultChild as s3.CfnBucket).overrideLogicalId('bucket');
  const builder = new CodeBuildRunnerImageBuilder(stack, 'builder');
  bucket.grantRead(builder);

  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::IAM::Policy', bucketReadMatch);
});

test('Adding permissions to AwsImageBuilderRunnerImageBuilder', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'test');

  const vpc = new ec2.Vpc(stack, 'vpc');

  const bucket = new s3.Bucket(stack, 'bucket');
  (bucket.node.defaultChild as s3.CfnBucket).overrideLogicalId('bucket');
  const builder = new AwsImageBuilderRunnerImageBuilder(stack, 'builder', { vpc });
  bucket.grantRead(builder);

  const template = Template.fromStack(stack);

  template.hasResourceProperties('AWS::IAM::Policy', bucketReadMatch);
});
