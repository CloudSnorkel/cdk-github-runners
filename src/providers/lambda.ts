import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import {
  aws_ec2 as ec2,
  aws_events as events,
  aws_events_targets as events_targets,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_stepfunctions as stepfunctions,
  aws_stepfunctions_tasks as stepfunctions_tasks,
  custom_resources as cr,
} from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { BundledNodejsFunction } from '../utils';
import { Architecture, BaseProvider, IImageBuilder, IRunnerProvider, Os, RunnerImage, RunnerProviderProps, RunnerRuntimeParameters } from './common';
import { CodeBuildImageBuilder } from './image-builders/codebuild';

export interface LambdaRunnerProps extends RunnerProviderProps {
  /**
   * Provider running an image to run inside CodeBuild with GitHub runner pre-configured.
   *
   * The default command (`CMD`) should be `["runner.handler"]` which points to an included `runner.js` with a function named `handler`. The function should start the GitHub runner.
   *
   * @see https://github.com/CloudSnorkel/cdk-github-runners/tree/main/src/providers/docker-images/lambda
   * @default image builder with LambdaRunner.LINUX_X64_DOCKERFILE_PATH as Dockerfile
   */
  readonly imageBuilder?: IImageBuilder;

  /**
   * GitHub Actions label used for this provider.
   *
   * @default undefined
   * @deprecated use {@link labels} instead
   */
  readonly label?: string;

  /**
   * GitHub Actions labels used for this provider.
   *
   * These labels are used to identify which provider should spawn a new on-demand runner. Every job sends a webhook with the labels it's looking for
   * based on runs-on. We match the labels from the webhook with the labels specified here. If all the labels specified here are present in the
   * job's labels, this provider will be chosen and spawn a new runner.
   *
   * @default ['lambda']
   */
  readonly labels?: string[];

  /**
   * The amount of memory, in MB, that is allocated to your Lambda function.
   * Lambda uses this value to proportionally allocate the amount of CPU
   * power. For more information, see Resource Model in the AWS Lambda
   * Developer Guide.
   *
   * @default 2048
   */
  readonly memorySize?: number;

  /**
  * The size of the function’s /tmp directory in MiB.
  *
  * @default 10 GiB
  */
  readonly ephemeralStorageSize?: cdk.Size;

  /**
   * The function execution time (in seconds) after which Lambda terminates
   * the function. Because the execution time affects cost, set this value
   * based on the function's expected execution time.
   *
   * @default Duration.minutes(15)
   */
  readonly timeout?: cdk.Duration;

  /**
  * VPC to launch the runners in.
  *
  * @default no VPC
  */
  readonly vpc?: ec2.IVpc;

  /**
  * Security Group to assign to this instance.
  *
  * @default public lambda with no security group
  */
  readonly securityGroup?: ec2.ISecurityGroup;

  /**
  * Where to place the network interfaces within the VPC.
  *
  * @default no subnet
  */
  readonly subnetSelection?: ec2.SubnetSelection;
}

/**
 * GitHub Actions runner provider using Lambda to execute the actions.
 *
 * Creates a Docker-based function that gets executed for each job.
 *
 * This construct is not meant to be used by itself. It should be passed in the providers property for GitHubRunners.
 */
export class LambdaRunner extends BaseProvider implements IRunnerProvider {
  /**
   * Path to Dockerfile for Linux x64 with all the requirement for Lambda runner. Use this Dockerfile unless you need to customize it further than allowed by hooks.
   *
   * Available build arguments that can be set in the image builder:
   * * `BASE_IMAGE` sets the `FROM` line. This should be similar to public.ecr.aws/lambda/nodejs:14.
   * * `EXTRA_PACKAGES` can be used to install additional packages.
   */
  public static readonly LINUX_X64_DOCKERFILE_PATH = path.join(__dirname, 'docker-images', 'lambda', 'linux-x64');

