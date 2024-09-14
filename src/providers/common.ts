import * as cdk from 'aws-cdk-lib';
import {
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_stepfunctions as stepfunctions,
  CustomResource,
  Duration,
} from 'aws-cdk-lib';
import { Construct, IConstruct } from 'constructs';
import { AmiRootDeviceFunction } from './ami-root-device-function';
import { singletonLambda, singletonLogGroup, SingletonLogType } from '../utils';

/**
 * Defines desired GitHub Actions runner version.
 */
export class RunnerVersion {
  /**
   * Use the latest version available at the time the runner provider image is built.
   */
  public static latest(): RunnerVersion {
    return new RunnerVersion('latest');
  }

  /**
   * Use a specific version.
   *
   * @see https://github.com/actions/runner/releases
   *
   * @param version GitHub Runner version
   */
  public static specific(version: string) {
    return new RunnerVersion(version);
  }

  protected constructor(readonly version: string) {
  }

  /**
   * Check if two versions are the same.
   *
   * @param other version to compare
   */
  public is(other: RunnerVersion) {
    return this.version == other.version;
  }
}

/**
 * CPU architecture enum for an image.
 */
export class Architecture {
  /**
   * ARM64
   */
  public static readonly ARM64 = Architecture.of('ARM64');

  /**
   * X86_64
   */
  public static readonly X86_64 = Architecture.of('X86_64');

  private static of(architecture: string) {
    return new Architecture(architecture);
  }

  private constructor(public readonly name: string) {
  }

  /**
  * Checks if the given architecture is the same as this one.
  *
  * @param arch architecture to compare
  */
  public is(arch: Architecture): boolean {
    return arch.name == this.name;
  }

