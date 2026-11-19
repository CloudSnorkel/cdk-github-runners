import * as cdk from 'aws-cdk-lib';
import { aws_codebuild as codebuild, aws_ec2 as ec2, aws_ecs as ecs, aws_events as events, aws_kms as kms, aws_lambda as lambda } from 'aws-cdk-lib';
import {
  AlwaysOnWarmRunner,
  Architecture,
  CodeBuildRunnerProvider,
  CompositeProvider,
  Ec2RunnerProvider,
  EcsRunnerProvider,
  FargateRunnerProvider,
  GitHubRunners,
  LambdaAccess,
  LambdaRunnerProvider,
  MicroVmRunnerProvider,
  Os,
  ScheduledWarmRunner,
} from '../src';

/**
 * Every optional feature turned on, with image builders and providers in their own stacks like bigger deployments have them.
 *
 * Shared by the compliance tests. It's over 500 resources, so it can't be deployed as one stack and is only synthesized.
 */
export function fullFeatureApp(compliance?: (app: cdk.App, runners: GitHubRunners, key: kms.IKey) => void) {
  const app = new cdk.App({ context: { '@aws-cdk/core:stackResourceLimit': 1000 } });
  const env = { account: '123456789012', region: 'us-east-1' };
  // the key and the network are used by every other stack, so they go first
  const sharedStack = new cdk.Stack(app, 'shared', { env });
  const buildersStack = new cdk.Stack(app, 'builders', { env });
  const providersStack = new cdk.Stack(app, 'providers', { env });
  const runnersStack = new cdk.Stack(app, 'runners', { env });

  const vpc = new ec2.Vpc(sharedStack, 'Vpc');
  const cluster = new ecs.Cluster(providersStack, 'Cluster', { vpc, enableFargateCapacityProviders: true });

  const codeBuildImage = CodeBuildRunnerProvider.imageBuilder(buildersStack, 'CodeBuild Image');
  const windowsImage = FargateRunnerProvider.imageBuilder(buildersStack, 'Windows Image', { os: Os.WINDOWS });
  const lambdaImage = LambdaRunnerProvider.imageBuilder(buildersStack, 'Lambda Image');
  const microVmImage = MicroVmRunnerProvider.imageBuilder(buildersStack, 'MicroVM Image', { architecture: Architecture.ARM64 });
  const ami = Ec2RunnerProvider.imageBuilder(buildersStack, 'AMI', { awsImageBuilderOptions: { storageSize: cdk.Size.gibibytes(40) } });
  const windowsAmi = Ec2RunnerProvider.imageBuilder(buildersStack, 'Windows AMI', { os: Os.WINDOWS, vpc });

  const lambdaProvider = new LambdaRunnerProvider(providersStack, 'Lambda', { imageBuilder: lambdaImage, vpc });
  const runners = new GitHubRunners(runnersStack, 'runners', {
    providers: [
      new CodeBuildRunnerProvider(providersStack, 'CodeBuild', { imageBuilder: codeBuildImage, vpc }),
      new CodeBuildRunnerProvider(providersStack, 'CodeBuild Windows', { labels: ['windows'], imageBuilder: windowsImage, computeType: codebuild.ComputeType.MEDIUM }),
      CompositeProvider.fallback(providersStack, 'ECS Fallback', [
        new EcsRunnerProvider(providersStack, 'ECS Spot', { imageBuilder: codeBuildImage, cluster, vpc, spot: true, storageSize: cdk.Size.gibibytes(40) }),
        new EcsRunnerProvider(providersStack, 'ECS', { imageBuilder: codeBuildImage, vpc }),
      ]),
      lambdaProvider,
      new MicroVmRunnerProvider(providersStack, 'MicroVM', { imageBuilder: microVmImage }),
      CompositeProvider.distribute(providersStack, 'Fargate Distribute', [
        { weight: 1, provider: new FargateRunnerProvider(providersStack, 'Fargate', { imageBuilder: codeBuildImage, cluster, vpc }) },
        { weight: 1, provider: new FargateRunnerProvider(providersStack, 'Fargate Own Cluster', { imageBuilder: codeBuildImage, vpc, spot: true }) },
      ]),
      new Ec2RunnerProvider(providersStack, 'EC2', { imageBuilder: ami, vpc, storageSize: cdk.Size.gibibytes(40) }),
      new Ec2RunnerProvider(providersStack, 'EC2 Windows', { imageBuilder: windowsAmi, vpc }),
    ],
    vpc,
    logOptions: { includeExecutionData: true },
    retryOptions: { retry: true },
    webhookAccess: LambdaAccess.apiGateway({ allowedIps: ['192.30.252.0/22'] }),
    statusAccess: LambdaAccess.apiGateway({ allowedVpc: vpc }),
    providerSelector: new lambda.Function(runnersStack, 'Provider Selector', {
      runtime: lambda.Runtime.NODEJS_LATEST,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => ({})'),
    }),
  });
  new ScheduledWarmRunner(runnersStack, 'Scheduled Warm Runner', {
    runners,
    provider: lambdaProvider,
    count: 1,
    owner: 'owner',
    repo: 'repo',
    schedule: events.Schedule.rate(cdk.Duration.days(1)),
    duration: cdk.Duration.hours(1),
  });
  new AlwaysOnWarmRunner(runnersStack, 'Always On Warm Runner', { runners, provider: lambdaProvider, count: 1, owner: 'owner', repo: 'repo' });
  runners.failedImageBuildsTopic();
  runners.createLogsInsightsQueries();
  runners.createDashboard();

  if (compliance) {
    compliance(app, runners, new kms.Key(sharedStack, 'Key', { enableKeyRotation: true }));
  }

  return app;
}
