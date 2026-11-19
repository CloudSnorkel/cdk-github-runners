import * as crypto from 'crypto';
import * as cdk from 'aws-cdk-lib';
import {
  aws_apigateway as apigateway,
  aws_codebuild as codebuild,
  aws_dynamodb as dynamodb,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_ecs as ecs,
  aws_iam as iam,
  aws_imagebuilder as imagebuilder,
  aws_kms as kms,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_s3 as s3,
  aws_secretsmanager as secretsmanager,
  aws_sns as sns,
  aws_sqs as sqs,
  aws_stepfunctions as stepfunctions,
} from 'aws-cdk-lib';
import { Construct, IConstruct } from 'constructs';
import { DeleteFailedRunnerFunction } from './delete-failed-runner-function';
import { IdleRunnerRepearFunction } from './idle-runner-repear-function';
import { CodeBuildRunnerImageBuilder, RunnerImageBuilderBase } from './image-builders';
import { FilterFailedBuildsFunction } from './image-builders/aws-image-builder/filter-failed-builds-function';
import { LambdaRunnerProvider } from './providers';
import { amiRootDevice, BaseProvider } from './providers/common';
import { GitHubRunners } from './runner';
import { StolenRunnerHandlerFunction } from './stolen-runner-handler-function';
import { TokenRetrieverFunction } from './token-retriever-function';
import { SingletonLogType } from './utils';
import { AlwaysOnWarmRunner, ScheduledWarmRunner } from './warm-runner';
import { WebhookHandlerFunction } from './webhook-handler-function';

/**
 * Keys used by {@link Compliance.encrypt}. Each type of resource uses its own key if set, or `key` otherwise. Types with neither are left as they are.
 */
export interface ComplianceEncryptionOptions {
  /**
   * Key for every type of resource that doesn't have its own key below.
   *
   * @default only types with their own key are encrypted
   */
  readonly key?: kms.IKey;

  /**
   * Key for CloudWatch log groups, including runner logs.
   *
   * @default `key`
   */
  readonly logs?: kms.IKey;

  /**
   * Key for Secrets Manager secrets holding GitHub credentials.
   *
   * @default `key`
   */
  readonly secrets?: kms.IKey;

  /**
   * Key for the Step Functions state machine, SQS queues, SNS topics and the DynamoDB table used to manage runners.
   *
   * @default `key`
   */
  readonly messages?: kms.IKey;

  /**
   * Key for ECR repositories holding runner images, and for AMIs built for EC2 runners. EC2 runner volumes are encrypted with the key of their AMI.
   *
   * Adding a key to an existing repository replaces it. The deployment waits for the image to be rebuilt in the new repository before runners use it.
   *
   * @default `key`
   */
  readonly images?: kms.IKey;

  /**
   * Key for runner storage: EBS volumes of ECS instances, Fargate ephemeral storage, CodeBuild build output, and buckets used to build images.
   *
   * ECS clusters and capacity providers you pass in are not changed.
   *
   * @default `key`
   */
  readonly storage?: kms.IKey;
}

/**
 * Reserved concurrency for Lambda functions used by runners.
 */
export interface ComplianceLambdaConcurrencyOptions {
  /**
   * How many jobs you expect to start at the same time. Functions called for every job, like the webhook handler, can run this many at once.
   * If more jobs start at once, they wait a bit longer for a runner.
   *
   * Status, setup, warm runner and deployment helper functions are limited to 5.
   *
   * @default 20
   */
  readonly maxJobStarts?: number;

  /**
   * How many jobs each Lambda runner provider can run at the same time.
   *
   * @default 20
   */
  readonly maxLambdaJobs?: number;

}

/**
 * Settings that compliance frameworks like HIPAA, PCI DSS, and NIST 800-53 ask for, applied to everything this library creates in a scope.
 *
 * The scope can be an app, a stage, a stack, or a single construct like a runner provider. Settings of the closest scope win, so you can set a key
 * for a whole stack and a stricter one for a single provider. Resources you create yourself are not changed.
 *
 * Once anything uses `Compliance`, synth warns about runner resources in the same stage that no scope covers. Like other aspects, an app
 * scope doesn't reach into nested stages, so use `Compliance.of(stage)` for those.
 *
 * ```typescript
 * Compliance.of(stack).encrypt({ key });
 * Compliance.of(gpuProvider).encrypt({ storage: gpuKey });
 * Compliance.of(stack).limitLambdaConcurrency();
 * Compliance.of(stack).logApiRequests();
 * ```
 */
