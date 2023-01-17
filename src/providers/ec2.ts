import * as cdk from 'aws-cdk-lib';
import {
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_logs as logs,
  aws_stepfunctions as stepfunctions,
  aws_stepfunctions_tasks as stepfunctions_tasks,
  Duration,
  RemovalPolicy,
  Stack,
} from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IntegrationPattern } from 'aws-cdk-lib/aws-stepfunctions';
import { Construct } from 'constructs';
import {
  BaseProvider,
  IAmiBuilder,
  IRunnerProvider,
  IRunnerProviderStatus,
  Os,
  RunnerAmi,
  RunnerProviderProps,
  RunnerRuntimeParameters,
  RunnerVersion,
} from './common';
import { AmiBuilder } from './image-builders/ami';

// this script is specifically made so `poweroff` is absolutely always called
// each `{}` is a variable coming from `params` below
const linuxUserDataTemplate = `#!/bin/bash -x
TASK_TOKEN="{}"
heartbeat () {
  while true; do
    aws stepfunctions send-task-heartbeat --task-token "$TASK_TOKEN"
    sleep 60
  done
}
setup_logs () {
  cat <<EOF > /tmp/log.conf || exit 1
  {
    "logs": {
      "log_stream_name": "unknown",
      "logs_collected": {
        "files": {
          "collect_list": [
            {
              "file_path": "/var/log/runner.log",
              "log_group_name": "{}",
              "log_stream_name": "{}",
              "timezone": "UTC"
            }
          ]
        }
      }
    }
  }
EOF
  /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/tmp/log.conf || exit 2
}
action () {
  sudo -Hu runner /home/runner/config.sh --unattended --url "https://{}/{}/{}" --token "{}" --ephemeral --work _work --labels "{}" {} --name "{}" || exit 1
  sudo --preserve-env=AWS_REGION -Hu runner /home/runner/run.sh || exit 2
}
heartbeat &
if setup_logs && action | tee /var/log/runner.log 2>&1; then
  aws stepfunctions send-task-success --task-token "$TASK_TOKEN" --task-output '{"ok": true}'
else
  aws stepfunctions send-task-failure --task-token "$TASK_TOKEN"
fi
poweroff
`.replace(/{/g, '\\{').replace(/}/g, '\\}').replace(/\\{\\}/g, '{}');

// this script is specifically made so `poweroff` is absolutely always called
// each `{}` is a variable coming from `params` below and their order should match the linux script
const windowsUserDataTemplate = `<powershell>
$TASK_TOKEN = "{}"
Start-Job -ScriptBlock {
  while (1) {
    aws stepfunctions send-task-heartbeat --task-token "$using:TASK_TOKEN"
    sleep 60
  }
}
function setup_logs () {
  echo '{
    "logs": {
      "log_stream_name": "unknown",
      "logs_collected": {
        "files": {
         "collect_list": [
            {
              "file_path": "/actions/runner.log",
              "log_group_name": "{}",
              "log_stream_name": "{}",
              "timezone": "UTC"
            }
          ]
        }
      }
    }
  }' | Out-File -Encoding ASCII $Env:TEMP/log.conf
  & "C:/Program Files/Amazon/AmazonCloudWatchAgent/amazon-cloudwatch-agent-ctl.ps1" -a fetch-config -m ec2 -s -c file:$Env:TEMP/log.conf
}
function action () {
  cd /actions
  ./config.cmd --unattended --url "https://{}/{}/{}" --token "{}" --ephemeral --work _work --labels "{}" {} --name "{}" 2>&1 | Out-File -Encoding ASCII -Append /actions/runner.log
  if ($LASTEXITCODE -ne 0) { return 1 }
  ./run.cmd 2>&1 | Out-File -Encoding ASCII -Append /actions/runner.log
  if ($LASTEXITCODE -ne 0) { return 2 }
  return 0
}
setup_logs
$r = action
if ($r -eq 0) {
  aws stepfunctions send-task-success --task-token "$TASK_TOKEN" --task-output '{ }'
} else {
  aws stepfunctions send-task-failure --task-token "$TASK_TOKEN"
}
Stop-Computer -ComputerName localhost -Force
</powershell>
`.replace(/{/g, '\\{').replace(/}/g, '\\}').replace(/\\{\\}/g, '{}');


