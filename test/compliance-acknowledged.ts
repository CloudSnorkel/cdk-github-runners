/**
 * cdk-nag findings we know about on a full-feature deployment with every `Compliance` setting turned on, and why they're there.
 *
 * Rules are named without the pack prefix, so `LambdaDLQ` covers HIPAA, NIST and PCI. Paths are construct paths from test/full-feature-stack.ts,
 * where `*` matches within one level and `**` matches any number of levels.
 */
export interface AcknowledgedFinding {
  readonly rules: string[];
  readonly paths?: string[];
  readonly reason: string;
}

const HELPERS = '*/*-dcc036c8-876b-451e-a2c1-552f9e06e9e1/**';

export const ACKNOWLEDGED_FINDINGS: AcknowledgedFinding[] = [
  {
    rules: ['*'],
    paths: ['shared/**', 'providers/Cluster/**', 'runners/Provider Selector/**'],
    reason: 'Created by the test, not by the library.',
  },
  {
    rules: ['IAMNoInlinePolicy', 'IAM5'],
    reason: 'Permissions are added with CDK grants and scoped to our own resources where the API allows it.',
  },
  {
    rules: ['IAM4'],
    reason: 'AWS managed policies for Lambda logging and VPC access, SSM, and Image Builder instances.',
  },
  {
    rules: ['LambdaDLQ'],
    reason: 'Functions are invoked by API Gateway, function URLs, Step Functions, SQS and CloudFormation, which handle failures and retries themselves.',
  },
  {
    rules: ['LambdaInsideVPC'],
    paths: [HELPERS],
    reason: 'Image build and custom resource helpers only call AWS APIs. They are not in the image builder VPC, which may have no route to those APIs, and that would hang the deployment.',
  },
  {
    rules: ['LambdaInsideVPC'],
    paths: ['**/Image Builder Builds Filter/**'],
    reason: 'Only forwards failed image build notifications to another topic. Putting it in the VPC would need an SNS endpoint in VPCs without internet access.',
  },
  {
    rules: ['SMG4', 'SecretsManagerRotationEnabled'],
    reason: 'The secrets hold GitHub app credentials that are created on GitHub and pasted in during setup.',
  },
  {
    rules: ['DDB3', 'DynamoDBPITREnabled', 'DynamoDBInBackupPlan'],
    reason: 'The table only keeps jobs for 3 days to detect stolen runners.',
  },
  {
    rules: ['SQS3'],
    reason: 'Messages are retried until they expire. A dead letter queue would stop idle runners from being cleaned up.',
  },
  {
    rules: ['CodeBuildProjectSourceRepoUrl'],
    reason: 'False positive. The projects have no source and get their build spec inline.',
  },
  {
    rules: ['S1', 'S3BucketLoggingEnabled', 'S3BucketReplicationEnabled', 'S3BucketVersioningEnabled', 'S3BucketDefaultLockEnabled'],
    paths: ['providers/MicroVM Image Artifacts */**'],
    reason: 'Holds a temporary Dockerfile archive for each MicroVM image build. It is deleted by the custom resource that writes it.',
  },
  {
    rules: ['APIG2', 'APIG4', 'COG4'],
    paths: ['runners/runners/Webhook Handler/access/**', 'runners/runners/status access/**'],
    reason: 'Requests are authorized by the function: webhooks by their signature, and status by its access setting.',
  },
  {
    rules: ['APIG3', 'APIGWAssociatedWithWAF', 'APIGWCacheEnabledAndEncrypted', 'APIGWSSLEnabled', 'APIGWXrayEnabled'],
    paths: ['runners/runners/Webhook Handler/access/**', 'runners/runners/status access/**'],
    reason: 'Access is limited by IP or VPC with the resource policy, responses are not cached, and the only backend is a Lambda function.',
  },
  {
    rules: ['LambdaFunctionPublicAccessProhibited'],
    paths: ['runners/runners/setup/**'],
    reason: 'The setup page is public so it can be opened in a browser. Use `setupAccess: LambdaAccess.noAccess()` once setup is done.',
  },
  {
    rules: ['CB5'],
    paths: ['providers/*/CodeBuild/Resource'],
    reason: 'Runners use the image built for them.',
  },
  {
    rules: ['ECS4'],
    reason: 'Container Insights costs extra, and runner tasks only live for one job.',
  },
  {
    rules: ['AS3'],
    reason: 'Instances are started and stopped by the scaling of runner tasks.',
  },
  {
    rules: ['SF2'],
    reason: 'X-Ray costs extra. Executions can be logged with `logOptions`.',
  },
];