export class Compliance {
  /**
   * Compliance settings for everything this library creates in the given scope.
   */
  public static of(scope: IConstruct) {
    return new Compliance(scope);
  }

  private constructor(private readonly scope: IConstruct) {
  }

  /**
   * Encrypt data at rest with your own KMS keys.
   *
   * Keys created in the same app get the key policy they need. For imported keys, a warning lists the statements to add to the key policy.
   */
  public encrypt(options: ComplianceEncryptionOptions) {
    this.settings().encrypt = options;
  }

  /**
   * Set reserved concurrency on Lambda functions.
   *
   * This reserves 5 x `maxJobStarts` for functions called on every job, `maxLambdaJobs` for every Lambda runner provider, and 5 for every other
   * function. With the defaults, that's about 120 for a simple deployment and 190 for one using every feature. Reserved concurrency comes out of
   * your account limit, and the account must keep 100 unreserved.
   */
  public limitLambdaConcurrency(options: ComplianceLambdaConcurrencyOptions = {}) {
    this.settings().concurrency = options;
  }

  /**
   * Log access and errors of API Gateway endpoints used for webhook, setup, and status access.
   *
   * API Gateway can only write logs once the account has a CloudWatch Logs role. See
   * https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-logging.html
   */
  public logApiRequests() {
    this.settings().apiLogs = true;
  }

  private settings() {
    let settings = SETTINGS.get(this.scope);
    if (!settings) {
      settings = {};
      SETTINGS.set(this.scope, settings);
      cdk.Aspects.of(this.scope).add(new ComplianceAspect(this.scope), { priority: cdk.AspectPriority.MUTATING });
      const stage = cdk.Stage.of(this.scope) ?? this.scope.node.root;
      if (!WARNED_STAGES.has(stage)) {
        WARNED_STAGES.add(stage);
        cdk.Aspects.of(stage).add(new UncoveredWarningAspect(), { priority: cdk.AspectPriority.READONLY });
      }
    }
    return settings;
  }
}

interface ComplianceSettings {
  encrypt?: ComplianceEncryptionOptions;
  concurrency?: ComplianceLambdaConcurrencyOptions;
  apiLogs?: boolean;
}

const SETTINGS = new WeakMap<IConstruct, ComplianceSettings>();
const WARNED_STAGES = new WeakSet<IConstruct>();
const KEY_POLICIES = new WeakMap<kms.IKey, Set<string>>();

/**
 * Settings of all scopes containing the construct, closest first.
 */
function settingsOf(construct: IConstruct) {
  return construct.node.scopes.slice().reverse().map(scope => SETTINGS.get(scope)).filter(s => s !== undefined) as ComplianceSettings[];
}

/**
 * Whether this library created the construct. It's either inside one of our constructs, or a singleton we put in the stack.
 */
function isRunnerConstruct(construct: IConstruct): boolean {
  return construct.node.scopes.some(scope =>
    scope instanceof GitHubRunners || scope instanceof BaseProvider || scope instanceof RunnerImageBuilderBase ||
    scope instanceof AlwaysOnWarmRunner || scope instanceof ScheduledWarmRunner ||
    scope instanceof FilterFailedBuildsFunction ||
    (cdk.Stack.isStack(scope.node.scope) && isSingletonId(scope.node.id)) ||
    // failedImageBuildsTopic() can put its topics in any scope, next to the function that filters them. ids can't repeat in a scope, so
    // checking both only matches our topics.
    (scope instanceof sns.Topic && ['Failed Runner Image Builds', 'Image Builder Builds'].includes(scope.node.id) &&
      scope.node.scope!.node.children.some(c => c instanceof FilterFailedBuildsFunction)),
  );
}

function isSingletonId(id: string) {
  return id.includes('dcc036c8-876b-451e-a2c1-552f9e06e9e1') || (Object.values(SingletonLogType) as string[]).includes(id);
}

/**
 * Applies the settings of the closest scope to everything this library created in it.
 */
class ComplianceAspect implements cdk.IAspect {
  constructor(private readonly scope: IConstruct) {
  }

