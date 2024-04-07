// TODO do we really need a separate ec2 and fleet provider?

import { CreateFleetCommandInput } from '@aws-sdk/client-ec2';
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

// this script is specifically made so `poweroff` is absolutely always called
const linuxUserDataTemplate = `#!/bin/bash -x
IMDS_TOKEN=\`curl -sX PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60"\`
TASK_TOKEN=\`curl -sH "X-aws-ec2-metadata-token: $IMDS_TOKEN" http://169.254.169.254/latest/meta-data/tags/instance/GitHubRunners:args:taskToken\`
logGroupName=\`curl -sH "X-aws-ec2-metadata-token: $IMDS_TOKEN" http://169.254.169.254/latest/meta-data/tags/instance/GitHubRunners:args:logGroupName\`
runnerNamePath=\`curl -sH "X-aws-ec2-metadata-token: $IMDS_TOKEN" http://169.254.169.254/latest/meta-data/tags/instance/GitHubRunners:args:runnerNamePath\`
githubDomainPath=\`curl -sH "X-aws-ec2-metadata-token: $IMDS_TOKEN" http://169.254.169.254/latest/meta-data/tags/instance/GitHubRunners:args:githubDomainPath\`
ownerPath=\`curl -sH "X-aws-ec2-metadata-token: $IMDS_TOKEN" http://169.254.169.254/latest/meta-data/tags/instance/GitHubRunners:args:ownerPath\`
repoPath=\`curl -sH "X-aws-ec2-metadata-token: $IMDS_TOKEN" http://169.254.169.254/latest/meta-data/tags/instance/GitHubRunners:args:repoPath\`
runnerTokenPath=\`curl -sH "X-aws-ec2-metadata-token: $IMDS_TOKEN" http://169.254.169.254/latest/meta-data/tags/instance/GitHubRunners:args:runnerTokenPath\`
labels=\`curl -sH "X-aws-ec2-metadata-token: $IMDS_TOKEN" http://169.254.169.254/latest/meta-data/tags/instance/GitHubRunners:args:labels\`
registrationURL=\`curl -sH "X-aws-ec2-metadata-token: $IMDS_TOKEN" http://169.254.169.254/latest/meta-data/tags/instance/GitHubRunners:args:registrationURL\`
unset IMDS_TOKEN

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
              "log_group_name": "$logGroupName",
              "log_stream_name": "$runnerNamePath",
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
  # Determine the value of RUNNER_FLAGS
  if [ "$(< RUNNER_VERSION)" = "latest" ]; then
    RUNNER_FLAGS=""
  else
    RUNNER_FLAGS="--disableupdate"
  fi

  labelsTemplate="$labels,cdkghr:started:$(date +%s)"

  # Execute the configuration command for runner registration
  sudo -Hu runner /home/runner/config.sh --unattended --url "$registrationURL" --token "$runnerTokenPath" --ephemeral --work _work --labels "$labelsTemplate" $RUNNER_FLAGS --name "$runnerNamePath" || exit 1

  # Execute the run command
  sudo --preserve-env=AWS_REGION -Hu runner /home/runner/run.sh || exit 2

  # Retrieve the status
  STATUS=$(grep -Phors "finish job request for job [0-9a-f\\-]+ with result: \K.*" /home/runner/_diag/ | tail -n1)

  # Check and print the job status
  [ -n "$STATUS" ] && echo CDKGHA JOB DONE "$labels" "$STATUS"
}
heartbeat &
if setup_logs && action | tee /var/log/runner.log 2>&1; then
  aws stepfunctions send-task-success --task-token "$TASK_TOKEN" --task-output '{"ok": true}'
else
  aws stepfunctions send-task-failure --task-token "$TASK_TOKEN"
fi
sleep 10  # give cloudwatch agent its default 5 seconds buffer duration to upload logs
poweroff`;

