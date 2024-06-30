import * as crypto from 'crypto';
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
import { BuildImageFunction } from './build-image-function';
import { IRunnerImageBuilder } from './common';
import { Architecture, Os, RunnerAmi, RunnerImage, RunnerVersion } from '../providers';
import { singletonLambda } from '../utils';

/*
AWS Image Builder was not used because:
  1. It's too slow. It has weird 15 minutes overhead where it seems to just be waiting.
  2. No easy log visibility.
  3. Versions need to be bumped manually.
 */

/**
 * Properties for CodeBuildImageBuilder construct.
 */
export interface CodeBuildImageBuilderProps {
  /**
   * Image architecture.
   *
   * @default Architecture.X86_64
   */
  readonly architecture?: Architecture;

  /**
   * Image OS.
   *
   * @default OS.LINUX
   */
  readonly os?: Os;

  /**
   * Path to Dockerfile to be built. It can be a path to a Dockerfile, a folder containing a Dockerfile, or a zip file containing a Dockerfile.
   */
  readonly dockerfilePath: string;

  /**
   * Version of GitHub Runners to install.
   *
   * @default latest version available
   */
  readonly runnerVersion?: RunnerVersion;

  /**
   * Schedule the image to be rebuilt every given interval. Useful for keeping the image up-do-date with the latest GitHub runner version and latest OS updates.
   *
   * Set to zero to disable.
   *
   * @default Duration.days(7)
   */
  readonly rebuildInterval?: Duration;

  /**
   * VPC to build the image in.
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
   * Build image to use in CodeBuild. This is the image that's going to run the code that builds the runner image.
   *
   * The only action taken in CodeBuild is running `docker build`. You would therefore not need to change this setting often.
   *
   * @default Ubuntu 22.04 for x64 and Amazon Linux 2 for ARM64
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

  /**
   * The number of days log events are kept in CloudWatch Logs. When updating
   * this property, unsetting it doesn't remove the log retention policy. To
   * remove the retention policy, set the value to `INFINITE`.
   *
   * @default logs.RetentionDays.ONE_MONTH
   */
  readonly logRetention?: logs.RetentionDays;

  /**
   * Removal policy for logs of image builds. If deployment fails on the custom resource, try setting this to `RemovalPolicy.RETAIN`. This way the CodeBuild logs can still be viewed, and you can see why the build failed.
   *
   * We try to not leave anything behind when removed. But sometimes a log staying behind is useful.
   *
   * @default RemovalPolicy.DESTROY
   */
  readonly logRemovalPolicy?: RemovalPolicy;
}

/**
 * An image builder that uses CodeBuild to build Docker images pre-baked with all the GitHub Actions runner requirements. Builders can be used with runner providers.
 *
 * Each builder re-runs automatically at a set interval to make sure the images contain the latest versions of everything.
 *
 * You can create an instance of this construct to customize the image used to spin-up runners. Each provider has its own requirements for what an image should do. That's why they each provide their own Dockerfile.
 *
 * For example, to set a specific runner version, rebuild the image every 2 weeks, and add a few packages for the Fargate provider, use:
 *
 * ```
 * const builder = new CodeBuildImageBuilder(this, 'Builder', {
 *     dockerfilePath: FargateRunnerProvider.LINUX_X64_DOCKERFILE_PATH,
 *     runnerVersion: RunnerVersion.specific('2.293.0'),
 *     rebuildInterval: Duration.days(14),
 * });
 * builder.setBuildArg('EXTRA_PACKAGES', 'nginx xz-utils');
 * new FargateRunnerProvider(this, 'Fargate provider', {
 *     labels: ['customized-fargate'],
 *     imageBuilder: builder,
 * });
 * ```
 *
 * @deprecated use RunnerImageBuilder
 */
export class CodeBuildImageBuilder extends Construct implements IRunnerImageBuilder {
  /**
   * Bump this number every time the buildspec or any important setting of the project changes. It will force a rebuild of the image.
   * @private
   */
  private static BUILDSPEC_VERSION = 2;

  private readonly architecture: Architecture;
  private readonly os: Os;
  private readonly repository: ecr.Repository;
  private readonly dockerfile: s3_assets.Asset;
  private preBuild: string[] = [];
  private postBuild: string[] = [];
  private buildArgs: Map<string, string> = new Map();
  private policyStatements: iam.PolicyStatement[] = [];
  private secondaryAssets: Map<string, s3_assets.Asset> = new Map();
  private readonly buildImage: codebuild.IBuildImage;
  private boundImage?: RunnerImage;

