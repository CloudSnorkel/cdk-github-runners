import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2, aws_events as events, aws_iam as iam, aws_imagebuilder as imagebuilder, aws_logs as logs, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Architecture, Os, RunnerAmi, RunnerImage, RunnerVersion } from '../../../providers';
import { ImageBuilderBaseProps, IRunnerImageBuilder, uniqueImageBuilderName } from '../../common';
import { ImageBuilderComponent } from '../builder';

/**
 * @internal
 */
export abstract class ImageBuilderBase extends Construct implements IRunnerImageBuilder {
  protected readonly architecture: Architecture;
  protected readonly os: Os;
  protected readonly platform: 'Windows' | 'Linux';

  protected readonly description: string;

  protected readonly runnerVersion: RunnerVersion;

  protected components: ImageBuilderComponent[] = [];

  private readonly vpc: ec2.IVpc;
  private readonly subnetId: string | undefined;
  private readonly securityGroups: ec2.ISecurityGroup[];
  private readonly instanceType: ec2.InstanceType;

  private readonly rebuildInterval: cdk.Duration;
  private readonly logRetention: logs.RetentionDays;
  private readonly logRemovalPolicy: cdk.RemovalPolicy;

  protected constructor(scope: Construct, id: string, props: ImageBuilderBaseProps) {
    super(scope, id);

    // arch
    this.architecture = props?.architecture ?? Architecture.X86_64;
    if (!this.architecture.isIn(props.supportedArchitectures)) {
      throw new Error(`Unsupported architecture: ${this.architecture.name}. Consider CodeBuild for faster image builds.`);
    }

    // os
    this.os = props?.os ?? Os.LINUX;
    if (!this.os.isIn(props.supportedOs)) {
      throw new Error(`Unsupported OS: ${this.os.name}.`);
    }

    // platform
    if (this.os.is(Os.WINDOWS)) {
      this.platform = 'Windows';
    } else if (this.os.isIn(Os._ALL_LINUX_VERSIONS)) {
      this.platform = 'Linux';
    } else {
      throw new Error(`Unsupported OS: ${this.os.name}.`);
    }

    // builder options
    this.rebuildInterval = props?.rebuildInterval ?? cdk.Duration.days(7);

    // vpc settings
    if (props?.vpc) {
      this.vpc = props.vpc;
      this.subnetId = props.vpc.selectSubnets(props.subnetSelection).subnetIds[0];
    } else {
      this.vpc = ec2.Vpc.fromLookup(this, 'Default VPC', { isDefault: true });
    }

    if (props?.securityGroups) {
      this.securityGroups = props.securityGroups;
    } else {
      this.securityGroups = [new ec2.SecurityGroup(this, 'SG', { vpc: this.vpc })];
    }

    // instance type
    this.instanceType = props?.instanceType ?? ec2.InstanceType.of(ec2.InstanceClass.M6I, ec2.InstanceSize.LARGE);
    if (!this.architecture.instanceTypeMatch(this.instanceType)) {
      throw new Error(`Builder architecture (${this.architecture.name}) doesn't match selected instance type (${this.instanceType} / ${this.instanceType.architecture})`);
    }

    // log settings
    this.logRetention = props?.logRetention ?? logs.RetentionDays.ONE_MONTH;
    this.logRemovalPolicy = props?.logRemovalPolicy ?? RemovalPolicy.DESTROY;

    // runner version
    this.runnerVersion = props?.runnerVersion ?? RunnerVersion.latest();

    // description
    this.description = `Build ${props.imageTypeName} for GitHub Actions runner ${this.node.path} (${this.os.name}/${this.architecture.name})`;
  }

  protected createLog(recipeName: string): logs.LogGroup {
    return new logs.LogGroup(this, 'Log', {
      logGroupName: `/aws/imagebuilder/${recipeName}`,
      retention: this.logRetention,
      removalPolicy: this.logRemovalPolicy,
    });
  }

  protected createInfrastructure(managedPolicies: iam.IManagedPolicy[]): imagebuilder.CfnInfrastructureConfiguration {
    let role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: managedPolicies,
    });

    for (const component of this.components) {
      component.grantAssetsRead(role);
    }

    return new imagebuilder.CfnInfrastructureConfiguration(this, 'Infrastructure', {
      name: uniqueImageBuilderName(this),
      description: this.description,
      subnetId: this.subnetId,
      securityGroupIds: this.securityGroups.map(sg => sg.securityGroupId),
      instanceTypes: [this.instanceType.toString()],
      instanceMetadataOptions: {
        httpTokens: 'required',
        // Container builds require a minimum of two hops.
        httpPutResponseHopLimit: 2,
      },
      instanceProfileName: new iam.CfnInstanceProfile(this, 'Instance Profile', {
        roles: [
          role.roleName,
        ],
      }).ref,
    });
  }

  protected createImage(infra: imagebuilder.CfnInfrastructureConfiguration, dist: imagebuilder.CfnDistributionConfiguration, log: logs.LogGroup,
    imageRecipeArn?: string, containerRecipeArn?: string): imagebuilder.CfnImage {
    const image = new imagebuilder.CfnImage(this, 'Image', {
      infrastructureConfigurationArn: infra.attrArn,
      distributionConfigurationArn: dist.attrArn,
      imageRecipeArn,
      containerRecipeArn,
      imageTestsConfiguration: {
        imageTestsEnabled: false,
      },
    });
    image.node.addDependency(infra);
    image.node.addDependency(log);

    return image;
  }

  protected createPipeline(infra: imagebuilder.CfnInfrastructureConfiguration, dist: imagebuilder.CfnDistributionConfiguration, log: logs.LogGroup,
    imageRecipeArn?: string, containerRecipeArn?: string): imagebuilder.CfnImagePipeline {
    let scheduleOptions: imagebuilder.CfnImagePipeline.ScheduleProperty | undefined;
    if (this.rebuildInterval.toDays() > 0) {
      scheduleOptions = {
        scheduleExpression: events.Schedule.rate(this.rebuildInterval).expressionString,
        pipelineExecutionStartCondition: 'EXPRESSION_MATCH_ONLY',
      };
    }
    const pipeline = new imagebuilder.CfnImagePipeline(this, 'Pipeline', {
      name: uniqueImageBuilderName(this),
      description: this.description,
      infrastructureConfigurationArn: infra.attrArn,
      distributionConfigurationArn: dist.attrArn,
      imageRecipeArn,
      containerRecipeArn,
      schedule: scheduleOptions,
      imageTestsConfiguration: {
        imageTestsEnabled: false,
      },
    });
    pipeline.node.addDependency(infra);
    pipeline.node.addDependency(log);

    return pipeline;
  }

  /**
   * The network connections associated with this resource.
   */
  public get connections(): ec2.Connections {
    return new ec2.Connections({ securityGroups: this.securityGroups });
  }

  abstract bindDockerImage(): RunnerImage;

  abstract bindAmi(): RunnerAmi;
}
