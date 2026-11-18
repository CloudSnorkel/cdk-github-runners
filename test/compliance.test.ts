import * as cdk from 'aws-cdk-lib';
import { aws_kms as kms } from 'aws-cdk-lib';
import { Annotations, Match } from 'aws-cdk-lib/assertions';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { AwsSolutionsChecks, HIPAASecurityChecks, NIST80053R4Checks, NIST80053R5Checks, PCIDSS321Checks } from 'cdk-nag';
import { ACKNOWLEDGED_FINDINGS } from './compliance-acknowledged';
import { fullFeatureApp } from './full-feature-stack';
import { Compliance, GitHubRunners, LambdaRunnerProvider } from '../src';

/**
 * Every resource type we create, and what `Compliance.encrypt()` does with it. A new type fails the test until it's added here.
 */
const RESOURCE_TYPES: Record<string, 'encrypted' | string> = {
  'AWS::CodeBuild::Project': 'encrypted',
  'AWS::DynamoDB::Table': 'encrypted',
  'AWS::ECR::Repository': 'encrypted',
  'AWS::ImageBuilder::ImageRecipe': 'encrypted',
  'AWS::Logs::LogGroup': 'encrypted',
  'AWS::S3::Bucket': 'encrypted',
  'AWS::SecretsManager::Secret': 'encrypted',
  'AWS::SNS::Topic': 'encrypted',
  'AWS::SQS::Queue': 'encrypted',
  'AWS::StepFunctions::StateMachine': 'encrypted',
  'AWS::EC2::LaunchTemplate': 'encrypted when it has an image, the rest get their image from Image Builder',
  'AWS::ECS::Cluster': 'encrypted when we create it',
  'AWS::Lambda::MicrovmImage': 'no key setting, built from the encrypted repository',
  'AWS::ImageBuilder::ContainerRecipe': 'build instance only, the image goes to the encrypted repository',
  'AWS::ImageBuilder::DistributionConfiguration': 'AMIs are encrypted by their recipe',
  'AWS::Lambda::Function': 'environment holds no secrets',
  'AWS::CloudWatch::Dashboard': 'no data at rest',
  'AWS::Logs::MetricFilter': 'no data at rest',
  'AWS::Logs::QueryDefinition': 'no data at rest',
  'AWS::Logs::SubscriptionFilter': 'no data at rest',
  'AWS::ApiGateway::Deployment': 'no data at rest',
  'AWS::ApiGateway::Method': 'no data at rest',
  'AWS::ApiGateway::Resource': 'no data at rest',
  'AWS::ApiGateway::RestApi': 'no data at rest',
  'AWS::ApiGateway::Stage': 'no data at rest',
  'AWS::AutoScaling::AutoScalingGroup': 'no data at rest',
  'AWS::CloudFormation::WaitCondition': 'no data at rest',
  'AWS::CloudFormation::WaitConditionHandle': 'no data at rest',
  'AWS::EC2::SecurityGroup': 'no data at rest',
  'AWS::EC2::VPCEndpoint': 'no data at rest',
  'AWS::ECS::CapacityProvider': 'no data at rest',
  'AWS::ECS::ClusterCapacityProviderAssociations': 'no data at rest',
  'AWS::ECS::TaskDefinition': 'no data at rest',
  'AWS::Events::Rule': 'no data at rest',
  'AWS::IAM::InstanceProfile': 'no data at rest',
  'AWS::IAM::Policy': 'no data at rest',
  'AWS::IAM::Role': 'no data at rest',
  'AWS::ImageBuilder::Component': 'no data at rest',
  'AWS::ImageBuilder::Image': 'no data at rest',
  'AWS::ImageBuilder::ImagePipeline': 'no data at rest',
  'AWS::ImageBuilder::InfrastructureConfiguration': 'no data at rest',
  'AWS::Lambda::EventSourceMapping': 'no data at rest',
  'AWS::Lambda::LayerVersion': 'no data at rest',
  'AWS::Lambda::Permission': 'no data at rest',
  'AWS::Lambda::Url': 'no data at rest',
  'AWS::S3::BucketPolicy': 'no data at rest',
  'AWS::SNS::Subscription': 'no data at rest',
  'AWS::SNS::TopicPolicy': 'no data at rest',
  'AWS::SQS::QueuePolicy': 'no data at rest',
  'Custom::AmiRootDevice': 'no data at rest',
  'Custom::ImageBuilder': 'no data at rest',
  'Custom::ImageBuilder-Delete-Resources': 'no data at rest',
  'Custom::MicroVmImageArtifact': 'no data at rest',
  'Custom::WarmRunnerFill': 'no data at rest',
};

// resources the test creates for itself
const TEST_RESOURCES = /^(shared\/|providers\/Cluster\/|runners\/Provider Selector\/)/;

interface Resource {
  readonly path: string;
  readonly type: string;
  readonly json: string;
}

let app: cdk.App;
let key: kms.Key;
let resources: Resource[];

