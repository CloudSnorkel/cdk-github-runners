// TODO let user specify fleet launch templates? something useful about fleets?

import * as cdk from 'aws-cdk-lib';
import {
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_logs as logs,
  aws_ssm as ssm,
  aws_stepfunctions as stepfunctions,
  aws_stepfunctions_tasks as stepfunctions_tasks, Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  amiRootDevice,
  Architecture,
  BaseProvider,
  IRunnerProvider,
  IRunnerProviderStatus,
  Os,
  RunnerAmi,
  RunnerProviderProps,
  RunnerRuntimeParameters,
  RunnerVersion,
} from './common';
import { IRunnerImageBuilder, RunnerImageBuilder, RunnerImageBuilderProps, RunnerImageBuilderType, RunnerImageComponent } from '../image-builders';
import { MINIMAL_EC2_SSM_SESSION_MANAGER_POLICY_STATEMENT } from '../utils';


/**
 * Properties for {@link Ec2RunnerProvider} construct.
 */
export interface Ec2RunnerProviderProps extends RunnerProviderProps {
  /**
   * Runner image builder used to build AMI containing GitHub Runner and all requirements.
   *
   * The image builder determines the OS and architecture of the runner.
   *
   * @default Ec2RunnerProvider.imageBuilder()
   */
  readonly imageBuilder?: IRunnerImageBuilder;

  /**
   * @deprecated use imageBuilder
   */
  readonly amiBuilder?: IRunnerImageBuilder;

  /**
   * GitHub Actions labels used for this provider.
   *
   * These labels are used to identify which provider should spawn a new on-demand runner. Every job sends a webhook with the labels it's looking for
   * based on runs-on. We match the labels from the webhook with the labels specified here. If all the labels specified here are present in the
   * job's labels, this provider will be chosen and spawn a new runner.
   *
   * @default ['ec2']
   */
  readonly labels?: string[];

  /**
   * Instance type for launched runner instances.
   *
   * @default m5.large
   */
  readonly instanceType?: ec2.InstanceType;

  /**
   * Size of volume available for launched runner instances. This modifies the boot volume size and doesn't add any additional volumes.
   *
   * @default 30GB
   */
  readonly storageSize?: cdk.Size;

  /**
   * Security Group to assign to launched runner instances.
   *
   * @default a new security group
   *
   * @deprecated use {@link securityGroups}
   */
  readonly securityGroup?: ec2.ISecurityGroup;

  /**
   * Security groups to assign to launched runner instances.
   *
   * @default a new security group
   */
  readonly securityGroups?: ec2.ISecurityGroup[];

  /**
   * Subnet where the runner instances will be launched.
   *
   * @default default subnet of account's default VPC
   *
   * @deprecated use {@link vpc} and {@link subnetSelection}
   */
  readonly subnet?: ec2.ISubnet;

  /**
   * VPC where runner instances will be launched.
   *
   * @default default account VPC
   */
  readonly vpc?: ec2.IVpc;

  /**
   * Where to place the network interfaces within the VPC. Only the first matched subnet will be used.
   *
   * @default default VPC subnet
   */
  readonly subnetSelection?: ec2.SubnetSelection;

  /**
   * Use spot instances to save money. Spot instances are cheaper but not always available and can be stopped prematurely.
   *
   * @default false
   */
  readonly spot?: boolean;

  /**
   * Set a maximum price for spot instances.
   *
   * @default no max price (you will pay current spot price)
   */
  readonly spotMaxPrice?: string;
}

/**
 * GitHub Actions runner provider using EC2 to execute jobs.
 *
 * This construct is not meant to be used by itself. It should be passed in the providers property for GitHubRunners.
 */
