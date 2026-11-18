import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { DescribeImagesCommand, ECRClient } from '@aws-sdk/client-ecr';
import {
  DeleteMicrovmImageVersionCommand,
  GetMicrovmImageCommand,
  LambdaMicrovmsClient,
  ListManagedMicrovmImageVersionsCommand,
  ListMicrovmImageVersionsCommand,
  ManagedMicrovmImageVersion,
  MicrovmImageVersionSummary,
  UpdateMicrovmImageCommand,
  UpdateMicrovmImageRequest,
} from '@aws-sdk/client-lambda-microvms';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as AWSLambda from 'aws-lambda';
import JSZip from 'jszip';
import { customResourceRespond } from '../lambda-helpers';

const s3 = new S3Client();
const microvms = new LambdaMicrovmsClient();
const cfn = new CloudFormationClient();
const ecr = new ECRClient();

/**
 * Event sent by the ECR push rule when the runner image has been rebuilt, and by the stack rule when CloudFormation is
 * done deploying. Lambda doesn't follow the image tag, so we have to tell it to build a new image version out of the
 * image that was pushed.
 */
interface RebuildInput {
  readonly image: UpdateMicrovmImageRequest;
  readonly stackId: string;
  readonly repositoryName: string;
  readonly imageTag: string;
}

/**
 * Resource properties of the custom resource that uploads a zip with a Dockerfile to S3. The Dockerfile is used by Lambda to build the
 * MicroVM image.
 *
 * @internal
 */
export interface SetupInput {
  readonly ServiceToken: string;
  readonly Bucket: string;
  readonly Key: string;
  readonly Dockerfile: string;
}

/**
 * MicroVM images are built from a zip in S3 and not from a container image, so we have to put a Dockerfile pointing at
 * the runner image somewhere Lambda can read it. The image repository is only known at deploy time, so this can't be a
 * normal CDK asset.
 */
async function handleCustomResource(event: AWSLambda.CloudFormationCustomResourceEvent) {
  const input = event.ResourceProperties as SetupInput;
  const bucket = input.Bucket;
  const key = input.Key;
  const dockerfile = input.Dockerfile;

  if (event.RequestType === 'Delete') {
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    await customResourceRespond(event, 'SUCCESS', 'OK', `${bucket}/${key}`, {});
    return;
  }

  console.log({
    notice: 'Uploading MicroVM image code artifact',
    bucket,
    key,
    dockerfile,
  });

  const zip = new JSZip();
  zip.file('Dockerfile', dockerfile);

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: await zip.generateAsync({ type: 'nodebuffer' }),
  }));

  await customResourceRespond(event, 'SUCCESS', 'OK', `${bucket}/${key}`, {});
}

/**
 * CloudFormation requires a base image version, so it gets pinned there. Rebuilds pick up the latest one, the same way
 * our other image builders always build on the latest base image.
 */
async function latestBaseImageVersion(image: UpdateMicrovmImageRequest) {
  const architecture = image.cpuConfigurations![0].architecture;
  const versions: ManagedMicrovmImageVersion[] = [];
  let nextToken: string | undefined;
  do {
    const page = await microvms.send(new ListManagedMicrovmImageVersionsCommand({ imageIdentifier: image.baseImageArn, nextToken }));
    versions.push(...page.items ?? []);
    nextToken = page.nextToken;
  } while (nextToken);

  const latest = versions
    .filter(v => v.status === 'AVAILABLE' && v.supportedCpuConfigurations?.some(c => c.architecture === architecture))
    .sort((a, b) => b.createdAt!.getTime() - a.createdAt!.getTime())[0];

  return latest?.imageVersion ?? image.baseImageVersion;
}

const KEEP_VERSIONS = 3;

/**
 * All image versions, newest first.
 */
async function imageVersions(imageIdentifier: string) {
  const versions: MicrovmImageVersionSummary[] = [];
  let nextToken: string | undefined;
  do {
    const page = await microvms.send(new ListMicrovmImageVersionsCommand({ imageIdentifier, nextToken }));
    versions.push(...page.items ?? []);
    nextToken = page.nextToken;
  } while (nextToken);
  return versions.sort((a, b) => b.createdAt!.getTime() - a.createdAt!.getTime());
}