  constructor(scope: Construct, id: string, readonly props: CodeBuildImageBuilderProps) {
    super(scope, id);

    if (props.subnetSelection?.subnetType == ec2.SubnetType.PRIVATE_ISOLATED) {
      Annotations.of(this).addWarning('Private isolated subnets cannot pull from public ECR and VPC endpoint is not supported yet. ' +
          'See https://github.com/aws/containers-roadmap/issues/1160');
    }

    // set platform
    this.architecture = props.architecture ?? Architecture.X86_64;
    this.os = props.os ?? Os.LINUX;

    // create repository that only keeps one tag
    this.repository = new ecr.Repository(this, 'Repository', {
      imageScanOnPush: true,
      imageTagMutability: TagMutability.MUTABLE,
      removalPolicy: RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      lifecycleRules: [
        {
          description: 'Remove untagged images that have been replaced by CodeBuild',
          tagStatus: TagStatus.UNTAGGED,
          maxImageAge: Duration.days(1),
        },
      ],
    });

    // upload Dockerfile to S3 as an asset
    this.dockerfile = new s3_assets.Asset(this, 'Dockerfile', {
      path: props.dockerfilePath,
    });

    // choose build image
    this.buildImage = props?.buildImage ?? this.getBuildImage();
  }

  /**
   * Uploads a folder to the build server at a given folder name.
   *
   * @param sourcePath path to source directory
   * @param destName name of destination folder
   */
  public addFiles(sourcePath: string, destName: string) {
    if (this.boundImage) {
      throw new Error('Image is already bound. Use this method before passing the builder to a runner provider.');
    }

    const asset = new s3_assets.Asset(this, destName, { path: sourcePath });
    this.secondaryAssets.set(destName, asset);
    this.preBuild.push(`rm -rf "${destName}" && cp -r "$CODEBUILD_SRC_DIR_${destName}" "${destName}"`); // symlinks don't work with docker
  }

  /**
   * Adds a command that runs before `docker build`.
   *
   * @param command command to add
   */
  public addPreBuildCommand(command: string) {
    if (this.boundImage) {
      throw new Error('Image is already bound. Use this method before passing the builder to a runner provider.');
    }
    this.preBuild.push(command);
  }

  /**
   * Adds a command that runs after `docker build` and `docker push`.
   *
   * @param command command to add
   */
  public addPostBuildCommand(command: string) {
    if (this.boundImage) {
      throw new Error('Image is already bound. Use this method before passing the builder to a runner provider.');
    }
    this.postBuild.push(command);
  }

  /**
   * Adds a build argument for Docker. See the documentation for the Dockerfile you're using for a list of supported build arguments.
   *
   * @param name build argument name
   * @param value build argument value
   */
  public setBuildArg(name: string, value: string) {
    if (this.boundImage) {
      throw new Error('Image is already bound. Use this method before passing the builder to a runner provider.');
    }
    this.buildArgs.set(name, value);
  }

  /**
   * Add a policy statement to the builder to access resources required to the image build.
   *
   * @param statement IAM policy statement
   */
  public addPolicyStatement(statement: iam.PolicyStatement) {
    if (this.boundImage) {
      throw new Error('Image is already bound. Use this method before passing the builder to a runner provider.');
    }
    this.policyStatements.push(statement);
  }

  /**
   * Add extra trusted certificates. This helps deal with self-signed certificates for GitHub Enterprise Server.
   *
   * All first party Dockerfiles support this. Others may not.
   *
   * @param path path to directory containing a file called certs.pem containing all the required certificates
   */
  public addExtraCertificates(path: string) {
    if (this.boundImage) {
      throw new Error('Image is already bound. Use this method before passing the builder to a runner provider.');
    }
    this.addFiles(path, 'extra_certs');
  }