// this script is specifically made so `poweroff` is absolutely always called
// each `{}` is a variable coming from `params` below and their order should match the linux script
const windowsUserDataTemplate = `<powershell>
$TASK_TOKEN = "{}"
$logGroupName="{}"
$runnerNamePath="{}"
$githubDomainPath="{}"
$ownerPath="{}"
$repoPath="{}"
$runnerTokenPath="{}"
$labels="{}"
$registrationURL="{}"

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
              "log_group_name": "$logGroupName",
              "log_stream_name": "$runnerNamePath",
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
  $RunnerVersion = Get-Content RUNNER_VERSION -Raw
  if ($RunnerVersion -eq "latest") { $RunnerFlags = "" } else { $RunnerFlags = "--disableupdate" }
  ./config.cmd --unattended --url "\${registrationUrl}" --token "\${runnerTokenPath}" --ephemeral --work _work --labels "\${labels},cdkghr:started:$(Get-Date -UFormat +%s)" $RunnerFlags --name "\${runnerNamePath}" 2>&1 | Out-File -Encoding ASCII -Append /actions/runner.log

  if ($LASTEXITCODE -ne 0) { return 1 }
  ./run.cmd 2>&1 | Out-File -Encoding ASCII -Append /actions/runner.log
  if ($LASTEXITCODE -ne 0) { return 2 }

  $STATUS = Select-String -Path './_diag/*.log' -Pattern 'finish job request for job [0-9a-f\\-]+ with result: (.*)' | %{$_.Matches.Groups[1].Value} | Select-Object -Last 1

  if ($STATUS) {
      echo "CDKGHA JOB DONE \${labels} $STATUS" | Out-File -Encoding ASCII -Append /actions/runner.log
  }

  return 0

}
setup_logs
$r = action
if ($r -eq 0) {
  aws stepfunctions send-task-success --task-token "$TASK_TOKEN" --task-output '{ }'
} else {
  aws stepfunctions send-task-failure --task-token "$TASK_TOKEN"
}
Start-Sleep -Seconds 10  # give cloudwatch agent its default 5 seconds buffer duration to upload logs
Stop-Computer -ComputerName localhost -Force
</powershell>
`.replace(/{/g, '\\{').replace(/}/g, '\\}').replace(/\\{\\}/g, '{}');


/**
 * Properties for {@link Ec2RunnerProvider} construct.
 */
export interface Ec2FleetRunnerProviderProps extends RunnerProviderProps {
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
export class Ec2FleetRunnerProvider extends BaseProvider implements IRunnerProvider {
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

  constructor(scope: Construct, id: string, props?: Ec2FleetRunnerProviderProps) {
    super(scope, id, props);

    this.labels = props?.labels ?? ['ec2'];
    this.vpc = props?.vpc ?? ec2.Vpc.fromLookup(this, 'Default VPC', { isDefault: true });
    this.securityGroups = props?.securityGroup ? [props.securityGroup] : (props?.securityGroups ?? [new ec2.SecurityGroup(this, 'SG', { vpc: this.vpc })]);
    this.subnets = props?.subnet ? [props.subnet] : this.vpc.selectSubnets(props?.subnetSelection).subnets;
    this.instanceType = props?.instanceType ?? ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.LARGE);
    this.storageSize = props?.storageSize ?? cdk.Size.gibibytes(30); // 30 is the minimum for Windows
    this.spot = props?.spot ?? false;
    this.spotMaxPrice = props?.spotMaxPrice;