  /**
   * Path to Dockerfile for Linux ARM64 with all the requirement for Lambda runner. Use this Dockerfile unless you need to customize it further than allowed by hooks.
   *
   * Available build arguments that can be set in the image builder:
   * * `BASE_IMAGE` sets the `FROM` line. This should be similar to public.ecr.aws/lambda/nodejs:14.
   * * `EXTRA_PACKAGES` can be used to install additional packages.
   */
  public static readonly LINUX_ARM64_DOCKERFILE_PATH = path.join(__dirname, 'docker-images', 'lambda', 'linux-arm64');

  /**
   * The function hosting the GitHub runner.
   */
  readonly function: lambda.Function;

  /**
   * Labels associated with this provider.
   */
  readonly labels: string[];

  /**
   * VPC used for hosting the function.
   */
  readonly vpc?: ec2.IVpc;

  /**
   * Security group attached to the function.
   */
  readonly securityGroup?: ec2.ISecurityGroup;

  /**
   * Grant principal used to add permissions to the runner role.
   */
  readonly grantPrincipal: iam.IPrincipal;

  /**
   * Docker image used to start Lambda function.
   */
  readonly image: RunnerImage;

  constructor(scope: Construct, id: string, props: LambdaRunnerProps) {
    super(scope, id);

    this.labels = this.labelsFromProperties('lambda', props.label, props.labels);
    this.vpc = props.vpc;
    this.securityGroup = props.securityGroup;

    const imageBuilder = props.imageBuilder ?? new CodeBuildImageBuilder(this, 'Image Builder', {
      dockerfilePath: LambdaRunner.LINUX_X64_DOCKERFILE_PATH,
    });
    const image = this.image = imageBuilder.bind();

    let architecture: lambda.Architecture | undefined;
    if (image.os.is(Os.LINUX)) {
      if (image.architecture.is(Architecture.X86_64)) {
        architecture = lambda.Architecture.X86_64;
      }
      if (image.architecture.is(Architecture.ARM64)) {
        architecture = lambda.Architecture.ARM_64;
      }
    }

    if (!architecture) {
      throw new Error(`Unable to find support Lambda architecture for ${image.os.name}/${image.architecture.name}`);
    }

    // get image digest and make sure to get it every time the lambda function might be updated
    // pass all variables that may change and cause a function update
    // if we don't get the latest digest, the update may fail as a new image was already built outside the stack on a schedule
    // we automatically delete old images, so we must always get the latest digest
    const imageDigest = this.imageDigest(image, {
      version: 1, // bump this for any non-user changes like description or defaults
      labels: this.labels,
      architecture: architecture.name,
      vpc: this.vpc?.vpcId,
      securityGroups: this.securityGroup?.securityGroupId,
      vpcSubnets: props.subnetSelection?.subnets?.map(s => s.subnetId),
      timeout: props.timeout?.toSeconds(),
      memorySize: props.memorySize,
      ephemeralStorageSize: props.ephemeralStorageSize?.toKibibytes(),
      logRetention: props.logRetention?.toFixed(),
    });

    this.function = new lambda.DockerImageFunction(
      this,
      'Function',
      {
        description: `GitHub Actions runner for labels ${this.labels}`,
        // CDK requires "sha256:" literal prefix -- https://github.com/aws/aws-cdk/blob/ba91ca45ad759ab5db6da17a62333e2bc11e1075/packages/%40aws-cdk/aws-ecr/lib/repository.ts#L184
        code: lambda.DockerImageCode.fromEcr(image.imageRepository, { tagOrDigest: `sha256:${imageDigest}` }),
        architecture,
        vpc: this.vpc,
        securityGroups: this.securityGroup && [this.securityGroup],
        vpcSubnets: props.subnetSelection,
        timeout: props.timeout || cdk.Duration.minutes(15),
        memorySize: props.memorySize || 2048,
        ephemeralStorageSize: props.ephemeralStorageSize || cdk.Size.gibibytes(10),
        logRetention: props.logRetention || RetentionDays.ONE_MONTH,
      },
    );

    this.grantPrincipal = this.function.grantPrincipal;

    this.addImageUpdater(image);
  }

  /**
   * The network connections associated with this resource.
   */
  public get connections(): ec2.Connections {
    return this.function.connections;
  }