/**
 * Wait until image is ready for updates/deletes.
 */
async function waitForImage(imageIdentifier: string) {
  // deleting a version puts the whole image in UPDATING for a moment, and it won't take another change until it's done
  while ((await microvms.send(new GetMicrovmImageCommand({ imageIdentifier }))).state === 'UPDATING') {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function handleRebuild(event: RebuildInput) {
  // CloudFormation fails to update an image that's already building, and doesn't retry. so we stay out of its way while
  // it deploys. the stack rule calls us again once it's done.
  const stack = (await cfn.send(new DescribeStacksCommand({ StackName: event.stackId }))).Stacks![0];
  if (stack.StackStatus!.endsWith('_IN_PROGRESS')) {
    console.log({
      notice: 'Stack is deploying, we will try again once it is done',
      image: event.image.imageIdentifier,
      stackStatus: stack.StackStatus,
    });
    return;
  }

  // the image builder pushes more than once for every build (image, then SOCI index). the first push already started a
  // build out of the same image, and Lambda won't take another update until it's done.
  const current = await microvms.send(new GetMicrovmImageCommand({ imageIdentifier: event.image.imageIdentifier }));
  if (current.state === 'CREATING' || current.state === 'UPDATING') {
    console.log({
      notice: 'MicroVM image is already building',
      image: event.image.imageIdentifier,
      state: current.state,
    });
    return;
  }

  // Lambda only allows 50 versions per image, and nothing can update the image once we hit it, not even CloudFormation.
  // nothing else is touching the image right now (stack is not *_IN_PROGRESS), so delete old versions. new VMs start from the active one.
  const versions = await imageVersions(event.image.imageIdentifier!);
  for (const version of versions.slice(KEEP_VERSIONS)) {
    if (version.imageVersion === current.latestActiveImageVersion || version.state === 'DELETING' || version.state === 'DELETED') {
      continue;
    }
    console.log({ notice: 'Deleting old MicroVM image version', image: event.image.imageIdentifier, version: version.imageVersion });
    try {
      await microvms.send(new DeleteMicrovmImageVersionCommand({
        imageIdentifier: event.image.imageIdentifier,
        imageVersion: version.imageVersion,
      }));
      await waitForImage(event.image.imageIdentifier!);
    } catch (e) {
      console.error({ notice: 'Failed to delete old MicroVM image version', image: event.image.imageIdentifier, version: version.imageVersion, error: e });
    }
  }

  // we run after every deployment, whether anything changed or not. CloudFormation may have also built a new version
  // already. so only build when the runner image or the base image is newer than what we already have.
  const images = await ecr.send(new DescribeImagesCommand({ repositoryName: event.repositoryName, imageIds: [{ imageTag: event.imageTag }] }));
  const pushedAt = images.imageDetails![0].imagePushedAt!;
  const baseImageVersion = await latestBaseImageVersion(event.image);
  const built = versions.find(v => v.state === 'SUCCESSFUL');
  if (built && built.createdAt! > pushedAt && built.baseImageVersion?.split('.')[0] === baseImageVersion) {
    console.log({
      notice: 'MicroVM image is already up to date',
      image: event.image.imageIdentifier,
      pushedAt,
      builtAt: built.createdAt,
      baseImageVersion,
    });
    return;
  }

  console.log({
    notice: 'Building new MicroVM image version from the runner image',
    image: event.image.imageIdentifier,
    baseImageVersion,
  });

  await microvms.send(new UpdateMicrovmImageCommand({ ...event.image, baseImageVersion }));
}

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent | RebuildInput) {
  if ('RequestType' in event) {
    try {
      console.log({
        notice: 'CloudFormation custom resource request',
        ...event,
        ResponseURL: '...',
      });

      await handleCustomResource(event);
    } catch (e) {
      console.error({ notice: 'Failed to handle custom resource request', error: e });
      await customResourceRespond(event, 'FAILED', (e as Error).message || 'Internal Error', 'ERROR', {});
    }

    return;
  }

  await handleRebuild(event);
}