    this.grantPrincipal = this.role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });
    this.grantPrincipal.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['states:SendTaskFailure', 'states:SendTaskSuccess', 'states:SendTaskHeartbeat'],
      resources: ['*'], // no support for stateMachine.stateMachineArn :(
      conditions: {
        StringEquals: {
          'aws:ResourceTag/aws:cloudformation:stack-id': cdk.Stack.of(this).stackId,
        },
      },
    }));
    this.grantPrincipal.addToPrincipalPolicy(MINIMAL_EC2_SSM_SESSION_MANAGER_POLICY_STATEMENT);

    this.logGroup = new logs.LogGroup(
      this,
      'Logs',
      {
        retention: props?.logRetention ?? RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      },
    );
    this.logGroup.grantWrite(this);

    // TODO FML
    // const rootDeviceResource = amiRootDevice(this, this.ami.launchTemplate.launchTemplateId);
    // rootDeviceResource.node.addDependency(this.amiBuilder);

    this.launchTemplate = new ec2.LaunchTemplate(this, 'Launch Template', {
      instanceType: props?.instanceType ?? ec2.InstanceType.of(ec2.InstanceClass.M5, ec2.InstanceSize.LARGE),
      role: this.role,
      userData: ec2.UserData.custom(linuxUserDataTemplate),
      instanceInitiatedShutdownBehavior: ec2.InstanceInitiatedShutdownBehavior.TERMINATE,
      requireImdsv2: true,
      instanceMetadataTags: true,
      blockDevices: [{
        deviceName: '/dev/sda1', // TODO rootDeviceResource.ref,
        volume: ec2.BlockDeviceVolume.ebs(this.storageSize.toGibibytes()),
      }],
      spotOptions: this.spot ? {
        requestType: ec2.SpotRequestType.ONE_TIME,
        maxPrice: this.spotMaxPrice ? Number(this.spotMaxPrice) : undefined, // TODO prop should be number
      } : undefined,
    });

    this.securityGroups.map(sg => this.launchTemplate.addSecurityGroup(sg));

    this.amiBuilder = props?.imageBuilder ?? props?.amiBuilder ?? Ec2FleetRunnerProvider.imageBuilder(this, 'Ami Builder', {
      vpc: props?.vpc,
      subnetSelection: props?.subnetSelection,
      securityGroups: this.securityGroups,
    });
    this.ami = this.amiBuilder.bindAmi({ launchTemplate: this.launchTemplate });

    // TODO using an existing image builder will not update the launch template on deploy -- make AWS::ImageBuilder::Image get new id on adding launch templates (or changing them?)

    if (!this.ami.architecture.instanceTypeMatch(this.instanceType)) {
      throw new Error(`AMI architecture (${this.ami.architecture.name}) doesn't match runner instance type (${this.instanceType} / ${this.instanceType.architecture})`);
    }
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
    const subnetRunners = this.subnets.map((subnet, index) => {
      return new stepfunctions_tasks.CallAwsService(this, `${this.labels.join(', ')} subnet${index+1}`, {
        comment: subnet.subnetId,
        integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
        service: 'ec2',
        action: 'createFleet',
        heartbeatTimeout: stepfunctions.Timeout.duration(Duration.minutes(10)),
        // TODO somehow create launch template with security group, profile, user data, tags in imds, etc.
        parameters: <CreateFleetCommandInput>{
          TargetCapacitySpecification: {
            TotalTargetCapacity: 1,
            // TargetCapacityUnitType: 'units',
            DefaultTargetCapacityType: this.spot ? 'spot' : 'on-demand',
          },
          LaunchTemplateConfigs: [
            // TODO let user specify these
            {
              LaunchTemplateSpecification: {
                LaunchTemplateId: this.launchTemplate.launchTemplateId,
                Version: '$Latest', // TODO latest or default? -- latest for last created by cdk, default for last created by image builder
              },
              Overrides: [
                {
                  SubnetId: subnet.subnetId,
                  // TODO AMI from image builder launch template ImageId: this.ami.launchTemplate.imageId,
                  ImageId: 'ami-049d60fa777700d2b',
                },
              ],
              // TODO Overrides
            },
          ],
          Type: 'instant',
          TagSpecifications: [
            {
              ResourceType: 'instance',
              Tags: [
                {
                  Key: 'GitHubRunners:args:taskToken',
                  // TODO Tag value exceeds the maximum length of 256 characters (Service: Ec2, Status Code: 400, Request ID: a60d7844-a5ae-49d2-aeeb-d36df39cf0fc)
                  // Value: stepfunctions.JsonPath.taskToken,
                  Value: 'nope',
                },
                {
                  Key: 'GitHubRunners:args:logGroupName',
                  Value: this.logGroup.logGroupName,
                },
                {
                  Key: 'GitHubRunners:args:runnerNamePath',
                  Value: parameters.runnerNamePath,
                },
                {
                  Key: 'GitHubRunners:args:githubDomainPath',
                  Value: parameters.githubDomainPath,
                },
                {
                  Key: 'GitHubRunners:args:ownerPath',
                  Value: parameters.ownerPath,
                },
                {
                  Key: 'GitHubRunners:args:repoPath',
                  Value: parameters.repoPath,
                },
                {
                  Key: 'GitHubRunners:args:runnerTokenPath',
                  Value: parameters.runnerTokenPath,
                },
                {
                  Key: 'GitHubRunners:args:labels',
                  Value: this.labels.join(','),
                },
                {
                  Key: 'GitHubRunners:args:registrationURL',
                  Value: parameters.registrationUrl,
                },
              ],
            },
          ],
        },
        iamResources: ['*'],
      });
    });

    // start with the first subnet
    passUserData.next(subnetRunners[0]);

    // chain up the rest of the subnets
    for (let i = 1; i < subnetRunners.length; i++) {
      subnetRunners[i-1].addCatch(subnetRunners[i], {
        errors: ['Ec2.Ec2Exception', 'States.Timeout'],
        resultPath: stepfunctions.JsonPath.stringAt('$.lastSubnetError'),
      });
    }

    return passUserData;
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