  /**
   * Generate step function task(s) to start a new runner.
   *
   * Called by GithubRunners and shouldn't be called manually.
   *
   * @param parameters workflow job details
   */
  getStepFunctionTask(parameters: RunnerRuntimeParameters): stepfunctions.IChainable {
    return new stepfunctions_tasks.LambdaInvoke(
      this,
      this.labels.join(', '),
      {
        lambdaFunction: this.function,
        payload: stepfunctions.TaskInput.fromObject({
          token: parameters.runnerTokenPath,
          runnerName: parameters.runnerNamePath,
          label: this.labels.join(','),
          githubDomain: parameters.githubDomainPath,
          owner: parameters.ownerPath,
          repo: parameters.repoPath,
        }),
      },
    );
  }

  private addImageUpdater(image: RunnerImage) {
    // Lambda needs to be pointing to a specific image digest and not just a tag.
    // Whenever we update the tag to a new digest, we need to update the lambda.

    const updater = BundledNodejsFunction.singleton(this, 'update-lambda', {
      description: 'Function that updates a GitHub Actions runner function with the latest image digest after the image has been rebuilt',
      timeout: cdk.Duration.minutes(15),
    });

    updater.addToRolePolicy(new iam.PolicyStatement({
      actions: ['lambda:UpdateFunctionCode'],
      resources: [this.function.functionArn],
    }));

    let lambdaTarget = new events_targets.LambdaFunction(updater, {
      event: events.RuleTargetInput.fromObject({
        lambdaName: this.function.functionName,
        repositoryUri: image.imageRepository.repositoryUri,
        repositoryTag: image.imageTag,
      }),
    });

    const rule = image.imageRepository.onEvent('Push rule', {
      description: 'Update GitHub Actions runner Lambda on ECR image push',
      eventPattern: {
        detailType: ['ECR Image Action'],
        detail: {
          'action-type': ['PUSH'],
          'repository-name': [image.imageRepository.repositoryName],
          'image-tag': [image.imageTag],
          'result': ['SUCCESS'],
        },
      },
      target: lambdaTarget,
    });

    // the event never triggers without this - not sure why
    (rule.node.defaultChild as events.CfnRule).addDeletionOverride('Properties.EventPattern.resources');
  }

  private imageDigest(image: RunnerImage, variableSettings: any): string {
    // describe ECR image to get its digest
    // the physical id is random so the resource always runs and always gets the latest digest, even if a scheduled build replaced the stack image
    const reader = new cr.AwsCustomResource(this, 'Image Digest Reader', {
      onCreate: {
        service: 'ECR',
        action: 'describeImages',
        parameters: {
          repositoryName: image.imageRepository.repositoryName,
          imageIds: [
            {
              imageTag: image.imageTag,
            },
          ],
        },
        physicalResourceId: cr.PhysicalResourceId.of('ImageDigest'),
      },
      onUpdate: {
        service: 'ECR',
        action: 'describeImages',
        parameters: {
          repositoryName: image.imageRepository.repositoryName,
          imageIds: [
            {
              imageTag: image.imageTag,
            },
          ],
        },
        physicalResourceId: cr.PhysicalResourceId.of('ImageDigest'),
      },
      onDelete: {
        // this will NOT be called thanks to RemovalPolicy.RETAIN below
        // we only use this to force the custom resource to be called again and get a new digest
        service: 'fake',
        action: 'fake',
        parameters: variableSettings,
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [image.imageRepository.repositoryArn],
      }),
      resourceType: 'Custom::EcrImageDigest',
      installLatestAwsSdk: false, // no need and it takes 60 seconds
      logRetention: RetentionDays.ONE_MONTH,
    });

    const res = reader.node.tryFindChild('Resource') as cdk.CustomResource | undefined;
    if (res) {
      // don't actually call the fake onDelete above
      res.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
    } else {
      throw new Error('Resource not found in AwsCustomResource. Report this bug at https://github.com/CloudSnorkel/cdk-github-runners/issues.');
    }

    // return only the digest because CDK expects 'sha256:' literal above
    return cdk.Fn.split(':', reader.getResponseField('imageDetails.0.imageDigest'), 2)[1];
  }
}
