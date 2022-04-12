import { aws_ec2 as ec2, aws_iam as iam, aws_logs as logs, aws_stepfunctions as stepfunctions } from 'aws-cdk-lib';

export class RunnerVersion {
  public static latest(): RunnerVersion {
    return new RunnerVersion('latest');
  }

  public static specific(version: string) {
    return new RunnerVersion(version);
  }

  protected constructor(readonly version: string) {
  }
}

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

export interface RunnerRuntimeParameters {
  readonly runnerTokenPath: string;
  readonly runnerNamePath: string;
  readonly githubDomainPath: string;
  readonly ownerPath: string;
  readonly repoPath: string;
}

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
   * @param parameters specific build parameters
   */
  getStepFunctionTask(parameters: RunnerRuntimeParameters): stepfunctions.IChainable;
}