export class Ec2RunnerProvider extends BaseProvider implements IRunnerProvider {
  /**
   * Create new image builder that builds EC2 specific runner images.
   *
   * You can customize the OS, architecture, VPC, subnet, security groups, etc. by passing in props.
   *
   * You can add components to the image builder by calling `imageBuilder.addComponent()`.
   *
   * The default OS is Ubuntu running on x64 architecture.
   *
   * Included components:
   *  * `RunnerImageComponent.requiredPackages()`
   *  * `RunnerImageComponent.runnerUser()`
   *  * `RunnerImageComponent.git()`
   *  * `RunnerImageComponent.githubCli()`
   *  * `RunnerImageComponent.awsCli()`
   *  * `RunnerImageComponent.docker()`
   *  * `RunnerImageComponent.githubRunner()`
   */
  public static imageBuilder(scope: Construct, id: string, props?: RunnerImageBuilderProps) {
    return RunnerImageBuilder.new(scope, id, {
      os: Os.LINUX_UBUNTU,
      architecture: Architecture.X86_64,
      builderType: RunnerImageBuilderType.AWS_IMAGE_BUILDER,
      components: [
        RunnerImageComponent.requiredPackages(),
        RunnerImageComponent.runnerUser(),
        RunnerImageComponent.git(),
        RunnerImageComponent.githubCli(),
        RunnerImageComponent.awsCli(),
        RunnerImageComponent.docker(),
        RunnerImageComponent.githubRunner(props?.runnerVersion ?? RunnerVersion.latest()),
      ],
      ...props,
    });
  }

  /**
   * Labels associated with this provider.
   */
  readonly labels: string[];

  /**
   * Grant principal used to add permissions to the runner role.
   */
  readonly grantPrincipal: iam.IPrincipal;

  /**
   * Log group where provided runners will save their logs.
   *
   * Note that this is not the job log, but the runner itself. It will not contain output from the GitHub Action but only metadata on its execution.
   */
  readonly logGroup: logs.ILogGroup;

  readonly retryableErrors = [
    'Ec2.Ec2Exception',
    'States.Timeout',
  ];

  private readonly amiBuilder: IRunnerImageBuilder;
  private readonly ami: RunnerAmi;
  private readonly role: iam.Role;
  private readonly instanceType: ec2.InstanceType;
  private readonly storageSize: cdk.Size;
  private readonly spot: boolean;
  private readonly spotMaxPrice: string | undefined;
  private readonly vpc: ec2.IVpc;
  private readonly subnets: ec2.ISubnet[];
  private readonly securityGroups: ec2.ISecurityGroup[];
  private readonly launchTemplate: ec2.LaunchTemplate;
  private readonly document: ssm.CfnDocument;

  constructor(scope: Construct, id: string, props?: Ec2RunnerProviderProps) {
    super(scope, id, props);

    // read parameters
    this.labels = props?.labels ?? ['ec2'];
    this.vpc = props?.vpc ?? ec2.Vpc.fromLookup(this, 'Default VPC', { isDefault: true });
    this.securityGroups = props?.securityGroup ? [props.securityGroup] : (props?.securityGroups ?? [new ec2.SecurityGroup(this, 'SG', { vpc: this.vpc })]);
    this.subnets = props?.subnet ? [props.subnet] : this.vpc.selectSubnets(props?.subnetSelection).subnets;
    this.instanceType = props?.instanceType ?? ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.LARGE);
    this.storageSize = props?.storageSize ?? cdk.Size.gibibytes(30); // 30 is the minimum for Windows
    this.spot = props?.spot ?? false;
    this.spotMaxPrice = props?.spotMaxPrice;

