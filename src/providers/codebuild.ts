import * as path from 'path';
import {
  Duration,
  aws_codebuild as codebuild,
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_logs as logs,
  aws_stepfunctions as stepfunctions,
  aws_stepfunctions_tasks as stepfunctions_tasks,
} from 'aws-cdk-lib';
import { ComputeType } from 'aws-cdk-lib/aws-codebuild';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IntegrationPattern } from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import { IRunnerProvider, RunnerProviderProps, RunnerRuntimeParameters, RunnerVersion } from './common';

export interface CodeBuildRunnerProps extends RunnerProviderProps {
  /**
   * GitHub Actions label used for this provider.
   *
   * @default 'codebuild'
   */
  readonly label?: string;

  /**
   * VPC to launch the runners in.
   *
   * @default no VPC
   */
  readonly vpc?: ec2.IVpc;

  /**
   * Security Group to assign to this instance.
   *
   * @default public project with no security group
   */
  readonly securityGroup?: ec2.ISecurityGroup;

  /**
   * Where to place the network interfaces within the VPC.
   *
   * @default no subnet
   */
  readonly subnetSelection?: ec2.SubnetSelection;

  /**
   * The type of compute to use for this build.
   * See the {@link ComputeType} enum for the possible values.
   *
   * @default {@link ComputeType#SMALL}
   */
  readonly computeType?: codebuild.ComputeType;

  /**
   * The number of minutes after which AWS CodeBuild stops the build if it's
   * not complete. For valid values, see the timeoutInMinutes field in the AWS
   * CodeBuild User Guide.
   *
   * @default Duration.hours(1)
   */
  readonly timeout?: Duration;
}

/**
 * GitHub Actions runner provider using CodeBuild to execute the actions.
 *
 * Creates a project that gets started for each job.
 */
export class CodeBuildRunner extends Construct implements IRunnerProvider {
  readonly project: codebuild.Project;

  readonly label: string;
  readonly vpc?: ec2.IVpc;
  readonly securityGroup?: ec2.ISecurityGroup;
  readonly grantPrincipal: iam.IPrincipal;

  constructor(scope: Construct, id: string, props: CodeBuildRunnerProps) {
    super(scope, id);

    this.label = props.label || 'codebuild';
    this.vpc = props.vpc;
    this.securityGroup = props.securityGroup;

    const buildSpec = {
      version: '0.2',
      env: {
        variables: {
          RUNNER_TOKEN: 'unspecified',
          RUNNER_NAME: 'unspecified',
          RUNNER_LABEL: 'unspecified',
          OWNER: 'unspecified',
          REPO: 'unspecified',
          GITHUB_DOMAIN: 'github.com',
        },
      },
      phases: {
        install: {
          commands: [
            'sudo -Hu runner /home/runner/config.sh --unattended --url "https://${GITHUB_DOMAIN}/${OWNER}/${REPO}" --token "${RUNNER_TOKEN}" --ephemeral --work _work --labels "${RUNNER_LABEL}" --disableupdate --name "${RUNNER_NAME}"',
          ],
        },
        build: {
          commands: [
            'sudo -Hu runner /home/runner/run.sh',
          ],
        },
      },
    };

    this.project = new codebuild.Project(
      this,
      'CodeBuild',
      {
        buildSpec: codebuild.BuildSpec.fromObject(buildSpec),
        vpc: this.vpc,
        securityGroups: this.securityGroup ? [this.securityGroup] : undefined,
        subnetSelection: props.subnetSelection,
        timeout: props.timeout || Duration.hours(1),
        environment: {
          buildImage: codebuild.LinuxBuildImage.fromAsset(this, 'image', {
            directory: path.join(__dirname, 'docker-images', 'codebuild'),
            buildArgs: {
              RUNNER_VERSION: props.runnerVersion ? props.runnerVersion.version : RunnerVersion.latest().version,
            },
          }),
          computeType: props.computeType || ComputeType.SMALL,
        },
        logging: {
          cloudWatch: {
            logGroup: new logs.LogGroup(
              this,
              'Logs',
              {
                retention: props.logRetention || RetentionDays.ONE_MONTH,
              },
            ),
          },
        },
      },
    );

    this.grantPrincipal = this.project.grantPrincipal;
  }

  getStepFunctionTask(parameters: RunnerRuntimeParameters): stepfunctions.IChainable {
    return new stepfunctions_tasks.CodeBuildStartBuild(
      this,
      'Linux CodeBuild Runner',
      {
        integrationPattern: IntegrationPattern.RUN_JOB, // sync
        project: this.project,
        environmentVariablesOverride: {
          RUNNER_TOKEN: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: parameters.runnerTokenPath,
          },
          RUNNER_NAME: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: parameters.runnerNamePath,
          },
          RUNNER_LABEL: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: this.label,
          },
          GITHUB_DOMAIN: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: parameters.githubDomainPath,
          },
          OWNER: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: parameters.ownerPath,
          },
          REPO: {
            type: codebuild.BuildEnvironmentVariableType.PLAINTEXT,
            value: parameters.repoPath,
          },
        },
      },
    );
  }

  public get connections(): ec2.Connections {
    return this.project.connections;
  }
}