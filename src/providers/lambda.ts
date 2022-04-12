import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import {
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_stepfunctions as stepfunctions,
  aws_stepfunctions_tasks as stepfunctions_tasks,
} from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { IRunnerProvider, RunnerRuntimeParameters, RunnerProviderProps, RunnerVersion } from './common';

export interface LambdaRunnerProps extends RunnerProviderProps {
  /**
   * GitHub Actions label used for this provider.
   *
   * @default 'lambda'
   */
  readonly label?: string;

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
 */
export class LambdaRunner extends Construct implements IRunnerProvider {
  readonly function: lambda.Function;

  readonly label: string;
  readonly vpc?: ec2.IVpc;
  readonly securityGroup?: ec2.ISecurityGroup;
  readonly grantPrincipal: iam.IPrincipal;

  constructor(scope: Construct, id: string, props: LambdaRunnerProps) {
    super(scope, id);

    this.label = props.label || 'lambda';
    this.vpc = props.vpc;
    this.securityGroup = props.securityGroup;

    this.function = new lambda.DockerImageFunction(
      this,
      'Function',
      {
        // https://docs.aws.amazon.com/lambda/latest/dg/images-create.html
        code: lambda.DockerImageCode.fromImageAsset(
          path.join(__dirname, 'docker-images', 'lambda'),
          {
            buildArgs: {
              RUNNER_VERSION: props.runnerVersion ? props.runnerVersion.version : RunnerVersion.latest().version,
            },
          },
        ),
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
  }

  public get connections(): ec2.Connections {
    return this.function.connections;
  }

  getStepFunctionTask(parameters: RunnerRuntimeParameters): stepfunctions.IChainable {
    return new stepfunctions_tasks.LambdaInvoke(
      this,
      'Lambda Runner',
      {
        lambdaFunction: this.function,
        payload: stepfunctions.TaskInput.fromObject({
          token: parameters.runnerTokenPath,
          runnerName: parameters.runnerNamePath,
          label: this.label,
          githubDomain: parameters.githubDomainPath,
          owner: parameters.ownerPath,
          repo: parameters.repoPath,
        }),
      },
    );
  }
}