/**
 * Properties for {@link Ec2Runner} construct.
 */
export interface Ec2RunnerProps extends RunnerProviderProps {
  /**
   * AMI builder that creates AMIs with GitHub runner pre-configured. On Linux, a user named `runner` is expected to exist with access to Docker.
   *
   * @default AMI builder for Ubuntu Linux on the same subnet as configured by {@link vpc} and {@link subnetSelection}
   */
  readonly amiBuilder?: IAmiBuilder;

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
export class Ec2Runner extends BaseProvider implements IRunnerProvider {
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

  private readonly ami: RunnerAmi;
  private readonly role: iam.Role;
  private readonly instanceType: ec2.InstanceType;
  private readonly storageSize: cdk.Size;
  private readonly spot: boolean;
  private readonly spotMaxPrice: string | undefined;
  private readonly vpc: ec2.IVpc;
  private readonly subnets: ec2.ISubnet[];
  private readonly securityGroups: ec2.ISecurityGroup[];

  constructor(scope: Construct, id: string, props?: Ec2RunnerProps) {
    super(scope, id, props);

    this.labels = props?.labels ?? ['ec2'];
    this.vpc = props?.vpc ?? ec2.Vpc.fromLookup(this, 'Default VPC', { isDefault: true });
    this.securityGroups = props?.securityGroup ? [props.securityGroup] : (props?.securityGroups ?? [new ec2.SecurityGroup(this, 'SG', { vpc: this.vpc })]);
    this.subnets = props?.subnet ? [props.subnet] : this.vpc.selectSubnets(props?.subnetSelection).subnets;
    this.instanceType = props?.instanceType ?? ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.LARGE);
    this.storageSize = props?.storageSize ?? cdk.Size.gibibytes(30); // 30 is the minimum for Windows
    this.spot = props?.spot ?? false;
    this.spotMaxPrice = props?.spotMaxPrice;

    const amiBuilder = props?.amiBuilder ?? new AmiBuilder(this, 'Image Builder', {
      vpc: props?.vpc,
      subnetSelection: props?.subnetSelection,
      securityGroups: this.securityGroups,
    });
    this.ami = amiBuilder.bind();

    if (!this.ami.architecture.instanceTypeMatch(this.instanceType)) {
      throw new Error(`AMI architecture (${this.ami.architecture.name}) doesn't match runner instance type (${this.instanceType} / ${this.instanceType.architecture})`);
    }

