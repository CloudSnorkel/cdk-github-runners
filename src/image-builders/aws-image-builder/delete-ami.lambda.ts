import {
  DeleteSnapshotCommand,
  DeregisterImageCommand,
  DescribeImagesCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
import * as AWSLambda from 'aws-lambda';
import { customResourceRespond } from '../../lambda-helpers';

const ec2 = new EC2Client();

async function deleteAmis(stackName: string, builderName: string) {
  // lifecycle rule runs daily and images are built once a week, so there shouldn't be a need for pagination
  const images = await ec2.send(new DescribeImagesCommand({
    Owners: ['self'],
    Filters: [
      {
        Name: 'tag:GitHubRunners:Stack',
        Values: [stackName],
      },
      {
        Name: 'tag:GitHubRunners:Builder',
        Values: [builderName],
      },
    ],
  }));

  let imagesToDelete = images.Images ?? [];

  console.log({
    notice: `Found ${imagesToDelete.length} AMIs`,
    images: imagesToDelete.map(i => i.ImageId),
  });

  // delete all that we found
  for (const image of imagesToDelete) {
    if (!image.ImageId) {
      console.warn({
        notice: 'No image id?',
        image,
      });
      continue;
    }

    console.log(`Deregistering ${image.ImageId}`);

    await ec2.send(new DeregisterImageCommand({
      ImageId: image.ImageId,
    }));

    for (const blockMapping of image.BlockDeviceMappings ?? []) {
      if (blockMapping.Ebs?.SnapshotId) {
        console.log(`Deleting ${blockMapping.Ebs.SnapshotId}`);

        await ec2.send(new DeleteSnapshotCommand({
          SnapshotId: blockMapping.Ebs.SnapshotId,
        }));
      }
    }
  }
}

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent, context: AWSLambda.Context) {
  try {
    console.log({ ...event, ResponseURL: '...' });

    switch (event.RequestType) {
      case 'Create':
      case 'Update':
        await customResourceRespond(event, 'SUCCESS', 'OK', 'DeleteAmis', {});
        break;
      case 'Delete':
        await deleteAmis(event.ResourceProperties.StackName, event.ResourceProperties.BuilderName);
        await customResourceRespond(event, 'SUCCESS', 'OK', event.PhysicalResourceId, {});
        break;
    }
  } catch (e) {
    console.error(e);
    await customResourceRespond(event, 'FAILED', (e as Error).message || 'Internal Error', context.logStreamName, {});
  }
}
