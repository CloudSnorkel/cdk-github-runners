import * as cdk from 'aws-cdk-lib';
import {
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_logs as logs,
  aws_stepfunctions as stepfunctions,
  RemovalPolicy,
  Stack,
} from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import {
  amiRootDevice,
  Architecture,
  BaseProvider,
  FamilyFragmentBranch,
  IRunnerProvider,
  IRunnerProviderStatus,
  Os,
  RunnerAmi,
  RunnerProviderProps,
  RunnerVersion,
  StorageOptions,
} from './common';
import {
  AwsImageBuilderRunnerImageBuilder,
  BaseImage,
  IRunnerImageBuilder,
  RunnerImageBuilder,
  RunnerImageBuilderProps,
  RunnerImageBuilderType,
  RunnerImageComponent,
} from '../image-builders';
import { isGpuInstanceType, MINIMAL_EC2_SSM_SESSION_MANAGER_POLICY_STATEMENT } from '../utils';

// this script is specifically made so `poweroff` is absolutely always called
// each `{}` is a variable coming from `params` below
const linuxUserDataTemplate = `#!/bin/bash
set -x -o pipefail

TASK_TOKEN="{}"
logGroupName="{}"
runnerNamePath="{}"
githubDomainPath="{}"
ownerPath="{}"
repoPath="{}"
runnerTokenPath="{}"
labels="{}"
registrationURL="{}"
runnerGroup1="{}"
runnerGroup2="{}"
defaultLabels="{}"

export AWS_RETRY_MODE=standard # better retry
touch /var/log/runner.log

heartbeat () {
  while true; do
    SPOT_ACTION=$(curl -s -f -H "X-aws-ec2-metadata-token: $(curl -s -f -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 1" 2>/dev/null)" "http://169.254.169.254/latest/meta-data/spot/instance-action" 2>/dev/null) || true
    if [ -n "$SPOT_ACTION" ]; then
      aws stepfunctions send-task-failure --task-token "$TASK_TOKEN" --error SpotInterrupted --cause "EC2 Spot instance interruption: $SPOT_ACTION" || true
      exit 0
    fi
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
  if [ "$(< /home/runner/RUNNER_VERSION)" = "latest" ]; then
    RUNNER_FLAGS=""
  else
    RUNNER_FLAGS="--disableupdate"
  fi

  labelsTemplate="$labels,cdkghr:started:$(date +%s)"

  # Execute the configuration command for runner registration
  sudo -Hu runner /home/runner/config.sh --unattended --url "$registrationURL" --token "$runnerTokenPath" --ephemeral --work _work --labels "$labelsTemplate" $RUNNER_FLAGS --name "$runnerNamePath" $runnerGroup1 $runnerGroup2 $defaultLabels || exit 1

  # Execute the run command
  sudo --preserve-env=AWS_REGION -Hu runner /home/runner/run.sh || exit 2

  # Retrieve the status
  STATUS=$(grep -Phors "finish job request for job [0-9a-f-]+ with result: .*" /home/runner/_diag/ | tail -n1 | awk '{print $NF}')

  # Check and print the job status
  [ -n "$STATUS" ] && echo CDKGHA JOB DONE "$labels" "$STATUS"
}
heartbeat &
if setup_logs && action |& tee /var/log/runner.log; then
  aws stepfunctions send-task-success --task-token "$TASK_TOKEN" --task-output '{"ok": true}' |& tee -a /var/log/runner.log
else
  aws stepfunctions send-task-failure --task-token "$TASK_TOKEN" --error Runner.Error.$? --cause "Check CloudWatch for full log -- $logGroupName/$runnerNamePath -- $(tail -n 1 /var/log/runner.log)" |& tee -a /var/log/runner.log
fi
sleep 10  # give cloudwatch agent its default 5 seconds buffer duration to upload logs
poweroff
`.replace(/{/g, '\\{').replace(/}/g, '\\}').replace(/\\{\\}/g, '{}');

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
$runnerGroup1="{}"
$runnerGroup2="{}"
$defaultLabels="{}"

$Env:AWS_RETRY_MODE = "standard"  # better retry

# EC2Launch only starts ssm agent after user data is done, so we need to start it ourselves (it is disabled by default)
Set-Service -StartupType Manual AmazonSSMAgent
Start-Service AmazonSSMAgent