  visit(node: IConstruct) {
    if (!(node instanceof cdk.CfnResource) || !isRunnerConstruct(node)) {
      return;
    }

    // the closest scope with settings handles the resource, so nothing is changed twice
    const owner = node.node.scopes.slice().reverse().find(scope => SETTINGS.has(scope));
    if (owner !== this.scope) {
      return;
    }

    const settings = settingsOf(node);
    if (settings.some(s => s.encrypt)) {
      encrypt(node, settings);
    }
    if (node instanceof lambda.CfnFunction && settings.some(s => s.concurrency)) {
      limitConcurrency(node, settings);
    }
    if (node instanceof apigateway.CfnStage && settings.some(s => s.apiLogs)) {
      logApiRequests(node);
    }
  }
}

/**
 * Warns about runner resources that no `Compliance` scope covers.
 */
class UncoveredWarningAspect implements cdk.IAspect {
  private readonly warnedStacks = new Set<cdk.Stack>();

  visit(node: IConstruct) {
    if (!(node instanceof cdk.CfnResource) || !isRunnerConstruct(node) || settingsOf(node).length > 0) {
      return;
    }

    const stack = cdk.Stack.of(node);
    if (!this.warnedStacks.has(stack)) {
      this.warnedStacks.add(stack);
      cdk.Annotations.of(stack).addWarningV2('@cloudsnorkel/cdk-github-runners:complianceUncovered',
        `Compliance doesn't cover runner resources in this stack, like ${node.node.path}. Use Compliance.of(stack) to cover them.`);
    }
  }
}

/**
 * Key of the closest scope that has one for this type of resource.
 */
function keyFor(settings: ComplianceSettings[], type: 'logs' | 'secrets' | 'messages' | 'images' | 'storage') {
  for (const s of settings) {
    const key = s.encrypt?.[type] ?? s.encrypt?.key;
    if (key) {
      return key;
    }
  }
  return undefined;
}

function encrypt(node: cdk.CfnResource, settings: ComplianceSettings[]) {
  new Encryptor().encrypt(node, settings);
}