    // instance role
    this.grantPrincipal = this.role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      inlinePolicies: {
        stepfunctions: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['states:SendTaskHeartbeat'],
              resources: ['*'], // no support for stateMachine.stateMachineArn :(
              conditions: {
                StringEquals: {
                  'aws:ResourceTag/aws:cloudformation:stack-id': cdk.Stack.of(this).stackId,
                },
              },
            }),
          ],
        }),
      },
    });
    this.grantPrincipal.addToPrincipalPolicy(MINIMAL_EC2_SSM_SESSION_MANAGER_POLICY_STATEMENT);

    // build ami
    this.amiBuilder = props?.imageBuilder ?? props?.amiBuilder ?? Ec2RunnerProvider.imageBuilder(this, 'Ami Builder', {
      vpc: props?.vpc,
      subnetSelection: props?.subnetSelection,
      securityGroups: this.securityGroups,
    });
    this.ami = this.amiBuilder.bindAmi();

    if (!this.ami.architecture.instanceTypeMatch(this.instanceType)) {
      throw new Error(`AMI architecture (${this.ami.architecture.name}) doesn't match runner instance type (${this.instanceType} / ${this.instanceType.architecture})`);
    }

    // figure out root device
    const rootDeviceResource = amiRootDevice(this, this.ami.launchTemplate.launchTemplateId);
    rootDeviceResource.node.addDependency(this.amiBuilder);

    // launch template (ami will be added later with override)
    this.launchTemplate = new ec2.LaunchTemplate(this, 'Launch Template', {
      instanceType: this.instanceType,
      role: this.role,
      instanceInitiatedShutdownBehavior: ec2.InstanceInitiatedShutdownBehavior.TERMINATE,
      requireImdsv2: true,
      instanceMetadataTags: true,
      blockDevices: [{
        deviceName: rootDeviceResource.ref,
        volume: ec2.BlockDeviceVolume.ebs(this.storageSize.toGibibytes(), {
          deleteOnTermination: true,
        }),
      }],
      spotOptions: this.spot ? {
        requestType: ec2.SpotRequestType.ONE_TIME,
        maxPrice: this.spotMaxPrice ? Number(this.spotMaxPrice) : undefined, // TODO prop should be number
      } : undefined,
      userData: this.generateUserData(),
      securityGroup: this.securityGroups.length > 0 ? this.securityGroups[0] : undefined,
    });
    this.securityGroups.slice(1).forEach(sg => this.launchTemplate.addSecurityGroup(sg));

    // role specifically for ssm document
    const ssmRole = new iam.Role(this, 'Ssm Role', {
      assumedBy: new iam.ServicePrincipal('ssm.amazonaws.com'),
      inlinePolicies: {
        stepfunctions: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['states:SendTaskFailure', 'states:SendTaskSuccess'],
              resources: ['*'], // no support for stateMachine.stateMachineArn :(
              conditions: {
                StringEquals: {
                  'aws:ResourceTag/aws:cloudformation:stack-id': cdk.Stack.of(this).stackId,
                },
              },
            }),
          ],
        }),
        ssm: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['ssm:SendCommand'],
              resources: [
                cdk.Stack.of(this).formatArn({
                  service: 'ec2',
                  resource: 'instance/*',
                }),
                cdk.Stack.of(this).formatArn({
                  service: 'ssm',
                  account: '',
                  resource: 'document/AWS-RunShellScript',
                }),
                cdk.Stack.of(this).formatArn({
                  service: 'ssm',
                  account: '',
                  resource: 'document/AWS-RunPowerShellScript',
                }),
              ],
            }),
            new iam.PolicyStatement({
              actions: ['ssm:DescribeInstanceInformation'],
              resources: ['*'],
            }),
            new iam.PolicyStatement({
              actions: [
                'ssm:ListCommands',
                'ssm:ListCommandInvocations',
              ],
              resources: [
                cdk.Stack.of(this).formatArn({
                  service: 'ssm',
                  resource: '*',
                }),
              ],
            }),
          ],
        }),
        ec2: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['ec2:TerminateInstances'],
              resources: ['*'],
              conditions: {
                StringEquals: {
                  'aws:ResourceTag/aws:ec2launchtemplate:id': this.launchTemplate.launchTemplateId,
                },
              },
            }),
          ],
        }),
      },
    });

    // log group for runner
    this.logGroup = new logs.LogGroup(
      this,
      'Logs',
      {
        retention: props?.logRetention ?? logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      },
    );
    this.logGroup.grantWrite(this.role);
    this.logGroup.grant(this.role, 'logs:CreateLogGroup');

    // ssm document that starts runner, updates step function, and terminates the instance
    this.document = new ssm.CfnDocument(this, 'Automation', {
      documentType: 'Automation',
      targetType: '/AWS::EC2::Host',
      content: {
        description: `Run GitHub Runner on EC2 instance for ${this.node.path}`,
        schemaVersion: '0.3',
        assumeRole: ssmRole.roleArn,
        parameters: {
          instanceId: {
            type: 'String',
            description: 'Instance id where runner should be executed',
          },
          taskToken: {
            type: 'String',
            description: 'Step Function task token for callback response',
          },
          runnerName: {
            type: 'String',
            description: 'Runner name',
          },
          runnerToken: {
            type: 'String',
            description: 'Runner token used to register runner on GitHub',
          },
          labels: {
            type: 'String',
            description: 'Labels to assign to runner',
          },
          registrationUrl: {
            type: 'String',
            description: 'Full URL to use for runner registration',
          },
        },
        mainSteps: [
          {
            name: 'Runner',
            action: 'aws:runCommand',
            inputs: {
              DocumentName: this.ami.os.is(Os.WINDOWS) ? 'AWS-RunPowerShellScript' : 'AWS-RunShellScript',
              InstanceIds: ['{{ instanceId }}'],
              Parameters: {
                // TODO executionTimeout: '0', // no timeout
                workingDirectory: this.ami.os.is(Os.WINDOWS) ? 'C:\\actions' : '/home/runner',
                commands: this.ami.os.is(Os.WINDOWS) ? [ // *** windows
                  // tell user data that we started
                  'New-Item STARTED',
                  // send heartbeat
                  `Start-Job -ScriptBlock {
                    while (1) {
                      aws stepfunctions send-task-heartbeat --task-token "{{ taskToken }}"
                      sleep 60
                    }
                  }`,
                  // decide if we should update runner
                  '$RunnerVersion = Get-Content RUNNER_VERSION -Raw',
                  'if ($RunnerVersion -eq "latest") { $RunnerFlags = "" } else { $RunnerFlags = "--disableupdate" }',
                  // configure runner
                  './config.cmd --unattended --url "{{ registrationUrl }}" --token "{{ runnerToken }}" --ephemeral --work _work --labels "{{ labels }},cdkghr:started:$(Get-Date -UFormat +%s)" $RunnerFlags --name "{{ runnerName }}" 2>&1',
                  'if ($LASTEXITCODE -ne 0) { return 1 }',
                  // start runner
                  './run.cmd 2>&1',
                  'if ($LASTEXITCODE -ne 0) { return 2 }',
                  // print whether job was successful for our metric filter
                  `$STATUS = Select-String -Path './_diag/*.log' -Pattern 'finish job request for job [0-9a-f\\-]+ with result: (.*)' | %{$_.Matches.Groups[1].Value} | Select-Object -Last 1

                  if ($STATUS) {
                      echo "CDKGHA JOB DONE {{ labels }} $STATUS"
                  }`,
                ] : [ // *** linux
                  'set -ex',
                  // tell user data that we started
                  'touch /home/runner/STARTED',
                  // send heartbeat
                  `{
                    while true; do
                      aws stepfunctions send-task-heartbeat --task-token "{{ taskToken }}"
                      sleep 60
                    done
                  } &`,
                  // decide if we should update runner
                  `if [ "$(cat RUNNER_VERSION)" = "latest" ]; then
                    RUNNER_FLAGS=""
                  else
                    RUNNER_FLAGS="--disableupdate"
                  fi`,
                  // configure runner
                  'sudo -Hu runner /home/runner/config.sh --unattended --url "{{ registrationUrl }}" --token "{{ runnerToken }}" --ephemeral --work _work --labels "{{ labels }},cdkghr:started:$(date +%s)" $RUNNER_FLAGS --name "{{ runnerName }}" || exit 1',
                  // start runner without exposing task token and other possibly sensitive environment variables
                  'sudo --preserve-env=AWS_REGION -Hu runner /home/runner/run.sh || exit 2',
                  // print whether job was successful for our metric filter
                  `STATUS=$(grep -Phors "finish job request for job [0-9a-f\\-]+ with result: \\K.*" /home/runner/_diag/ | tail -n1)
                  [ -n "$STATUS" ] && echo CDKGHA JOB DONE "$labels" "$STATUS"`,
                ],
              },
              CloudWatchOutputConfig: {
                CloudWatchLogGroupName: this.logGroup.logGroupName,
                CloudWatchOutputEnabled: true,
              },
            },
            nextStep: 'SendTaskSuccess',
            onFailure: 'step:SendTaskFailure',
            onCancel: 'step:SendTaskFailure',
          },
          {
            name: 'SendTaskSuccess',
            action: 'aws:executeAwsApi',
            inputs: {
              Service: 'stepfunctions',
              Api: 'send_task_success',
              taskToken: '{{ taskToken }}',
              output: '{}',
            },
            timeoutSeconds: 50,
            nextStep: 'TerminateInstance',
            onFailure: 'step:TerminateInstance',
            onCancel: 'step:TerminateInstance',
          },
          {
            name: 'SendTaskFailure',
            action: 'aws:executeAwsApi',
            inputs: {
              Service: 'stepfunctions',
              Api: 'send_task_failure',
              taskToken: '{{ taskToken }}',
              error: 'Automation document failure',
              cause: 'Runner failed, check command execution id {{Runner.CommandId}} for more details',
            },
            timeoutSeconds: 50,
            nextStep: 'TerminateInstance',
            onFailure: 'step:TerminateInstance',
            onCancel: 'step:TerminateInstance',
          },
          {
            name: 'TerminateInstance',
            action: 'aws:executeAwsApi',
            inputs: {
              Service: 'ec2',
              Api: 'terminate_instances',
              InstanceIds: ['{{ instanceId }}'],
            },
            timeoutSeconds: 50,
            isEnd: true,
          },
        ],
      },
    });
  }

  private generateUserData() {
    if (this.ami.os.is(Os.WINDOWS)) {
      const userData = ec2.UserData.forWindows();
      userData.addCommands(`Start-Job -ScriptBlock {
        Start-Sleep -Seconds 60
        if (-not (Test-Path C:/actions/STARTED)) {
          Write-Output "Runner didn't connect to SSM, powering off"
          Stop-Computer -ComputerName localhost -Force
        }
      }`);
      return userData;
    }

    const userData = ec2.UserData.forLinux();
    userData.addCommands(`{
      sleep 600
      if [ ! -e /home/runner/STARTED ]; then
        echo "Runner didn't connect to SSM, powering off"
        sudo poweroff
      fi
    } &`);
    return userData;
  }

  /**
   * Generate step function task(s) to start a new runner.
   *
   * Called by GithubRunners and shouldn't be called manually.
   *
   * @param parameters workflow job details
   */
  getStepFunctionTask(parameters: RunnerRuntimeParameters): stepfunctions.IChainable {
    const stepNamePrefix = this.labels.join(', ');

    // get ami from builder launch template
    const getAmi = new stepfunctions_tasks.CallAwsService(this, `${stepNamePrefix} Get AMI`, {
      service: 'ec2',
      action: 'describeLaunchTemplateVersions',
      parameters: {
        LaunchTemplateId: this.ami.launchTemplate.launchTemplateId,
        Versions: ['$Latest'],
      },
      iamResources: ['*'],
      resultPath: stepfunctions.JsonPath.stringAt('$.instanceInput'),
      resultSelector: {
        'ami.$': '$.LaunchTemplateVersions[0].LaunchTemplateData.ImageId',
      },
    });

    // create fleet with override per subnet
    const fleet = new stepfunctions_tasks.CallAwsService(this, `${stepNamePrefix} Fleet`, {
      service: 'ec2',
      action: 'createFleet',
      parameters: {
        TargetCapacitySpecification: {
          TotalTargetCapacity: 1,
          // TargetCapacityUnitType: 'units',
          DefaultTargetCapacityType: this.spot ? 'spot' : 'on-demand',
        },
        LaunchTemplateConfigs: [{
          LaunchTemplateSpecification: {
            LaunchTemplateId: this.launchTemplate.launchTemplateId,
            Version: '$Latest',
          },
          Overrides: this.subnets.map(subnet => {
            return {
              SubnetId: subnet.subnetId,
              WeightedCapacity: 1,
              ImageId: stepfunctions.JsonPath.stringAt('$.instanceInput.ami'),
            };
          }),
        }],
        Type: 'instant',
      },
      iamResources: ['*'],
      resultPath: stepfunctions.JsonPath.stringAt('$.instance'),
      resultSelector: {
        // TODO retry on this failing? if the call fails, there is nothing here
        'id.$': '$.Instances[0].InstanceIds[0]',
      },
    });

    // use ssm to start runner in newly launched instance
    const runDocument = new stepfunctions_tasks.CallAwsService(this, `${stepNamePrefix} SSM`, {
      // comment: subnet.subnetId,
      integrationPattern: stepfunctions.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      service: 'ssm',
      action: 'startAutomationExecution',
      heartbeatTimeout: stepfunctions.Timeout.duration(Duration.minutes(10)),
      parameters: {
        DocumentName: this.document.ref,
        Parameters: {
          instanceId: stepfunctions.JsonPath.array(stepfunctions.JsonPath.stringAt('$.instance.id')),
          taskToken: stepfunctions.JsonPath.array(stepfunctions.JsonPath.taskToken),
          runnerName: stepfunctions.JsonPath.array(parameters.runnerNamePath),
          runnerToken: stepfunctions.JsonPath.array(parameters.runnerTokenPath),
          labels: stepfunctions.JsonPath.array(this.labels.join(',')),
          registrationUrl: stepfunctions.JsonPath.array(parameters.registrationUrl),
        },
      },
      iamResources: ['*'],
    });

    return getAmi.next(fleet).next(runDocument);
  }

  grantStateMachine(stateMachineRole: iam.IGrantable) {
    stateMachineRole.grantPrincipal.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [this.role.roleArn],
      conditions: {
        StringEquals: {
          'iam:PassedToService': 'ec2.amazonaws.com',
        },
      },
    }));

    stateMachineRole.grantPrincipal.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['ec2:CreateTags', 'ec2:RunInstances'],
      resources: [
        cdk.Stack.of(this).formatArn({
          service: 'ec2',
          resource: '*',
        }),
        cdk.Stack.of(this).formatArn({
          service: 'ec2',
          account: '',
          resource: 'image/*',
        }),
      ],
    }));

    stateMachineRole.grantPrincipal.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['iam:CreateServiceLinkedRole'],
      resources: ['*'],
      conditions: {
        StringEquals: {
          'iam:AWSServiceName': 'spot.amazonaws.com',
        },
      },
    }));
  }

  status(statusFunctionRole: iam.IGrantable): IRunnerProviderStatus {
    statusFunctionRole.grantPrincipal.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['ec2:DescribeLaunchTemplateVersions'],
      resources: ['*'],
    }));

    return {
      type: this.constructor.name,
      labels: this.labels,
      securityGroups: this.securityGroups.map(sg => sg.securityGroupId),
      roleArn: this.role.roleArn,
      logGroup: this.logGroup.logGroupName,
      ami: {
        launchTemplate: this.ami.launchTemplate.launchTemplateId || 'unknown',
        amiBuilderLogGroup: this.ami.logGroup?.logGroupName,
      },
    };
  }

  /**
   * The network connections associated with this resource.
   */
  public get connections(): ec2.Connections {
    return new ec2.Connections({ securityGroups: this.securityGroups });
  }
}