$HeartbeatParentPid = $PID
Start-Job -ScriptBlock {
  while ($true) {
    try {
      $spot = Invoke-RestMethod -Uri "http://169.254.169.254/latest/meta-data/spot/instance-action" -Headers @{"X-aws-ec2-metadata-token"=(Invoke-RestMethod -Method PUT -Uri "http://169.254.169.254/latest/api/token" -Headers @{"X-aws-ec2-metadata-token-ttl-seconds"="1"} -TimeoutSec 2)} -TimeoutSec 2
      $spotJson = if ($spot -is [string]) { $spot } else { $spot | ConvertTo-Json -Compress }
      aws stepfunctions send-task-failure --task-token "$using:TASK_TOKEN" --error SpotInterrupted --cause "EC2 Spot instance interruption: $spotJson"
      break
    } catch {
    }
    aws stepfunctions send-task-heartbeat --task-token "$using:TASK_TOKEN"
    Start-Sleep -Seconds 60
  }
}
function setup_logs () {
  echo "{
    \`"logs\`": {
      \`"log_stream_name\`": \`"unknown\`",
      \`"logs_collected\`": {
        \`"files\`": {
         \`"collect_list\`": [
            {
              \`"file_path\`": \`"/actions/runner.log\`",
              \`"log_group_name\`": \`"$logGroupName\`",
              \`"log_stream_name\`": \`"$runnerNamePath\`",
              \`"timezone\`": \`"UTC\`"
            }
          ]
        }
      }
    }
  }" | Out-File -Encoding ASCII $Env:TEMP/log.conf
  & "C:/Program Files/Amazon/AmazonCloudWatchAgent/amazon-cloudwatch-agent-ctl.ps1" -a fetch-config -m ec2 -s -c file:$Env:TEMP/log.conf
}
function action () {
  cd /actions
  $RunnerVersion = Get-Content /actions/RUNNER_VERSION -Raw
  if ($RunnerVersion -eq "latest") { $RunnerFlags = "" } else { $RunnerFlags = "--disableupdate" }
  ./config.cmd --unattended --url "\${registrationUrl}" --token "\${runnerTokenPath}" --ephemeral --work _work --labels "\${labels},cdkghr:started:$(Get-Date -UFormat +%s)" $RunnerFlags --name "\${runnerNamePath}" \${runnerGroup1} \${runnerGroup2} \${defaultLabels} 2>&1 | Out-File -Encoding ASCII -Append /actions/runner.log

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
  aws stepfunctions send-task-success --task-token "$TASK_TOKEN" --task-output '{ }' 2>&1 | Out-File -Encoding ASCII -Append /actions/runner.log
} else {
  $lastLine = Get-Content -Path C:/actions/runner.log -Tail 1 -ErrorAction SilentlyContinue
  aws stepfunctions send-task-failure --task-token "$TASK_TOKEN" --error Runner.Error.$r --cause "Check CloudWatch for full log -- $logGroupName/$runnerNamePath -- $lastLine" 2>&1 | Out-File -Encoding ASCII -Append /actions/runner.log
}
Start-Sleep -Seconds 10  # give cloudwatch agent its default 5 seconds buffer duration to upload logs
Stop-Computer -ComputerName localhost -Force
</powershell>
`.replace(/{/g, '\\{').replace(/}/g, '\\}').replace(/\\{\\}/g, '{}');


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
   * GitHub Actions runner group name.
   *
   * If specified, the runner will be registered with this group name. Setting a runner group can help managing access to self-hosted runners. It
   * requires a paid GitHub account.
   *
   * The group must exist or the runner will not start.
   *
   * Users will still be able to trigger this runner with the correct labels. But the runner will only be able to run jobs from repos allowed to use the group.
   *
   * @default undefined
   */
  readonly group?: string;

  /**
   * Instance type for launched runner instances.
   *
   * For GPU instance types (g4dn, g5, p3, etc.), we automatically use a GPU base image (AWS Deep Learning AMI)
   * with NVIDIA drivers pre-installed. If you provide your own image builder, use
   * `baseAmi: BaseImage.fromGpuBase(os, architecture)` or another image preloaded with NVIDIA drivers, or use
   * an image component to install NVIDIA drivers.
   *
   * @default m6i.large
   */
  readonly instanceType?: ec2.InstanceType;

  /**
   * Size of volume available for launched runner instances. This modifies the boot volume size and doesn't add any additional volumes.
   *
   * @default 30GB
   */
  readonly storageSize?: cdk.Size;

  /**
   * Options for runner instance storage volume.
   */
  readonly storageOptions?: StorageOptions;

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
 * One ec2:runInstances state of the shared EC2 fragment. Mirrors the per-subnet CallAwsService states EC2
 * providers used to render, with all per-provider values read from `$.providerParams`. Each state launches in the
 * single subnet at `$.providerParams.subnet`; multiple subnets are expressed as a chain of fallback configs (see
 * {@link Ec2RunnerProvider._runnerConfig}).
 *
 * This state intentionally stays in JSONPath (not JSONata) so the user data template substitution keeps using the
 * exact States.Format() semantics (including `\{` escaping) the templates were written for. JSONPath can't omit
 * fields conditionally, which is why spot and on-demand providers get separate states instead of an optional
 * InstanceMarketOptions field.
 */
function ec2RunInstancesState(spot: boolean): any {
  const tags = [
    { 'Key': 'Name', 'Value.$': '$$.Execution.Name' },
    { 'Key': 'GitHubRunners:Provider', 'Value.$': '$.provider' },
    { 'Key': 'GitHubRunners:Repo', 'Value.$': "States.Format('{}/{}', $.owner, $.repo)" },
    { 'Key': 'GitHubRunners:Labels', 'Value.$': '$.labels' },
  ];

  return {
    Type: 'Task',
    Resource: `arn:${cdk.Aws.PARTITION}:states:::aws-sdk:ec2:runInstances.waitForTaskToken`,
    HeartbeatSeconds: 600,
    Parameters: {
      'LaunchTemplate': {
        'LaunchTemplateId.$': '$.providerParams.launchTemplateId',
      },
      'MinCount': 1,
      'MaxCount': 1,
      'InstanceType.$': '$.providerParams.instanceType',
      // both userdata templates are guaranteed in $.consts by _stateMachineConstants(); see
      // linuxUserDataTemplate above for the 12 substituted parameters
      'UserData.$': 'States.Base64Encode(States.Format(' +
        'States.ArrayGetItem(States.Array($.consts.ec2UserDataLinux, $.consts.ec2UserDataWindows), $.providerParams.userDataTemplateIdx), ' +
        '$$.Task.Token, $.providerParams.logGroupName, $$.Execution.Name, $.runner.domain, $.owner, $.repo, ' +
        '$.runner.token, $.labels, $.runner.registrationUrl, ' +
        '$.providerParams.group1, $.providerParams.group2, $.providerParams.defaultLabels))',
      'InstanceInitiatedShutdownBehavior': 'terminate',
      'IamInstanceProfile': {
        'Arn.$': '$.providerParams.instanceProfileArn',
      },
      'MetadataOptions': {
        HttpTokens: 'required',
      },
      'SecurityGroupIds.$': '$.providerParams.securityGroupIds',
      'SubnetId.$': '$.providerParams.subnet',
      'BlockDeviceMappings.$': '$.providerParams.blockDeviceMappings',
      ...spot ? { 'InstanceMarketOptions.$': '$.providerParams.instanceMarketOptions' } : {},
      'TagSpecifications': [
        { ResourceType: 'instance', Tags: tags },
        { ResourceType: 'volume', Tags: tags },
      ],
    },
  };
}

/**
 * GitHub Actions runner provider using EC2 to execute jobs.
 *
 * This construct is not meant to be used by itself. It should be passed in the providers property for GitHubRunners.
 */
export class Ec2RunnerProvider extends BaseProvider implements IRunnerProvider {
  /**
   * Static strings the shared EC2 fragments need at `$.consts`. Both userdata templates are always included
   * because the fragments reference both in States.Array() and select one by index at runtime.
   *
   * @internal
   */
  public static _stateMachineConstants(): Record<string, string> {
    return {
      ec2UserDataLinux: linuxUserDataTemplate,
      ec2UserDataWindows: windowsUserDataTemplate,
    };
  }

  /**
   * Shared state machine fragments that run any EC2 provider, reading per-provider configuration generated by
   * {@link _runnerConfig} from `$.providerParams`. Spot configs (recognized by InstanceMarketOptions) get a
   * separate state because JSONPath states can't render optional fields.
   *
   * @internal
   */
  public static _stateMachineFragments(scope: Construct): FamilyFragmentBranch[] {
    const family = stepfunctions.Condition.and(
      stepfunctions.Condition.isPresent('$.providerParams.family'),
      stepfunctions.Condition.stringEquals('$.providerParams.family', 'ec2'),
    );
    return [
      {
        condition: stepfunctions.Condition.and(family, stepfunctions.Condition.isPresent('$.providerParams.instanceMarketOptions')),
        chainable: new stepfunctions.CustomState(scope, 'EC2 Spot Runner', {
          stateJson: ec2RunInstancesState(true),
        }),
      },
      {
        condition: family,
        chainable: new stepfunctions.CustomState(scope, 'EC2 Runner', {
          stateJson: ec2RunInstancesState(false),
        }),
      },
    ];
  }

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
   *  * `RunnerImageComponent.cloudWatchAgent()`
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
        RunnerImageComponent.cloudWatchAgent(),
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

  /**
   * Runner families used by this provider.
   *
   * @internal
   */
  readonly _runnerFamilies: string[] = ['ec2'];

  private instanceProfile?: iam.CfnInstanceProfile;
  private rootDeviceResource?: cdk.CustomResource;
  private readonly group?: string;
  private readonly amiBuilder: IRunnerImageBuilder;
  private readonly ami: RunnerAmi;
  private readonly role: iam.Role;
  private readonly instanceType: ec2.InstanceType;
  private readonly storageSize: cdk.Size;
  private readonly storageOptions?: StorageOptions;
  private readonly spot: boolean;
  private readonly spotMaxPrice: string | undefined;
  private readonly vpc: ec2.IVpc;
  private readonly subnets: ec2.ISubnet[];
  private readonly securityGroups: ec2.ISecurityGroup[];
  private readonly defaultLabels: boolean;

  constructor(scope: Construct, id: string, props?: Ec2RunnerProviderProps) {
    super(scope, id, props);

    this.labels = props?.labels ?? ['ec2'];
    this.group = props?.group;
    this.vpc = props?.vpc ?? ec2.Vpc.fromLookup(this, 'Default VPC', { isDefault: true });
    this.securityGroups = props?.securityGroup ? [props.securityGroup] : (props?.securityGroups ?? [new ec2.SecurityGroup(this, 'SG', { vpc: this.vpc })]);
    this.subnets = props?.subnet ? [props.subnet] : this.vpc.selectSubnets(props?.subnetSelection).subnets;
    this.instanceType = props?.instanceType ?? ec2.InstanceType.of(ec2.InstanceClass.M6I, ec2.InstanceSize.LARGE);
    this.storageSize = props?.storageSize ?? cdk.Size.gibibytes(30); // 30 is the minimum for Windows
    this.storageOptions = props?.storageOptions;
    this.spot = props?.spot ?? false;
    this.spotMaxPrice = props?.spotMaxPrice;
    this.defaultLabels = props?.defaultLabels ?? true;

    if (this.subnets.length === 0) {
      cdk.Annotations.of(this).addError('At least one subnet is required');
    }

    const arch = this.instanceType.architecture === ec2.InstanceArchitecture.ARM_64 ? Architecture.ARM64 : Architecture.X86_64;

    this.amiBuilder = props?.imageBuilder ?? props?.amiBuilder ?? Ec2RunnerProvider.imageBuilder(this, 'Ami Builder', {
      vpc: props?.vpc,
      subnetSelection: props?.subnetSelection,
      securityGroups: this.securityGroups,
      baseAmi: isGpuInstanceType(this.instanceType) ? BaseImage.fromGpuBase(Os.LINUX_UBUNTU, arch) : undefined,
      architecture: arch,
      awsImageBuilderOptions: {
        instanceType: arch.is(Architecture.ARM64) ? ec2.InstanceType.of(ec2.InstanceClass.M6G, ec2.InstanceSize.LARGE) : undefined,
      },
    });
    this.ami = this.amiBuilder.bindAmi();

    if (this.amiBuilder instanceof AwsImageBuilderRunnerImageBuilder) {
      if (this.amiBuilder.storageSize && this.storageSize.toBytes() < this.amiBuilder.storageSize.toBytes()) {
        cdk.Annotations.of(this).addError(`Runner storage size (${this.storageSize.toGibibytes()} GiB) must be at least the same as the image builder storage size (${this.amiBuilder.storageSize.toGibibytes()} GiB)`);
      }
    }

    if (!this.ami.architecture.instanceTypeMatch(this.instanceType)) {
      cdk.Annotations.of(this).addError(`AMI architecture (${this.ami.architecture.name}) doesn't match runner instance type (${this.instanceType} / ${this.instanceType.architecture})`);
    }

    this.grantPrincipal = this.role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    });
    this.grantPrincipal.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['states:SendTaskFailure', 'states:SendTaskSuccess', 'states:SendTaskHeartbeat'],
      resources: ['*'], // no support for stateMachine.stateMachineArn but task tokens are very long and totally random so not the end of the world
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
  }

  private ec2InstanceProfile() {
    this.instanceProfile ??= new iam.CfnInstanceProfile(this, 'Instance Profile', {
      roles: [this.role.roleName],
    });
    return this.instanceProfile;
  }

  private amiRootDeviceResource() {
    if (!this.rootDeviceResource) {
      this.rootDeviceResource = amiRootDevice(this, this.ami.launchTemplate.launchTemplateId);
      this.rootDeviceResource.node.addDependency(this.amiBuilder);
    }
    return this.rootDeviceResource;
  }

  /**
   * @internal
   */
  _grantStateMachine(stateMachineRole: iam.IGrantable) {
    // we use ec2:RunInstances because we must
    // we can't use fleets because they don't let us override user data, security groups or even disk size
    // we can't use requestSpotInstances because it doesn't support launch templates, and it's deprecated
    // ec2:RunInstances also seemed like the only one to immediately return an error when spot capacity is not available
    stateMachineRole.grantPrincipal.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['ec2:runInstances'],
      resources: ['*'],
    }));

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

  /**
   * Runtime configuration for the shared EC2 fragment.
   *
   * ec2:RunInstances can only try one subnet at a time, so each subnet gets its own config and falls back to the
   * next subnet's config, exactly like the synthesized per-subnet state chain that EC2 providers used to render.
   *
   * @internal
   */
  _runnerConfig(): any {
    const base = {
      family: 'ec2',
      launchTemplateId: this.ami.launchTemplate.launchTemplateId,
      instanceType: this.instanceType.toString(),
      securityGroupIds: this.securityGroups.map(sg => sg.securityGroupId),
      instanceProfileArn: this.ec2InstanceProfile().attrArn,
      logGroupName: this.logGroup.logGroupName,
      // API-shaped (ec2:runInstances) so the fragment can splice these in as-is
      blockDeviceMappings: [{
        DeviceName: this.amiRootDeviceResource().ref,
        Ebs: {
          DeleteOnTermination: true,
          VolumeSize: this.storageSize.toGibibytes(),
          VolumeType: this.storageOptions?.volumeType,
          Iops: this.storageOptions?.iops,
          Throughput: this.storageOptions?.throughput,
        },
      }],
      instanceMarketOptions: this.spot ? {
        MarketType: 'spot',
        SpotOptions: {
          MaxPrice: this.spotMaxPrice,
          SpotInstanceType: 'one-time',
        },
      } : undefined,
      // index into States.Array($.consts.ec2UserDataLinux, $.consts.ec2UserDataWindows)
      userDataTemplateIdx: this.ami.os.is(Os.WINDOWS) ? 1 : 0,
      group1: this.group ? '--runnergroup' : '',
      group2: this.group ? this.group : '',
      defaultLabels: this.defaultLabels ? '' : '--no-default-labels',
    };

    let config: any = undefined;
    for (let i = this.subnets.length - 1; i >= 0; i--) {
      config = {
        ...base,
        subnet: this.subnets[i].subnetId,
        ...config ? { fallback: config } : {},
      };
    }
    return config;
  }

  /**
   * @internal
   */
  _status(statusFunctionRole: iam.IGrantable): IRunnerProviderStatus {
    statusFunctionRole.grantPrincipal.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ['ec2:DescribeLaunchTemplateVersions'],
      resources: ['*'],
    }));

    return {
      type: this.constructor.name,
      labels: this.labels,
      constructPath: this.node.path,
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

/**
 * @deprecated use {@link Ec2RunnerProvider}
 */
export class Ec2Runner extends Ec2RunnerProvider {
}