  /**
   * Called by IRunnerProvider to finalize settings and create the image builder.
   */
  public bindDockerImage(): RunnerImage {
    if (this.boundImage) {
      return this.boundImage;
    }

    // log group for the image builds
    const logGroup = new logs.LogGroup(
      this,
      'Logs',
      {
        retention: this.props.logRetention ?? RetentionDays.ONE_MONTH,
        removalPolicy: this.props.logRemovalPolicy ?? RemovalPolicy.DESTROY,
      },
    );

    // generate buildSpec
    const buildSpec = this.getBuildSpec(this.repository, logGroup, this.props.runnerVersion);

    // create CodeBuild project that builds Dockerfile and pushes to repository
    const project = new codebuild.Project(this, 'CodeBuild', {
      description: `Build docker image for self-hosted GitHub runner ${this.node.path} (${this.os.name}/${this.architecture.name})`,
      buildSpec: codebuild.BuildSpec.fromObject(buildSpec),
      source: codebuild.Source.s3({
        bucket: this.dockerfile.bucket,
        path: this.dockerfile.s3ObjectKey,
      }),
      vpc: this.props.vpc,
      securityGroups: this.props.securityGroup ? [this.props.securityGroup] : undefined,
      subnetSelection: this.props.subnetSelection,
      timeout: this.props.timeout ?? Duration.hours(1),
      environment: {
        buildImage: this.buildImage,
        computeType: this.props.computeType ?? ComputeType.SMALL,
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
    this.policyStatements.forEach(project.addToRolePolicy);

    // call CodeBuild during deployment and delete all images from repository during destruction
    const cr = this.customResource(project);

    // rebuild image on a schedule
    this.rebuildImageOnSchedule(project, this.props.rebuildInterval);

    for (const [assetPath, asset] of this.secondaryAssets.entries()) {
      project.addSecondarySource(codebuild.Source.s3({
        identifier: assetPath,
        bucket: asset.bucket,
        path: asset.s3ObjectKey,
      }));
    }

    this.boundImage = {
      imageRepository: this.repository,
      imageTag: 'latest',
      architecture: this.architecture,
      os: this.os,
      logGroup,
      runnerVersion: this.props.runnerVersion ?? RunnerVersion.latest(),
      _dependable: cr.ref,
    };
    return this.boundImage;
  }

  private getBuildImage(): codebuild.IBuildImage {
    if (this.os.is(Os.LINUX)) {
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

  private getBuildSpec(repository: ecr.Repository, logGroup: logs.LogGroup, runnerVersion?: RunnerVersion): any {
    // don't forget to change BUILDSPEC_VERSION when the buildSpec changes, and you want to trigger a rebuild on deploy
    let buildArgs = '';
    for (const [name, value] of this.buildArgs.entries()) {
      buildArgs += ` --build-arg "${name}"="${value}"`;
    }
    buildArgs += ` --build-arg RUNNER_VERSION="${runnerVersion ? runnerVersion.version : RunnerVersion.latest().version}"`;

    const thisStack = cdk.Stack.of(this);

    return {
      version: '0.2',
      env: {
        variables: {
          REPO_ARN: repository.repositoryArn,
          REPO_URI: repository.repositoryUri,
          STACK_ID: 'unspecified',
          REQUEST_ID: 'unspecified',
          LOGICAL_RESOURCE_ID: 'unspecified',
          RESPONSE_URL: 'unspecified',
          RUNNER_VERSION: runnerVersion ? runnerVersion.version : RunnerVersion.latest().version,
        },
      },
      phases: {
        pre_build: {
          commands: this.preBuild.concat([
            'mkdir -p extra_certs',
            `aws ecr get-login-password --region "$AWS_DEFAULT_REGION" | docker login --username AWS --password-stdin ${thisStack.account}.dkr.ecr.${thisStack.region}.amazonaws.com`,
          ]),
        },
        build: {
          commands: [
            `docker build . -t "$REPO_URI" ${buildArgs}`,
            'docker push "$REPO_URI"',
          ],
        },
        post_build: {
          commands: this.postBuild.concat([
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
          ]),
        },
      },
    };
  }

  private customResource(project: codebuild.Project) {
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
    crHandler.role?.attachInlinePolicy(policy);

    const cr = new CustomResource(this, 'Builder', {
      serviceToken: crHandler.functionArn,
      resourceType: 'Custom::ImageBuilder',
      properties: {
        RepoName: this.repository.repositoryName,
        ProjectName: project.projectName,
        // We include a hash so the image is built immediately on changes, and we don't have to wait for its scheduled build.
        // This also helps make sure the changes are good. If they have a bug, the deployment will fail instead of just the scheduled build.
        BuildHash: this.hashBuildSettings(),
      },
    });

    // add dependencies to make sure resources are there when we need them
    cr.node.addDependency(project);
    cr.node.addDependency(policy);
    cr.node.addDependency(crHandler);

    return cr;
  }

  /**
   * Return hash of all settings that can affect the result image so we can trigger the build when it changes.
   * @private
   */
  private hashBuildSettings(): string {
    // main Dockerfile
    let components: string[] = [this.dockerfile.assetHash];
    // all additional files
    for (const [name, asset] of this.secondaryAssets.entries()) {
      components.push(name);
      components.push(asset.assetHash);
    }
    // buildspec.yml version
    components.push(`v${CodeBuildImageBuilder.BUILDSPEC_VERSION}`);
    // runner version
    components.push(this.props.runnerVersion?.version ?? RunnerVersion.latest().version);
    // user commands
    components = components.concat(this.preBuild);
    components = components.concat(this.postBuild);
    for (const [name, value] of this.buildArgs.entries()) {
      components.push(name);
      components.push(value);
    }
    // hash it
    const all = components.join('-');
    return crypto.createHash('md5').update(all).digest('hex');
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
      securityGroups: this.props.securityGroup ? [this.props.securityGroup] : [],
    });
  }

  bindAmi(): RunnerAmi {
    throw new Error('CodeBuildImageBuilder does not support building AMIs');
  }
}