function glob(pattern: string) {
  const regex = pattern.split('**').map(part => part.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*');
  return new RegExp(`^${regex}$`);
}

describe('Compliance', () => {
  beforeAll(() => {
    app = fullFeatureApp((runners, k) => {
      key = k as kms.Key;
      Compliance.of(runners).encrypt({ key });
      const lambdaProvider = runners.providers.find(p => p.node.id == 'Lambda') as LambdaRunnerProvider;
      Compliance.of(runners).limitLambdaConcurrency({
        maxJobStarts: 30,
        maxLambdaJobsPerProvider: [{ provider: lambdaProvider, maxLambdaJobs: 7 }],
      });
      Compliance.of(runners).logApiRequests();
    });
    const assembly = app.synth();

    resources = [];
    for (const node of app.node.findAll()) {
      if (node instanceof cdk.CfnResource) {
        const stack = cdk.Stack.of(node);
        const template = assembly.getStackByName(stack.stackName).template;
        const resource = template.Resources[stack.getLogicalId(node)];
        if (resource && !TEST_RESOURCES.test(node.node.path)) {
          resources.push({ path: node.node.path, type: resource.Type, json: JSON.stringify(resource.Properties ?? {}) });
        }
      }
    }
  });

  afterAll(CloudAssembly.cleanupTemporaryDirectories);

  test('Every resource type is known', () => {
    const unknown = [...new Set(resources.map(r => r.type))].filter(t => RESOURCE_TYPES[t] === undefined);
    expect(unknown).toEqual([]);
  });

  test('Encrypted resource types use the key', () => {
    const keyId = cdk.Stack.of(key).getLogicalId(key.node.defaultChild as kms.CfnKey);
    const unencrypted = resources
      .filter(r => RESOURCE_TYPES[r.type] === 'encrypted' && !r.json.includes(keyId))
      .map(r => r.path);
    expect(unencrypted).toEqual([]);
  });

  test('Lambda concurrency', () => {
    const concurrency = (path: string) => JSON.parse(resources.find(r => r.path == path)!.json).ReservedConcurrentExecutions;
    expect(concurrency('runners/runners/Webhook Handler/webhook-handler/Resource')).toBe(30);
    expect(concurrency('runners/runners/token-retriever/Resource')).toBe(30);
    expect(concurrency('runners/runners/status/Resource')).toBe(5);
    expect(concurrency('runners/runners/Webhook Redelivery/Lambda/Resource')).toBe(1);
    expect(concurrency('builders/build-image-dcc036c8-876b-451e-a2c1-552f9e06e9e1/Resource')).toBe(5);
    expect(concurrency('providers/Lambda/Function/Resource')).toBe(7);
  });

  test('API requests are logged', () => {
    const stages = resources.filter(r => r.type == 'AWS::ApiGateway::Stage');
    expect(stages.length).toBe(2);
    for (const stage of stages) {
      expect(JSON.parse(stage.json).AccessLogSetting).toBeDefined();
    }
  });

  test('cdk-nag findings are all acknowledged', () => {
    const used = new Set<number>();
    const unacknowledged: string[] = [];

    const packs = [new AwsSolutionsChecks(), new HIPAASecurityChecks(), new NIST80053R4Checks(), new NIST80053R5Checks(), new PCIDSS321Checks()];
    for (const pack of packs) {
      for (const violation of pack.validateScope(app).violations) {
        // AwsSolutions-IAM5[Resource::*] -> IAM5
        const rule = violation.ruleName.replace(/^[^-]+-/, '').replace(/\[.*$/, '');
        for (const resource of violation.violatingResources as { constructPath: string }[]) {
          const index = ACKNOWLEDGED_FINDINGS.findIndex(a =>
            (a.rules.includes('*') || a.rules.includes(rule)) && (!a.paths || a.paths.some(p => glob(p).test(resource.constructPath))));
          if (index < 0) {
            unacknowledged.push(`${violation.ruleName} ${resource.constructPath}`);
          } else {
            used.add(index);
          }
        }
      }
    }

    expect(unacknowledged).toEqual([]);
    expect(ACKNOWLEDGED_FINDINGS.filter((_, i) => !used.has(i))).toEqual([]);
  });

  test('Imported keys warn about the key policy', () => {
    const otherApp = new cdk.App();
    const stack = new cdk.Stack(otherApp, 'test', { env: { account: '123456789012', region: 'us-east-1' } });
    const runners = new GitHubRunners(stack, 'runners', { providers: [new LambdaRunnerProvider(stack, 'p1')] });
    Compliance.of(runners).encrypt({ key: kms.Key.fromKeyArn(stack, 'key', 'arn:aws:kms:us-east-1:123456789012:key/1234') });

    Annotations.fromStack(stack).hasWarning('/test/runners/Secrets/Webhook/Resource', Match.stringLikeRegexp('is imported, so its key policy must allow'));
  });
});