class Encryptor {
  encrypt(node: cdk.CfnResource, settings: ComplianceSettings[]) {
    const logsKey = keyFor(settings, 'logs');
    const secretsKey = keyFor(settings, 'secrets');
    const messagesKey = keyFor(settings, 'messages');
    const imagesKey = keyFor(settings, 'images');
    const storageKey = keyFor(settings, 'storage');

    if (node instanceof logs.CfnLogGroup && logsKey) {
      node.kmsKeyId = logsKey.keyArn;
      this.allowLogs(node, logsKey);
    } else if (node instanceof secretsmanager.CfnSecret && secretsKey) {
      node.kmsKeyId = secretsKey.keyArn;
      this.allowService(node, secretsKey, 'secretsmanager');
    } else if (node instanceof sqs.CfnQueue && messagesKey) {
      node.kmsMasterKeyId = messagesKey.keyArn;
      this.allowService(node, messagesKey, 'sqs');
      this.allowEvents(node, messagesKey);
    } else if (node instanceof sns.CfnTopic && messagesKey) {
      node.kmsMasterKeyId = messagesKey.keyArn;
      this.allowService(node, messagesKey, 'sns');
      this.allowEvents(node, messagesKey);
    } else if (node instanceof dynamodb.CfnTable && messagesKey) {
      node.sseSpecification = { sseEnabled: true, sseType: 'KMS', kmsMasterKeyId: messagesKey.keyArn };
      this.allowService(node, messagesKey, 'dynamodb');
    } else if (node instanceof ecr.CfnRepository && imagesKey) {
      node.encryptionConfiguration = { encryptionType: 'KMS', kmsKey: imagesKey.keyArn };
      this.allowService(node, imagesKey, 'ecr');
      const builder = node.node.scopes.find(s => s instanceof CodeBuildRunnerImageBuilder) as CodeBuildRunnerImageBuilder | undefined;
      // a new key replaces the repository, so the deployment must wait for the image to be built again
      builder?._waitForNewImage(`Kms${crypto.createHash('md5').update(cdk.Names.uniqueId(imagesKey)).digest('hex').slice(0, 8)}`);
    } else if (node instanceof imagebuilder.CfnImageRecipe && imagesKey) {
      // the AMI keeps the encryption of the volume it was built on, and the new recipe builds it again on deploy
      node.blockDeviceMappings = this.encryptVolumes(node, node.parentImage, node.blockDeviceMappings as any, imagesKey);
      this.allowService(node, imagesKey, 'ec2');
    } else if (node instanceof ec2.CfnLaunchTemplate && storageKey) {
      const data = node.launchTemplateData as ec2.CfnLaunchTemplate.LaunchTemplateDataProperty;
      node.launchTemplateData = {
        ...data,
        blockDeviceMappings: this.encryptVolumes(node, data.imageId, data.blockDeviceMappings as any, storageKey),
      };
      this.allowService(node, storageKey, 'ec2');
    } else if (node instanceof ecs.CfnCluster && storageKey) {
      node.configuration = {
        ...node.configuration as ecs.CfnCluster.ClusterConfigurationProperty,
        managedStorageConfiguration: { fargateEphemeralStorageKmsKeyId: storageKey.keyId },
      };
      this.allowFargate(node, storageKey);
    } else if (node instanceof codebuild.CfnProject && storageKey) {
      node.encryptionKey = storageKey.keyArn;
      const project = node.node.scope;
      if (project instanceof codebuild.Project) {
        storageKey.grantEncryptDecrypt(project);
      }
    } else if (node instanceof stepfunctions.CfnStateMachine && messagesKey) {
      node.encryptionConfiguration = { type: 'CUSTOMER_MANAGED_KMS_KEY', kmsKeyId: messagesKey.keyArn };
      // runners and functions that start executions or send task results use the key through Step Functions
      this.allowService(node, messagesKey, 'states');
      // the execution role uses the key directly. it goes in the key policy and not the role policy, so the key outlives the state machine
      // using it when compliance is removed, and exists before it when compliance is added.
      const stack = cdk.Stack.of(node);
      this.allow(node, messagesKey, `state machine role ${stack.account} ${stack.region}`, new iam.PolicyStatement({
        principals: [new iam.AnyPrincipal()],
        actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
        resources: ['*'],
        conditions: {
          StringEquals: { 'kms:CallerAccount': stack.account },
          ArnLike: { 'kms:EncryptionContext:aws:states:stateMachineArn': `arn:${stack.partition}:states:${stack.region}:${stack.account}:stateMachine:*` },
        },
      }));
      if (node.loggingConfiguration) {
        this.allow(node, messagesKey, `state machine role logs ${stack.account} ${stack.region}`, new iam.PolicyStatement({
          principals: [new iam.AnyPrincipal()],
          actions: ['kms:GenerateDataKey'],
          resources: ['*'],
          conditions: {
            StringEquals: { 'kms:CallerAccount': stack.account },
            ArnLike: { 'kms:EncryptionContext:SourceArn': `arn:${stack.partition}:logs:${stack.region}:${stack.account}:*` },
          },
        }));
        this.allow(node, messagesKey, 'log delivery', new iam.PolicyStatement({
          principals: [new iam.ServicePrincipal('delivery.logs.amazonaws.com')],
          actions: ['kms:Decrypt*'],
          resources: ['*'],
        }));
      }
    } else if (node instanceof s3.CfnBucket && storageKey) {
      node.bucketEncryption = {
        serverSideEncryptionConfiguration: [{
          serverSideEncryptionByDefault: { sseAlgorithm: 'aws:kms', kmsMasterKeyId: storageKey.keyArn },
          bucketKeyEnabled: true,
        }],
      };
      this.allowService(node, storageKey, 's3');
    }
  }

  private encryptVolumes(scope: IConstruct, image: string | undefined, mappings: any[] | undefined, key: kms.IKey) {
    if (!mappings) {
      if (!image) {
        return undefined;
      }
      // no storage options, so there is no mapping for the root volume yet
      mappings = [{ deviceName: amiRootDevice(scope as Construct, image).ref, ebs: { deleteOnTermination: true } }];
    }
    return mappings.map(m => ({ ...m, ebs: m.ebs ? { ...m.ebs, encrypted: true, kmsKeyId: key.keyArn } : undefined }));
  }

