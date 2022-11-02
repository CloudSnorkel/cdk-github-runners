import { aws_ec2 as ec2, aws_ecr as ecr, aws_iam as iam, aws_logs as logs, aws_stepfunctions as stepfunctions } from 'aws-cdk-lib';
import { Construct } from 'constructs';

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
  public is(arch: Architecture) {
    return arch.name == this.name;
  }
}

/**
 * OS enum for an image.
 */
export class Os {
  /**
  * Linux
  */
  public static readonly LINUX = Os.of('Linux');

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
}

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
}

/**
 * Interface for constructs that build an image that can be used in {@link IRunnerProvider}.
 *
 * Anything that ends up with an ECR repository containing a Docker image that runs GitHub self-hosted runners can be used. A simple implementation could even point to an existing image and nothing else.
 *
 * It's important that the specified image tag be available at the time the repository is available. Providers usually assume the image is ready and will fail if it's not.
 *
 * The image can be further updated over time manually or using a schedule as long as it is always written to the same tag.
 */
export interface IImageBuilder {
  /**
   * ECR repository containing the image.
   *
   * This method can be called multiple times if the image is bound to multiple providers. Make sure you cache the image when implementing or return an error if this builder doesn't support reusing images.
   *
   * @return image
   */
  bind(): RunnerImage;
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
}

/**
 * Workflow job parameters as parsed from the webhook event. Pass these into your runner executor and run something like:
 *
 * ```sh
 * ./config.sh --unattended --url "https://${GITHUB_DOMAIN}/${OWNER}/${REPO}" --token "${RUNNER_TOKEN}" --ephemeral --work _work --labels "${RUNNER_LABEL}" --name "${RUNNER_NAME}" --disableupdate
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
   * Path to repostiroy owner name.
   */
  readonly ownerPath: string;

  /**
   * Path to repository name.
   */
  readonly repoPath: string;
}

/**
 * Interface for runner image status used by status.json.
 */
export interface IRunnerImageStatus {
  /**
   * Image repository where runner image is pushed.
   */
  readonly imageRepository?: string;

  /**
   * Tag of image that should be used.
   */
  readonly imageTag?: string;

  /**
   * Log group name for the image builder where history of image builds can be analyzed.
   */
  readonly imageBuilderLogGroup?: string;
}

/**
 * Interface for all runner providers. Implementations create all required resources and return a step function task that starts those resources from {@link getStepFunctionTask}.
 */
export interface IRunnerProvider extends ec2.IConnectable, iam.IGrantable {
  /**
   * GitHub Actions labels used for this provider.
   *
   * These labels are used to identify which provider should spawn a new on-demand runner. Every job sends a webhook with the labels it's looking for
   * based on runs-on. We use match the labels from the webhook with the labels specified here. If all the labels specified here are present in the
   * job's labels, this provider will be chosen and spawn a new runner.
   */
  readonly labels: string[];

  /**
   * VPC network in which runners will be placed.
   */
  readonly vpc?: ec2.IVpc;

  /**
   * Security group associated with runners.
   */
  readonly securityGroup?: ec2.ISecurityGroup;

  /**
   * Image used to create a new resource compute. Can be Docker image, AMI, or something else.
   */
  readonly image: RunnerImage;

  /**
   * Generate step function tasks that execute the runner.
   *
   * Called by GithubRunners and shouldn't be called manually.
   *
   * @param parameters specific build parameters
   */
  getStepFunctionTask(parameters: RunnerRuntimeParameters): stepfunctions.IChainable;
}

/**
 * Base class for all providers with common methods used by all providers.
 *
 * @internal
 */
export abstract class BaseProvider extends Construct {
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
