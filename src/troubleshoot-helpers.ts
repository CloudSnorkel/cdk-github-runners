import { CloudFormationClient, DescribeStackResourceCommand } from '@aws-sdk/client-cloudformation';
import { DescribeLaunchTemplateVersionsCommand, EC2Client } from '@aws-sdk/client-ec2';
import { ECRClient, DescribeImagesCommand } from '@aws-sdk/client-ecr';

const cfn = new CloudFormationClient();
const ec2 = new EC2Client();
const ecr = new ECRClient();

export function secretArnToUrl(arn: string) {
  const parts = arn.split(':');
  const region = parts[3];
  const fullName = parts[6];
  const name = fullName.slice(0, fullName.lastIndexOf('-'));

  return `https://${region}.console.aws.amazon.com/secretsmanager/home?region=${region}#!/secret?name=${name}`;
}

export function lambdaArnToUrl(arn: string) {
  const parts = arn.split(':');
  const region = parts[3];
  const name = parts[6];

  return `https://${region}.console.aws.amazon.com/lambda/home?region=${region}#/functions/${name}?tab=monitoring`;
}

export function lambdaArnToLogGroup(arn: string) {
  const parts = arn.split(':');
  const name = parts[6];

  return `/aws/lambda/${name}`;
}

export function stepFunctionArnToUrl(arn: string) {
  const parts = arn.split(':');
  const region = parts[3];

  return `https://${region}.console.aws.amazon.com/states/home?region=${region}#/statemachines/view/${arn}`;
}

export function executionArnToUrl(arn: string) {
  const parts = arn.split(':');
  const region = parts[3];

  return `https://${region}.console.aws.amazon.com/states/home?region=${region}#/v2/executions/details/${arn}`;
}

export function logGroupUrl(region: string, logGroupName: string) {
  const encoded = encodeURIComponent(encodeURIComponent(logGroupName)).replace(/%/g, '$');
  return `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/${encoded}`;
}

export function logStreamUrl(region: string, logGroupName: string, logStreamName: string) {
  const encodedGroup = encodeURIComponent(encodeURIComponent(logGroupName)).replace(/%/g, '$');
  const encodedStream = encodeURIComponent(encodeURIComponent(logStreamName)).replace(/%/g, '$');
  return `https://${region}.console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/${encodedGroup}/log-events/${encodedStream}`;
}

export function regionFromArn(arn: string) {
  return arn.split(':')[3];
}

export async function generateProvidersStatus(stack: string, logicalId: string) {
  const resource = await cfn.send(new DescribeStackResourceCommand({ StackName: stack, LogicalResourceId: logicalId }));
  const providers = JSON.parse(resource.StackResourceDetail?.Metadata ?? '{}').providers as any[] | undefined;

  if (!providers) {
    return {};
  }

  return Promise.all(providers.map(async (p) => {
    if (p.image?.imageRepository?.match(/[0-9]+\.dkr\.ecr\.[a-z0-9\-]+\.amazonaws\.com\/.+/)) {
      const tags = await ecr.send(new DescribeImagesCommand({
        repositoryName: p.image.imageRepository.split('/')[1],
        filter: {
          tagStatus: 'TAGGED',
        },
        maxResults: 1,
      }));
      if (tags.imageDetails && tags.imageDetails?.length >= 1) {
        p.image.latestImage = {
          tags: tags.imageDetails[0].imageTags,
          digest: tags.imageDetails[0].imageDigest,
          date: tags.imageDetails[0].imagePushedAt,
        };
      }
    }
    if (p.ami?.launchTemplate) {
      const versions = await ec2.send(new DescribeLaunchTemplateVersionsCommand({
        LaunchTemplateId: p.ami.launchTemplate,
        Versions: ['$Default'],
      }));
      if (versions.LaunchTemplateVersions && versions.LaunchTemplateVersions.length >= 1) {
        p.ami.latestAmi = versions.LaunchTemplateVersions[0].LaunchTemplateData?.ImageId;
      }
    }
    return p;
  }));
}
