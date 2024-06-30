import * as crypto from 'node:crypto';
import * as cdk from 'aws-cdk-lib';
import {
  Annotations,
  aws_cloudformation as cloudformation,
  aws_codebuild as codebuild,
  aws_ec2 as ec2,
  aws_ecr as ecr,
  aws_events as events,
  aws_events_targets as events_targets,
  aws_iam as iam,
  aws_lambda as lambda,
  aws_logs as logs,
  aws_s3_assets as s3_assets,
  aws_sns as sns,
  CustomResource,
  Duration,
  RemovalPolicy,
} from 'aws-cdk-lib';
import { ComputeType } from 'aws-cdk-lib/aws-codebuild';
import { TagMutability, TagStatus } from 'aws-cdk-lib/aws-ecr';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct, IConstruct } from 'constructs';
import { defaultBaseDockerImage } from './aws-image-builder';
import { BuildImageFunction } from './build-image-function';
import { BuildImageFunctionProperties } from './build-image.lambda';
import { RunnerImageBuilderBase, RunnerImageBuilderProps } from './common';
import { Architecture, Os, RunnerAmi, RunnerImage, RunnerVersion } from '../providers';
import { singletonLambda, singletonLogGroup, SingletonLogType } from '../utils';


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
   * @default Amazon Linux 2023
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
  private readonly waitOnDeploy: boolean;
  private readonly dockerSetupCommands: string[];

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
    this.waitOnDeploy = props?.waitOnDeploy ?? true;
    this.dockerSetupCommands = props?.dockerSetupCommands ?? [];

    // warn against isolated networks
    if (props?.subnetSelection?.subnetType == ec2.SubnetType.PRIVATE_ISOLATED) {
      Annotations.of(this).addWarning('Private isolated subnets cannot pull from public ECR and VPC endpoint is not supported yet. ' +
        'See https://github.com/aws/containers-roadmap/issues/1160');
    }

    // error out on no-nat networks because the build will hang
    if (props?.subnetSelection?.subnetType == ec2.SubnetType.PUBLIC) {
      Annotations.of(this).addError('Public subnets do not work with CodeBuild as it cannot be assigned an IP. ' +
        'See https://docs.aws.amazon.com/codebuild/latest/userguide/vpc-support.html#best-practices-for-vpcs');
    }

    // check timeout
    if (this.timeout.toSeconds() > Duration.hours(8).toSeconds()) {
      Annotations.of(this).addError('CodeBuild runner image builder timeout must 8 hours or less.');
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
      emptyOnDelete: true,
      lifecycleRules: [
        {
          description: 'Remove soci indexes for replaced images',
          tagStatus: TagStatus.TAGGED,
          tagPrefixList: ['sha256-'],
          maxImageCount: 1,
        },
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
    const [buildSpec, buildSpecHash] = this.getBuildSpec(this.repository);

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

    // call CodeBuild during deployment
    const completedImage = this.customResource(project, buildSpecHash);

    // rebuild image on a schedule
    this.rebuildImageOnSchedule(project, this.rebuildInterval);

    // return the image
    this.boundDockerImage = {
      imageRepository: this.repository,
      imageTag: 'latest',
      architecture: this.architecture,
      os: this.os,
      logGroup,
      runnerVersion: RunnerVersion.specific('unknown'),
      _dependable: completedImage,
    };
    return this.boundDockerImage;
  }

  private getDefaultBuildImage(): codebuild.IBuildImage {
    if (this.os.isIn(Os._ALL_LINUX_VERSIONS)) {
      // CodeBuild just runs `docker build` so its OS doesn't really matter
      if (this.architecture.is(Architecture.X86_64)) {
        return codebuild.LinuxBuildImage.AMAZON_LINUX_2_5;
      } else if (this.architecture.is(Architecture.ARM64)) {
        return codebuild.LinuxArmBuildImage.AMAZON_LINUX_2_STANDARD_3_0;
      }
    }
    if (this.os.is(Os.WINDOWS)) {
      throw new Error('CodeBuild cannot be used to build Windows Docker images https://github.com/docker-library/docker/issues/49');
    }

    throw new Error(`Unable to find CodeBuild image for ${this.os.name}/${this.architecture.name}`);
  }

  private getDockerfileGenerationCommands(): [string[], string[]] {
    let hashedComponents: string[] = [];
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
        hashedComponents.push(`__ ASSET FILE ${asset.assetHash} ${i}-${componentName}-${j} ${assetDescriptors[j].target}`);

        asset.grantRead(this);
      }

      const componentCommands = this.components[i].getCommands(this.os, this.architecture);
      const script = '#!/bin/bash\nset -exuo pipefail\n' + componentCommands.join('\n');
      commands.push(`cat > component${i}-${componentName}.sh <<'EOFGITHUBRUNNERSDOCKERFILE'\n${script}\nEOFGITHUBRUNNERSDOCKERFILE`);
      commands.push(`chmod +x component${i}-${componentName}.sh`);
      hashedComponents.push(`__ COMMAND ${i} ${componentName} ${script}`);
      dockerfile += `COPY component${i}-${componentName}.sh /tmp\n`;
      dockerfile += `RUN /tmp/component${i}-${componentName}.sh\n`;

      const dockerCommands = this.components[i].getDockerCommands(this.os, this.architecture);
      dockerfile += dockerCommands.join('\n') + '\n';
      hashedComponents.push(`__ DOCKER COMMAND ${i} ${dockerCommands.join('\n')}`);
    }

    commands.push(`cat > Dockerfile <<'EOFGITHUBRUNNERSDOCKERFILE'\n${dockerfile}\nEOFGITHUBRUNNERSDOCKERFILE`);

    return [commands, hashedComponents];
  }

  private getBuildSpec(repository: ecr.Repository): [codebuild.BuildSpec, string] {
    const thisStack = cdk.Stack.of(this);

    let archUrl;
    if (this.architecture.is(Architecture.X86_64)) {
      archUrl = 'x86_64';
    } else if (this.architecture.is(Architecture.ARM64)) {
      archUrl = 'arm64';
    } else {
      throw new Error(`Unsupported architecture for required CodeBuild: ${this.architecture.name}`);
    }

    const [commands, commandsHashedComponents] = this.getDockerfileGenerationCommands();

    const buildSpecVersion = 'v1'; // change this every time the build spec changes
    const hashedComponents = commandsHashedComponents.concat(buildSpecVersion, this.architecture.name, this.baseImage, this.os.name);
    const hash = crypto.createHash('md5').update(hashedComponents.join('\n')).digest('hex').slice(0, 10);

    const buildSpec = codebuild.BuildSpec.fromObject({
      version: '0.2',
      env: {
        variables: {
          REPO_ARN: repository.repositoryArn,
          REPO_URI: repository.repositoryUri,
          WAIT_HANDLE: 'unspecified',
          BASH_ENV: 'codebuild-log.sh',
        },
        shell: 'bash',
      },
      phases: {
        pre_build: {
          commands: [
            'echo "exec > >(tee -a /tmp/codebuild.log) 2>&1" > codebuild-log.sh',
            `aws ecr get-login-password --region "$AWS_DEFAULT_REGION" | docker login --username AWS --password-stdin ${thisStack.account}.dkr.ecr.${thisStack.region}.amazonaws.com`,
          ].concat(this.dockerSetupCommands),
        },
        build: {
          commands: commands.concat(
            'docker build --progress plain . -t "$REPO_URI"',
            'docker push "$REPO_URI"',
          ),
        },
        post_build: {
          commands: [
            'rm -f codebuild-log.sh && STATUS="SUCCESS"',
            'if [ $CODEBUILD_BUILD_SUCCEEDING -ne 1 ]; then STATUS="FAILURE"; fi',
            'cat <<EOF > /tmp/payload.json\n' +
              '{\n' +
              '  "Status": "$STATUS",\n' +
              '  "UniqueId": "build",\n' +
              // we remove non-printable characters from the log because CloudFormation doesn't like them
              // https://github.com/aws-cloudformation/cloudformation-coverage-roadmap/issues/1601
              '  "Reason": `sed \'s/[^[:print:]]//g\' /tmp/codebuild.log | tail -c 400 | jq -Rsa .`,\n' +
              // for lambda always get a new value because there is always a new image hash
              '  "Data": "$RANDOM"\n' +
              '}\n' +
              'EOF',
            'if [ "$WAIT_HANDLE" != "unspecified" ]; then jq . /tmp/payload.json; curl -fsSL -X PUT -H "Content-Type:" -d "@/tmp/payload.json" "$WAIT_HANDLE"; fi',
            // generate and push soci index
            // we do this after finishing the build, so we don't have to wait. it's also not required, so it's ok if it fails
            'docker rmi "$REPO_URI"', // it downloads the image again to /tmp, so save on space
            'LATEST_SOCI_VERSION=`curl -w "%{redirect_url}" -fsS https://github.com/CloudSnorkel/standalone-soci-indexer/releases/latest | grep -oE "[^/]+$"`',
            `curl -fsSL https://github.com/CloudSnorkel/standalone-soci-indexer/releases/download/$\{LATEST_SOCI_VERSION}/standalone-soci-indexer_Linux_${archUrl}.tar.gz | tar xz`,
            './standalone-soci-indexer "$REPO_URI"',
          ],
        },
      },
    });

    return [buildSpec, hash];
  }

  private customResource(project: codebuild.Project, buildSpecHash: string) {
    const crHandler = singletonLambda(BuildImageFunction, this, 'build-image', {
      description: 'Custom resource handler that triggers CodeBuild to build runner images',
      timeout: cdk.Duration.minutes(3),
      logGroup: singletonLogGroup(this, SingletonLogType.RUNNER_IMAGE_BUILD),
      logFormat: lambda.LogFormat.JSON,
    });

    const policy = new iam.Policy(this, 'CR Policy', {
      statements: [
        new iam.PolicyStatement({
          actions: ['codebuild:StartBuild'],
          resources: [project.projectArn],
        }),
      ],
    });
    crHandler.role!.attachInlinePolicy(policy);

    let waitHandleRef= 'unspecified';
    let waitDependable = '';

    if (this.waitOnDeploy) {
      // Wait handle lets us wait for longer than an hour for the image build to complete.
      // We generate a new wait handle for build spec changes to guarantee a new image is built.
      // This also helps make sure the changes are good. If they have a bug, the deployment will fail instead of just the scheduled build.
      // Finally, it's recommended by CloudFormation docs to not reuse wait handles or old responses may interfere in some cases.
      const handle = new cloudformation.CfnWaitConditionHandle(this, `Build Wait Handle ${buildSpecHash}`);
      const wait = new cloudformation.CfnWaitCondition(this, `Build Wait ${buildSpecHash}`, {
        handle: handle.ref,
        timeout: this.timeout.toSeconds().toString(), // don't wait longer than the build timeout
        count: 1,
      });
      waitHandleRef = handle.ref;
      waitDependable = wait.ref;
    }

    const cr = new CustomResource(this, 'Builder', {
      serviceToken: crHandler.functionArn,
      resourceType: 'Custom::ImageBuilder',
      properties: <BuildImageFunctionProperties>{
        RepoName: this.repository.repositoryName,
        ProjectName: project.projectName,
        WaitHandle: waitHandleRef,
      },
    });

    // add dependencies to make sure resources are there when we need them
    cr.node.addDependency(project);
    cr.node.addDependency(this.role);
    cr.node.addDependency(policy);
    cr.node.addDependency(crHandler.role!);
    cr.node.addDependency(crHandler);

    return waitDependable; // user needs to wait on wait handle which is triggered when the image is built
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

/**
 * @internal
 */
export class CodeBuildImageBuilderFailedBuildNotifier implements cdk.IAspect {
  constructor(private topic: sns.ITopic) {
  }

  public visit(node: IConstruct): void {
    if (node instanceof CodeBuildRunnerImageBuilder) {
      const builder = node as CodeBuildRunnerImageBuilder;
      const projectNode = builder.node.tryFindChild('CodeBuild');
      if (projectNode) {
        const project = projectNode as codebuild.Project;
        project.notifyOnBuildFailed('BuildFailed', this.topic);
      } else {
        cdk.Annotations.of(builder).addWarning('Unused builder cannot get notifications of failed builds');
      }
    }
  }
}
