import { aws_ec2 as ec2, aws_iam as iam, aws_logs as logs, aws_stepfunctions as stepfunctions } from 'aws-cdk-lib';

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
 * Common properties for all runner providers.
 */
export interface RunnerProviderProps {
  /**
   * Version of GitHub Runners to install.
   *
   * @default latest version available
   */
  readonly runnerVersion?: RunnerVersion;

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
 * Interface for all runner providers. Implementations create all required resources and return a step function task that starts those resources from {@link getStepFunctionTask}.
 */
export interface IRunnerProvider extends ec2.IConnectable, iam.IGrantable {
  /**
   * GitHub Actions label associated with this runner provider.
   */
  readonly label: string;

  /**
   * VPC network in which runners will be placed.
   */
  readonly vpc?: ec2.IVpc;

  /**
   * Security group associated with runners.
   */
  readonly securityGroup?: ec2.ISecurityGroup;

  /**
   * Generate step function tasks that execute the runner.
   *
   * Called by GithubRunners and shouldn't be called manually.
   *
   * @param parameters specific build parameters
   */
  getStepFunctionTask(parameters: RunnerRuntimeParameters): stepfunctions.IChainable;
}
