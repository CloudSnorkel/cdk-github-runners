import * as cdk from 'aws-cdk-lib';
import {
  Annotations,
  aws_codebuild as codebuild,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_events as events,
  aws_events_targets as events_targets,
  aws_iam as iam,
  aws_logs as logs,
  aws_s3_assets as s3_assets,
  CustomResource,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { ComputeType } from 'aws-cdk-lib/aws-codebuild';
import { TagMutability, TagStatus } from 'aws-cdk-lib/aws-ecr';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { defaultBaseDockerImage } from './aws-image-builder';
import { RunnerImageBuilderBase, RunnerImageBuilderProps } from './common';
import { BuildImageFunction } from '../../lambdas/build-image-function';
import { singletonLambda } from '../../utils';
import { Architecture, Os, RunnerAmi, RunnerImage, RunnerVersion } from '../common';


export interface CodeBuildRunnerImageBuilderProps {
  /**
   * The type of compute to use for this build.
   * See the {@link ComputeType} enum for the possible values.
   *
   * @default {@link ComputeType#SMALL}
   */
  readonly computeType?: codebuild.ComputeType;

  /**
   * Build image to use in CodeBuild. This is the image that's going to run the code that builds the runner image.
   *
   * The only action taken in CodeBuild is running `docker build`. You would therefore not need to change this setting often.
   *
   * @default Ubuntu 20.04 for x64 and Amazon Linux 2 for ARM64
   */
  readonly buildImage?: codebuild.IBuildImage;

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
 * @internal
 */
export class CodeBuildRunnerImageBuilder extends RunnerImageBuilderBase {
  private boundDockerImage?: RunnerImage;
  private readonly os: Os;
  private readonly architecture: Architecture;
  private readonly baseImage: string;
  private readonly logRetention: RetentionDays;
  private readonly logRemovalPolicy: RemovalPolicy;
  private readonly vpc: ec2.IVpc | undefined;
  private readonly securityGroups: ec2.ISecurityGroup[] | undefined;
  private readonly buildImage: codebuild.IBuildImage;
  private readonly repository: ecr.Repository;
  private readonly subnetSelection: ec2.SubnetSelection | undefined;
  private readonly timeout: cdk.Duration;
  private readonly computeType: codebuild.ComputeType;
  private readonly rebuildInterval: cdk.Duration;
  private readonly role: iam.Role;

  constructor(scope: Construct, id: string, props?: RunnerImageBuilderProps) {
    super(scope, id, props);

    if (props?.awsImageBuilderOptions) {
      Annotations.of(this).addWarning('awsImageBuilderOptions are ignored when using CodeBuild runner image builder.');
    }

    this.os = props?.os ?? Os.LINUX_UBUNTU;
    this.architecture = props?.architecture ?? Architecture.X86_64;
    this.rebuildInterval = props?.rebuildInterval ?? Duration.days(7);
    this.logRetention = props?.logRetention ?? RetentionDays.ONE_MONTH;
    this.logRemovalPolicy = props?.logRemovalPolicy ?? RemovalPolicy.DESTROY;
    this.vpc = props?.vpc;
    this.securityGroups = props?.securityGroups;
    this.subnetSelection = props?.subnetSelection;
    this.timeout = props?.codeBuildOptions?.timeout ?? Duration.hours(1);
    this.computeType = props?.codeBuildOptions?.computeType ?? ComputeType.SMALL;
    this.baseImage = props?.baseDockerImage ?? defaultBaseDockerImage(this.os);
    this.buildImage = props?.codeBuildOptions?.buildImage ?? this.getDefaultBuildImage();

    // warn against isolated networks
    if (props?.subnetSelection?.subnetType == ec2.SubnetType.PRIVATE_ISOLATED) {
      Annotations.of(this).addWarning('Private isolated subnets cannot pull from public ECR and VPC endpoint is not supported yet. ' +
        'See https://github.com/aws/containers-roadmap/issues/1160');
    }

    // create service role for CodeBuild
    this.role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });

    // create repository that only keeps one tag
    this.repository = new ecr.Repository(this, 'Repository', {
      imageScanOnPush: true,
      imageTagMutability: TagMutability.MUTABLE,
      removalPolicy: RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          description: 'Remove untagged images that have been replaced by CodeBuild',
          tagStatus: TagStatus.UNTAGGED,
          maxImageAge: Duration.days(1),
        },
      ],
    });
  }

  bindAmi(): RunnerAmi {
    throw new Error('CodeBuild image builder cannot be used to build AMI');
  }

  bindDockerImage(): RunnerImage {
    if (this.boundDockerImage) {
      return this.boundDockerImage;
    }

    // log group for the image builds
    const logGroup = new logs.LogGroup(
      this,
      'Logs',
      {
        retention: this.logRetention ?? RetentionDays.ONE_MONTH,
        removalPolicy: this.logRemovalPolicy ?? RemovalPolicy.DESTROY,
      },
    );

    // generate buildSpec
    const buildSpec = this.getBuildSpec(this.repository, logGroup);

    // create CodeBuild project that builds Dockerfile and pushes to repository
    const project = new codebuild.Project(this, 'CodeBuild', {
      description: `Build docker image for self-hosted GitHub runner ${this.node.path} (${this.os.name}/${this.architecture.name})`,
      buildSpec,
      vpc: this.vpc,
      securityGroups: this.securityGroups,
      subnetSelection: this.subnetSelection,
      role: this.role,
      timeout: this.timeout,
      environment: {
        buildImage: this.buildImage,
        computeType: this.computeType,
        privileged: true,
      },
      logging: {
        cloudWatch: {
          logGroup,
        },
      },
    });

    // permissions
    this.repository.grantPullPush(project);

    // call CodeBuild during deployment and delete all images from repository during destruction
    const cr = this.customResource(project, buildSpec.toBuildSpec());

    // rebuild image on a schedule
    this.rebuildImageOnSchedule(project, this.rebuildInterval);

    // return the image
    this.boundDockerImage = {
      imageRepository: ecr.Repository.fromRepositoryAttributes(this, 'Dependable Image', {
        // There are simpler ways to get name and ARN, but we want an image object that depends on the custom resource.
        // We want whoever is using this image to automatically wait for CodeBuild to start and finish through the custom resource.
        repositoryName: cr.getAttString('Name'),
        repositoryArn: cr.ref,
      }),
      imageTag: 'latest',
      architecture: this.architecture,
      os: this.os,
      logGroup,
      runnerVersion: RunnerVersion.specific('unknown'),
    };
    return this.boundDockerImage;
  }

  private getDefaultBuildImage(): codebuild.IBuildImage {
    if (this.os.is(Os.LINUX_UBUNTU) || this.os.is(Os.LINUX_AMAZON_2) || this.os.is(Os.LINUX)) {
      // CodeBuild just runs `docker build` so its OS doesn't really matter
      if (this.architecture.is(Architecture.X86_64)) {
        return codebuild.LinuxBuildImage.STANDARD_6_0;
      } else if (this.architecture.is(Architecture.ARM64)) {
        return codebuild.LinuxArmBuildImage.AMAZON_LINUX_2_STANDARD_2_0;
      }
    }
    if (this.os.is(Os.WINDOWS)) {
      throw new Error('CodeBuild cannot be used to build Windows Docker images https://github.com/docker-library/docker/issues/49');
    }

    throw new Error(`Unable to find CodeBuild image for ${this.os.name}/${this.architecture.name}`);
  }

  private getDockerfileGenerationCommands() {
    let commands = [];
    let dockerfile = `FROM ${this.baseImage}\nVOLUME /var/lib/docker\n`;

    for (let i = 0; i < this.components.length; i++) {
      const componentName = this.components[i].name;
      const assetDescriptors = this.components[i].getAssets(this.os, this.architecture);

      for (let j = 0; j < assetDescriptors.length; j++) {
        if (this.os.is(Os.WINDOWS)) {
          throw new Error("Can't add asset as we can't build Windows Docker images on CodeBuild");
        }

        const asset = new s3_assets.Asset(this, `Component ${i} ${componentName} Asset ${j}`, {
          path: assetDescriptors[j].source,
        });

        if (asset.isFile) {
          commands.push(`aws s3 cp ${asset.s3ObjectUrl} asset${i}-${componentName}-${j}`);
        } else if (asset.isZipArchive) {
          commands.push(`aws s3 cp ${asset.s3ObjectUrl} asset${i}-${componentName}-${j}.zip`);
          commands.push(`unzip asset${i}-${componentName}-${j}.zip -d "asset${i}-${componentName}-${j}"`);
        } else {
          throw new Error(`Unknown asset type: ${asset}`);
        }

        dockerfile += `COPY asset${i}-${componentName}-${j} ${assetDescriptors[j].target}\n`;

        asset.grantRead(this);
      }

      const componentCommands = this.components[i].getCommands(this.os, this.architecture);
      const script = '#!/bin/bash\nset -exuo pipefail\n' + componentCommands.join('\n');
      commands.push(`cat > component${i}-${componentName}.sh <<'EOFGITHUBRUNNERSDOCKERFILE'\n${script}\nEOFGITHUBRUNNERSDOCKERFILE`);
      commands.push(`chmod +x component${i}-${componentName}.sh`);
      dockerfile += `COPY component${i}-${componentName}.sh /tmp\n`;
      dockerfile += `RUN /tmp/component${i}-${componentName}.sh\n`;

      dockerfile += this.components[i].getDockerCommands(this.os, this.architecture).join('\n') + '\n';
    }

    commands.push(`cat > Dockerfile <<'EOFGITHUBRUNNERSDOCKERFILE'\n${dockerfile}\nEOFGITHUBRUNNERSDOCKERFILE`);

    return commands;
  }

  private getBuildSpec(repository: ecr.Repository, logGroup: logs.LogGroup): codebuild.BuildSpec {
    const thisStack = cdk.Stack.of(this);

    return codebuild.BuildSpec.fromObject({
      version: '0.2',
      env: {
        variables: {
          REPO_ARN: repository.repositoryArn,
          REPO_URI: repository.repositoryUri,
          STACK_ID: 'unspecified',
          REQUEST_ID: 'unspecified',
          LOGICAL_RESOURCE_ID: 'unspecified',
          RESPONSE_URL: 'unspecified',
        },
      },
      phases: {
        pre_build: {
          commands: [
            `aws ecr get-login-password --region "$AWS_DEFAULT_REGION" | docker login --username AWS --password-stdin ${thisStack.account}.dkr.ecr.${thisStack.region}.amazonaws.com`,
          ],
        },
        build: {
          commands: this.getDockerfileGenerationCommands().concat([
            'docker build . -t "$REPO_URI"',
            'docker push "$REPO_URI"',
          ]),
        },
        post_build: {
          commands: [
            'STATUS="SUCCESS"',
            'if [ $CODEBUILD_BUILD_SUCCEEDING -ne 1 ]; then STATUS="FAILED"; fi',
            'cat <<EOF > /tmp/payload.json\n' +
              '{\n' +
              '  "StackId": "$STACK_ID",\n' +
              '  "RequestId": "$REQUEST_ID",\n' +
              '  "LogicalResourceId": "$LOGICAL_RESOURCE_ID",\n' +
              '  "PhysicalResourceId": "$REPO_ARN",\n' +
              '  "Status": "$STATUS",\n' +
              `  "Reason": "See logs in ${logGroup.logGroupName}/$CODEBUILD_LOG_PATH (deploy again with \'cdk deploy -R\' or logRemovalPolicy=RemovalPolicy.RETAIN if they are already deleted)",\n` +
              `  "Data": {"Name": "${repository.repositoryName}"}\n` +
              '}\n' +
              'EOF',
            'if [ "$RESPONSE_URL" != "unspecified" ]; then jq . /tmp/payload.json; curl -fsSL -X PUT -H "Content-Type:" -d "@/tmp/payload.json" "$RESPONSE_URL"; fi',
          ],
        },
      },
    });
  }

  private customResource(project: codebuild.Project, buildSpec: string) {
    const crHandler = singletonLambda(BuildImageFunction, this, 'build-image', {
      description: 'Custom resource handler that triggers CodeBuild to build runner images, and cleans-up images on deletion',
      timeout: cdk.Duration.minutes(3),
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    const policy = new iam.Policy(this, 'CR Policy', {
      statements: [
        new iam.PolicyStatement({
          actions: ['codebuild:StartBuild'],
          resources: [project.projectArn],
        }),
        new iam.PolicyStatement({
          actions: ['ecr:BatchDeleteImage', 'ecr:ListImages'],
          resources: [this.repository.repositoryArn],
        }),
      ],
    });
    crHandler.role!.attachInlinePolicy(policy);

    const cr = new CustomResource(this, 'Builder', {
      serviceToken: crHandler.functionArn,
      resourceType: 'Custom::ImageBuilder',
      properties: {
        RepoName: this.repository.repositoryName,
        ProjectName: project.projectName,
        // We include the full buildSpec so the image is built immediately on changes, and we don't have to wait for its scheduled build.
        // This also helps make sure the changes are good. If they have a bug, the deployment will fail instead of just the scheduled build.
        BuildSpec: buildSpec,
      },
    });

    // add dependencies to make sure resources are there when we need them
    cr.node.addDependency(project);
    cr.node.addDependency(this.role);
    cr.node.addDependency(policy);
    cr.node.addDependency(crHandler.role!);
    cr.node.addDependency(crHandler);

    return cr;
  }

  private rebuildImageOnSchedule(project: codebuild.Project, rebuildInterval?: Duration) {
    rebuildInterval = rebuildInterval ?? Duration.days(7);
    if (rebuildInterval.toMilliseconds() != 0) {
      const scheduleRule = new events.Rule(this, 'Build Schedule', {
        description: `Rebuild runner image for ${this.repository.repositoryName}`,
        schedule: events.Schedule.rate(rebuildInterval),
      });
      scheduleRule.addTarget(new events_targets.CodeBuildProject(project));
    }
  }

  get connections(): ec2.Connections {
    return new ec2.Connections({
      securityGroups: this.securityGroups,
    });
  }

  get grantPrincipal(): iam.IPrincipal {
    return this.role;
  }
}
