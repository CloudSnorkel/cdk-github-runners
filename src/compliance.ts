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
import { CodeBuildRunnerImageBuilder } from './image-builders';
import { IRunnerProvider, LambdaRunnerProvider } from './providers';
import { amiRootDevice } from './providers/common';
import { GitHubRunners } from './runner';
import { StolenRunnerHandlerFunction } from './stolen-runner-handler-function';
import { TokenRetrieverFunction } from './token-retriever-function';
import { LIBRARY_CONSTRUCTS } from './utils';
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
 * Reserved concurrency for one Lambda runner provider.
 */
export interface ComplianceProviderConcurrency {
  /**
   * Lambda runner provider.
   */
  readonly provider: IRunnerProvider;

  /**
   * How many jobs this provider can run at the same time.
   */
  readonly maxLambdaJobs: number;
}

/**
 * Reserved concurrency for Lambda functions created by {@link GitHubRunners}.
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

  /**
   * How many jobs specific Lambda runner providers can run at the same time, instead of `maxLambdaJobs`.
   *
   * @default `maxLambdaJobs` for every Lambda runner provider
   */
  readonly maxLambdaJobsPerProvider?: ComplianceProviderConcurrency[];
}

/**
 * Settings that compliance frameworks like HIPAA, PCI DSS, and NIST 800-53 ask for, applied to everything created for your runners.
 *
 * This includes runner providers and image builders, even when they're in other stacks. Resources you create yourself are not changed.
 *
 * ```typescript
 * const runners = new GitHubRunners(this, 'runners', { providers: [...] });
 * Compliance.of(runners).encrypt({ key });
 * Compliance.of(runners).limitLambdaConcurrency();
 * Compliance.of(runners).logApiRequests();
 * ```
 */
export class Compliance {
  /**
   * Compliance settings for the given runners.
   */
  public static of(runners: GitHubRunners) {
    return new Compliance(runners);
  }

  private constructor(private readonly runners: GitHubRunners) {
  }

  /**
   * Encrypt data at rest with your own KMS keys.
   *
   * Keys created in the same app get the key policy they need. For imported keys, a warning lists the statements to add to the key policy.
   */
  public encrypt(options: ComplianceEncryptionOptions) {
    this.apply(new EncryptAspect(options));
  }

  /**
   * Set reserved concurrency on Lambda functions.
   *
   * Reserved concurrency comes out of your account limit, and the account must keep 100 unreserved.
   */
  public limitLambdaConcurrency(options: ComplianceLambdaConcurrencyOptions = {}) {
    this.apply(new LambdaConcurrencyAspect(options));
  }

  /**
   * Log access and errors of API Gateway endpoints used for webhook, setup, and status access.
   *
   * API Gateway can only write logs once the account has a CloudWatch Logs role. See
   * https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-logging.html
   */
  public logApiRequests() {
    this.apply(new ApiLoggingAspect());
  }

  private apply(aspect: cdk.IAspect) {
    // providers and image builders can be in other stacks, so we go over the whole app and only touch what we created
    cdk.Aspects.of(this.runners.node.root).add(aspect, { priority: cdk.AspectPriority.MUTATING });
  }
}

function isLibraryConstruct(construct: IConstruct) {
  return construct.node.scopes.some(scope => LIBRARY_CONSTRUCTS.has(scope));
}

class EncryptAspect implements cdk.IAspect {
  private readonly keyPolicies = new Set<string>();

  constructor(private readonly options: ComplianceEncryptionOptions) {
  }

  visit(node: IConstruct) {
    if (!isLibraryConstruct(node)) {
      return;
    }

    const o = this.options;
    const logsKey = o.logs ?? o.key;
    const secretsKey = o.secrets ?? o.key;
    const messagesKey = o.messages ?? o.key;
    const imagesKey = o.images ?? o.key;
    const storageKey = o.storage ?? o.key;

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
      builder?._waitForNewImage('Kms');
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
    const dedupe = `${cdk.Names.uniqueId(key)} ${id}`;
    if (this.keyPolicies.has(dedupe)) {
      return;
    }
    this.keyPolicies.add(dedupe);
    if (!key.addToResourcePolicy(statement).statementAdded) {
      cdk.Annotations.of(node).addWarningV2('@cloudsnorkel/cdk-github-runners:importedKey',
        `${key.keyArn} is imported, so its key policy must allow: ${JSON.stringify(cdk.Stack.of(node).resolve(statement.toStatementJson()))}`);
    }
  }
}

class LambdaConcurrencyAspect implements cdk.IAspect {
  constructor(private readonly options: ComplianceLambdaConcurrencyOptions) {
  }

  visit(node: IConstruct) {
    if (!(node instanceof lambda.CfnFunction) || !isLibraryConstruct(node)) {
      return;
    }

    const limit = this.limit(node);
    // keep lower limits we already set, like webhook redelivery's 1
    node.reservedConcurrentExecutions = Math.min(node.reservedConcurrentExecutions ?? limit, limit);
  }

  private limit(node: lambda.CfnFunction) {
    const maxJobStarts = this.options.maxJobStarts ?? 20;
    const scopes = node.node.scopes;

    if (scopes.some(s => s instanceof LambdaRunnerProvider)) {
      return this.options.maxLambdaJobsPerProvider?.find(p => scopes.includes(p.provider))?.maxLambdaJobs ?? this.options.maxLambdaJobs ?? 20;
    }

    const func = node.node.scope;
    if (func instanceof WebhookHandlerFunction || func instanceof TokenRetrieverFunction || func instanceof DeleteFailedRunnerFunction ||
      func instanceof IdleRunnerRepearFunction || func instanceof StolenRunnerHandlerFunction) {
      return maxJobStarts; // called for every job
    }

    return 5; // status, setup, warm runners, and helpers that only run during deployment
  }
}

class ApiLoggingAspect implements cdk.IAspect {
  visit(node: IConstruct) {
    if (!(node instanceof apigateway.CfnStage) || !isLibraryConstruct(node)) {
      return;
    }

    const logGroup = new logs.LogGroup(node.node.scope!, 'Access Logs', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    node.accessLogSetting = {
      destinationArn: logGroup.logGroupArn,
      format: apigateway.AccessLogFormat.jsonWithStandardFields().toString(),
    };
    node.methodSettings = [{
      httpMethod: '*',
      resourcePath: '/*',
      loggingLevel: 'ERROR',
      metricsEnabled: true,
    }];
  }
}