    this.grantPrincipal = this.role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });
    this.grantPrincipal.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['states:SendTaskFailure', 'states:SendTaskSuccess', 'states:SendTaskHeartbeat'],
      resources: ['*'], // no support for stateMachine.stateMachineArn :(
    }));

    this.logGroup = new logs.LogGroup(
      this,
      'Logs',
      {
        retention: props?.logRetention ?? RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      },
    );
    this.logGroup.grantWrite(this);
  }

  /**
   * Generate step function task(s) to start a new runner.
   *
   * Called by GithubRunners and shouldn't be called manually.
   *
   * @param parameters workflow job details
   */
  getStepFunctionTask(parameters: RunnerRuntimeParameters): stepfunctions.IChainable {
    // we need to build user data in two steps because passing the template as the first parameter to stepfunctions.JsonPath.format fails on syntax

    const params = [
      stepfunctions.JsonPath.taskToken,
      this.logGroup.logGroupName,
      parameters.runnerNamePath,
      parameters.githubDomainPath,
      parameters.ownerPath,
      parameters.repoPath,
      parameters.runnerTokenPath,
      this.labels.join(','),
      this.ami.runnerVersion.is(RunnerVersion.latest()) ? '' : '--disableupdate',
      parameters.runnerNamePath,
    ];

    const passUserData = new stepfunctions.Pass(this, `${this.labels.join(', ')} data`, {
      parameters: {
        userdataTemplate: this.ami.os.is(Os.WINDOWS) ? windowsUserDataTemplate : linuxUserDataTemplate,
      },
      resultPath: stepfunctions.JsonPath.stringAt('$.ec2'),
    });

    // we use ec2:RunInstances because we must
    // we can't use fleets because they don't let us override user data, security groups or even disk size
    // we can't use requestSpotInstances because it doesn't support launch templates, and it's deprecated
    // ec2:RunInstances also seemed like the only one to immediately return an error when spot capacity is not available

    // we build a complicated chain of states here because ec2:RunInstances can only try one subnet at a time
    // if someone can figure out a good way to use Map for this, please open a PR

    // build a state for each subnet we want to try
    const instanceProfile = new iam.CfnInstanceProfile(this, 'Instance Profile', {
      roles: [this.role.roleName],
    });
    const subnetRunners = this.subnets.map((subnet, index) => {
      return new stepfunctions_tasks.CallAwsService(this, `${this.labels.join(', ')} subnet${index+1}`, {
        comment: subnet.subnetId,
        integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
        service: 'ec2',
        action: 'runInstances',
        heartbeat: Duration.minutes(10),
        parameters: {
          LaunchTemplate: {
            LaunchTemplateId: this.ami.launchTemplate.launchTemplateId,
          },
          MinCount: 1,
          MaxCount: 1,
          InstanceType: this.instanceType.toString(),
          UserData: stepfunctions.JsonPath.base64Encode(
            stepfunctions.JsonPath.format(
              stepfunctions.JsonPath.stringAt('$.ec2.userdataTemplate'),
              ...params,
            ),
          ),
          InstanceInitiatedShutdownBehavior: ec2.InstanceInitiatedShutdownBehavior.TERMINATE,
          IamInstanceProfile: {
            Arn: instanceProfile.attrArn,
          },
          MetadataOptions: {
            HttpTokens: 'required',
          },
          SecurityGroupIds: this.securityGroups.map(sg => sg.securityGroupId),
          SubnetId: subnet.subnetId,
          BlockDeviceMappings: [{
            DeviceName: '/dev/sda1',
            Ebs: {
              DeleteOnTermination: true,
              VolumeSize: this.storageSize.toGibibytes(),
            },
          }],
          InstanceMarketOptions: this.spot ? {
            MarketType: 'spot',
            SpotOptions: {
              MaxPrice: this.spotMaxPrice,
              SpotInstanceType: 'one-time',
            },
          } : undefined,
        },
        iamResources: ['*'],
      });
    });

    // use Parallel, so we can easily retry this whole block on failure (only 1 branch)
    const subnetIterator = new stepfunctions.Parallel(this, `${this.labels.join(', ')} subnet iterator`);

    // start with the first subnet
    subnetIterator.branch(subnetRunners[0]);

    // chain up the rest of the subnets
    for (let i = 1; i < subnetRunners.length; i++) {
      subnetRunners[i-1].addCatch(subnetRunners[i], {
        errors: ['Ec2.Ec2Exception', 'States.Timeout'],
        resultPath: stepfunctions.JsonPath.stringAt('$.lastSubnetError'),
      });
    }

    // jump to the end state of the Parallel block when execution a runner succeeds
    const subnetIterationDone = new stepfunctions.Succeed(this, `${this.labels.join(', ')} success`);
    for (const runner of subnetRunners) {
      runner.next(subnetIterationDone);
    }

    // retry the whole Parallel block if (only the last state) failed with an Ec2Exception or timed out
    this.addRetry(subnetIterator, ['Ec2.Ec2Exception', 'States.Timeout']);

    // return Parallel block
    return passUserData.next(subnetIterator);
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
      actions: ['ec2:createTags'],
      resources: [Stack.of(this).formatArn({
        service: 'ec2',
        resource: '*',
      })],
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