  /**
   * Checks if this architecture is in a given list.
   *
   * @param arches architectures to check
   */
  public isIn(arches: Architecture[]): boolean {
    for (const arch of arches) {
      if (this.is(arch)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if a given EC2 instance type matches this architecture.
   *
   * @param instanceType instance type to check
   */
  public instanceTypeMatch(instanceType: ec2.InstanceType): boolean {
    if (instanceType.architecture == ec2.InstanceArchitecture.X86_64) {
      return this.is(Architecture.X86_64);
    }
    if (instanceType.architecture == ec2.InstanceArchitecture.ARM_64) {
      return this.is(Architecture.ARM64);
    }
    throw new Error('Unknown instance type architecture');
  }
}

/**
 * OS enum for an image.
 */
export class Os {
  /**
  * Linux
  *
  * @deprecated use {@link LINUX_UBUNTU} or {@link LINUX_AMAZON_2} or {@link LINUX_AMAZON_2023}
  */
  public static readonly LINUX = Os.of('Linux');

  /**
   * Ubuntu Linux
   */
  public static readonly LINUX_UBUNTU = Os.of('Ubuntu Linux');

  /**
   * Amazon Linux 2
   */
  public static readonly LINUX_AMAZON_2 = Os.of('Amazon Linux 2');

  /**
   * Amazon Linux 2023
   */
  public static readonly LINUX_AMAZON_2023 = Os.of('Amazon Linux 2023');

  /**
   * @internal
   */
  public static readonly _ALL_LINUX_VERSIONS = [Os.LINUX, Os.LINUX_UBUNTU, Os.LINUX_AMAZON_2, Os.LINUX_AMAZON_2023];

  /**
  * Windows
  */
  public static readonly WINDOWS = Os.of('Windows');

  private static of(os: string) {
    return new Os(os);
  }

  private constructor(public readonly name: string) {
  }

  /**
  * Checks if the given OS is the same as this one.
  *
  * @param os OS to compare
  */
  public is(os: Os) {
    return os.name == this.name;
  }

  /**
   * Checks if this OS is in a given list.
   *
   * @param oses list of OS to check
   */
  public isIn(oses: Os[]): boolean {
    for (const os of oses) {
      if (this.is(os)) {
        return true;
      }
    }
    return false;
  }
}

/**
 * Description of a Docker image built by {@link RunnerImageBuilder}.
 */
export interface RunnerImage {
  /**
   * ECR repository containing the image.
   */
  readonly imageRepository: ecr.IRepository;

  /**
   * Static image tag where the image will be pushed.
   */
  readonly imageTag: string;

  /**
   * Architecture of the image.
   */
  readonly architecture: Architecture;

  /**
   * OS type of the image.
   */
  readonly os: Os;

  /**
   * Log group where image builds are logged.
   */
  readonly logGroup?: logs.LogGroup;

  /**
   * Installed runner version.
   *
   * @deprecated open a ticket if you need this
   */
  readonly runnerVersion: RunnerVersion;

  /**
   * A dependable string that can be waited on to ensure the image is ready.
   *
   * @internal
   */
  readonly _dependable?: string;
}

/**
 * Description of a AMI built by {@link RunnerImageBuilder}.
 */
export interface RunnerAmi {
  /**
   * Launch template pointing to the latest AMI.
   */
  readonly launchTemplate: ec2.ILaunchTemplate;

  /**
   * Architecture of the image.
   */
  readonly architecture: Architecture;

  /**
   * OS type of the image.
   */
  readonly os: Os;

  /**
   * Log group where image builds are logged.
   */
  readonly logGroup?: logs.LogGroup;

  /**
   * Installed runner version.
   *
   * @deprecated open a ticket if you need this
   */
  readonly runnerVersion: RunnerVersion;
}

/**
 * Retry options for providers. The default is to retry 23 times for about 24 hours with increasing interval.
 */
export interface ProviderRetryOptions {
  /**
   * Set to true to retry provider on supported failures. Which failures generate a retry depends on the specific provider.
   *
   * @default true
   */
  readonly retry?: boolean;

  /**
   * How much time to wait after first retryable failure. This interval will be multiplied by {@link backoffRate} each retry.
   *
   * @default 1 minute
   */
  readonly interval?: Duration;

  /**
   * How many times to retry.
   *
   * @default 23
   */
  readonly maxAttempts?: number;

  /**
   * Multiplication for how much longer the wait interval gets on every retry.
   *
   * @default 1.3
   */
  readonly backoffRate?: number;
}

/**
 * Common properties for all runner providers.
 */
export interface RunnerProviderProps {
  /**
   * The number of days log events are kept in CloudWatch Logs. When updating
   * this property, unsetting it doesn't remove the log retention policy. To
   * remove the retention policy, set the value to `INFINITE`.
   *
   * @default logs.RetentionDays.ONE_MONTH
   */
  readonly logRetention?: logs.RetentionDays;

  /**
   * @deprecated use {@link retryOptions} on {@link GitHubRunners} instead
   */
  readonly retryOptions?: ProviderRetryOptions;
}

/**
 * Workflow job parameters as parsed from the webhook event. Pass these into your runner executor and run something like:
 *
 * ```sh
 * ./config.sh --unattended --url "{REGISTRATION_URL}" --token "${RUNNER_TOKEN}" --ephemeral --work _work --labels "${RUNNER_LABEL}" --name "${RUNNER_NAME}" --disableupdate
 * ```
 *
 * All parameters are specified as step function paths and therefore must be used only in step function task parameters.
 */
export interface RunnerRuntimeParameters {
  /**
   * Path to runner token used to register token.
   */
  readonly runnerTokenPath: string;

  /**
   * Path to desired runner name. We specifically set the name to make troubleshooting easier.
   */
  readonly runnerNamePath: string;

  /**
   * Path to GitHub domain. Most of the time this will be github.com but for self-hosted GitHub instances, this will be different.
   */
  readonly githubDomainPath: string;

  /**
   * Path to repository owner name.
   */
  readonly ownerPath: string;

  /**
   * Path to repository name.
   */
  readonly repoPath: string;

  /**
   * Repository or organization URL to register runner at.
   */
  readonly registrationUrl: string;

}

/**
 * Image status returned from runner providers to be displayed in status.json.
 */
export interface IRunnerImageStatus {
  /**
   * Image repository where image builder pushes runner images.
   */
  readonly imageRepository: string;

  /**
   * Tag of image that should be used.
   */
  readonly imageTag: string;

  /**
   * Log group name for the image builder where history of image builds can be analyzed.
   */
  readonly imageBuilderLogGroup?: string;
}

/**
 * AMI status returned from runner providers to be displayed as output of status function.
 */
export interface IRunnerAmiStatus {
  /**
   * Id of launch template pointing to the latest AMI built by the AMI builder.
   */
  readonly launchTemplate: string;

  /**
   * Log group name for the AMI builder where history of builds can be analyzed.
   */
  readonly amiBuilderLogGroup?: string;
}

/**
 * Interface for runner image status used by status.json.
 */
export interface IRunnerProviderStatus {
  /**
   * Runner provider type.
   */
  readonly type: string;

  /**
   * Labels associated with provider.
   */
  readonly labels: string[];

  /**
   * VPC where runners will be launched.
   */
  readonly vpcArn?: string;

  /**
   * Security groups attached to runners.
   */
  readonly securityGroups?: string[];

  /**
   * Role attached to runners.
   */
  readonly roleArn?: string;

  /**
   * Details about Docker image used by this runner provider.
   */
  readonly image?: IRunnerImageStatus;

  /**
   * Details about AMI used by this runner provider.
   */
  readonly ami?: IRunnerAmiStatus;

  /**
   * Log group for runners.
   */
  readonly logGroup?: string;
}

/**
 * Interface for all runner providers. Implementations create all required resources and return a step function task that starts those resources from {@link getStepFunctionTask}.
 */
export interface IRunnerProvider extends ec2.IConnectable, iam.IGrantable, IConstruct {
  /**
   * GitHub Actions labels used for this provider.
   *
   * These labels are used to identify which provider should spawn a new on-demand runner. Every job sends a webhook with the labels it's looking for
   * based on runs-on. We use match the labels from the webhook with the labels specified here. If all the labels specified here are present in the
   * job's labels, this provider will be chosen and spawn a new runner.
   */
  readonly labels: string[];

  /**
   * Log group where provided runners will save their logs.
   *
   * Note that this is not the job log, but the runner itself. It will not contain output from the GitHub Action but only metadata on its execution.
   */
  readonly logGroup: logs.ILogGroup;

  /**
   * List of step functions errors that should be retried.
   *
   * @deprecated do not use
   */
  readonly retryableErrors: string[];

  /**
   * Generate step function tasks that execute the runner.
   *
   * Called by GithubRunners and shouldn't be called manually.
   *
   * @param parameters specific build parameters
   */
  getStepFunctionTask(parameters: RunnerRuntimeParameters): stepfunctions.IChainable;

  /**
   * An optional method that modifies the role of the state machine after all the tasks have been generated. This can be used to add additional policy
   * statements to the state machine role that are not automatically added by the task returned from {@link getStepFunctionTask}.
   *
   * @param stateMachineRole role for the state machine that executes the task returned from {@link getStepFunctionTask}.
   */
  grantStateMachine(stateMachineRole: iam.IGrantable): void;

  /**
   * Return status of the runner provider to be used in the main status function. Also gives the status function any needed permissions to query the Docker image or AMI.
   *
   * @param statusFunctionRole grantable for the status function
   */
  status(statusFunctionRole: iam.IGrantable): IRunnerProviderStatus;
}

/**
 * Base class for all providers with common methods used by all providers.
 *
 * @internal
 */
export abstract class BaseProvider extends Construct {
  protected constructor(scope: Construct, id: string, _props?: RunnerProviderProps) {
    super(scope, id);

    cdk.Tags.of(this).add('GitHubRunners:Provider', this.node.path);
  }

  protected labelsFromProperties(defaultLabel: string, propsLabel: string | undefined, propsLabels: string[] | undefined): string[] {
    if (propsLabels && propsLabel) {
      throw new Error('Must supply either `label` or `labels` in runner properties, but not both. Try removing the `label` property.');
    }

    if (propsLabels) {
      return propsLabels;
    }
    if (propsLabel) {
      return [propsLabel];
    }
    return [defaultLabel];
  }
}

/**
 * Use custom resource to determine the root device name of a given AMI, Launch Template, or SSM parameter pointing to AMI.
 *
 * TODO move somewhere more common as it's used by both providers and AMI builder now
 *
 * @internal
 */
export function amiRootDevice(scope: Construct, ami?: string) {
  const crHandler = singletonLambda(AmiRootDeviceFunction, scope, 'AMI Root Device Reader', {
    description: 'Custom resource handler that discovers the boot drive device name for a given AMI',
    timeout: cdk.Duration.minutes(1),
    logGroup: singletonLogGroup(scope, SingletonLogType.RUNNER_IMAGE_BUILD),
    logFormat: lambda.LogFormat.JSON,
    initialPolicy: [
      new iam.PolicyStatement({
        actions: [
          'ssm:GetParameter',
          'ec2:DescribeImages',
          'ec2:DescribeLaunchTemplateVersions',
          'imagebuilder:GetImage',
        ],
        resources: ['*'],
      }),
    ],
  });

  return new CustomResource(scope, 'AMI Root Device', {
    serviceToken: crHandler.functionArn,
    resourceType: 'Custom::AmiRootDevice',
    properties: {
      Ami: ami ?? '',
    },
  });
}