  /**
   * Same access AWS managed keys give: anyone in the account allowed by IAM to use the resource can use the key through that service.
   */
  private allowService(node: IConstruct, key: kms.IKey, service: string) {
    const stack = cdk.Stack.of(node);
    this.allow(node, key, `${service} ${stack.account} ${stack.region}`, new iam.PolicyStatement({
      principals: [new iam.AnyPrincipal()],
      actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:CreateGrant', 'kms:DescribeKey'],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'kms:CallerAccount': stack.account,
          'kms:ViaService': `${service}.${stack.region}.amazonaws.com`,
        },
      },
    }));
  }

  private allowLogs(node: IConstruct, key: kms.IKey) {
    const stack = cdk.Stack.of(node);
    this.allow(node, key, `logs ${stack.account} ${stack.region}`, new iam.PolicyStatement({
      principals: [new iam.ServicePrincipal(`logs.${stack.region}.amazonaws.com`)],
      actions: ['kms:Encrypt*', 'kms:Decrypt*', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:Describe*'],
      resources: ['*'],
      conditions: {
        ArnLike: {
          'kms:EncryptionContext:aws:logs:arn': `arn:${stack.partition}:logs:${stack.region}:${stack.account}:log-group:*`,
        },
      },
    }));
  }

  /**
   * EventBridge sends to the warm runner queue, and image build notifications go to the topics.
   */
  private allowEvents(node: IConstruct, key: kms.IKey) {
    this.allow(node, key, 'events', new iam.PolicyStatement({
      principals: [new iam.ServicePrincipal('events.amazonaws.com'), new iam.ServicePrincipal('codestar-notifications.amazonaws.com')],
      actions: ['kms:Decrypt', 'kms:GenerateDataKey*'],
      resources: ['*'],
      conditions: {
        StringEquals: { 'aws:SourceAccount': cdk.Stack.of(node).account },
      },
    }));
  }

  private allowFargate(node: IConstruct, key: kms.IKey) {
    const stack = cdk.Stack.of(node);
    this.allow(node, key, `fargate ${stack.account}`, new iam.PolicyStatement({
      principals: [new iam.ServicePrincipal('fargate.amazonaws.com')],
      actions: ['kms:GenerateDataKeyWithoutPlaintext', 'kms:CreateGrant'],
      resources: ['*'],
      conditions: {
        StringEquals: { 'kms:EncryptionContext:aws:ecs:clusterAccount': stack.account },
      },
    }));
  }

  private allow(node: IConstruct, key: kms.IKey, id: string, statement: iam.PolicyStatement) {
    const added = KEY_POLICIES.get(key) ?? new Set<string>();
    KEY_POLICIES.set(key, added);
    if (added.has(id)) {
      return;
    }
    added.add(id);
    if (!key.addToResourcePolicy(statement).statementAdded) {
      cdk.Annotations.of(node).addWarningV2('@cloudsnorkel/cdk-github-runners:importedKey',
        `${key.keyArn} is imported, so its key policy must allow: ${JSON.stringify(cdk.Stack.of(node).resolve(statement.toStatementJson()))}`);
    }
  }
}

function limitConcurrency(node: lambda.CfnFunction, settings: ComplianceSettings[]) {
  // closest scope that sets each option
  const option = (name: keyof ComplianceLambdaConcurrencyOptions) => settings.map(s => s.concurrency?.[name]).find(v => v !== undefined);

  let limit;
  const func = node.node.scope;
  if (node.node.scopes.some(s => s instanceof LambdaRunnerProvider)) {
    limit = option('maxLambdaJobs') ?? 20;
  } else if (func instanceof WebhookHandlerFunction || func instanceof TokenRetrieverFunction || func instanceof DeleteFailedRunnerFunction ||
    func instanceof IdleRunnerRepearFunction || func instanceof StolenRunnerHandlerFunction) {
    limit = option('maxJobStarts') ?? 20; // called for every job
  } else {
    limit = 5; // status, setup, warm runners, and helpers that only run during deployment
  }

  // keep lower limits we already set, like webhook redelivery's 1
  node.reservedConcurrentExecutions = Math.min(node.reservedConcurrentExecutions ?? limit, limit);
}

function logApiRequests(stage: apigateway.CfnStage) {
  const logGroup = new logs.LogGroup(stage.node.scope!, 'Access Logs', {
    retention: logs.RetentionDays.ONE_MONTH,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });
  stage.accessLogSetting = {
    destinationArn: logGroup.logGroupArn,
    format: apigateway.AccessLogFormat.jsonWithStandardFields().toString(),
  };
  stage.methodSettings = [{
    httpMethod: '*',
    resourcePath: '/*',
    loggingLevel: 'ERROR',
    metricsEnabled: true,
  }];
}
