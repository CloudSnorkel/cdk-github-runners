/* eslint-disable-next-line import/no-extraneous-dependencies,import/no-unresolved */
import * as AWSLambda from 'aws-lambda';
/* eslint-disable-next-line import/no-extraneous-dependencies */
import * as AWS from 'aws-sdk';
import { customResourceRespond } from './helpers';

const ec2 = new AWS.EC2();

type DeleteAmiInput = {
  RequestType: 'Scheduled';
  StackName: string;
  BuilderName: string;
  LaunchTemplateId: string;
}

async function deleteAmis(launchTemplateId: string, stackName: string, builderName: string, deleteAll: boolean) {
  // this runs daily and images are built once a week, so there shouldn't be a need for pagination
  const images = await ec2.describeImages({
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
  }).promise();

  let imagesToDelete = images.Images ?? [];

  console.log(`Found ${imagesToDelete.length} AMIs`);
  console.log(JSON.stringify(imagesToDelete.map(i => i.ImageId)));

  if (!deleteAll) {
    // get launch template information to filter out the active image
    const launchTemplates = await ec2.describeLaunchTemplateVersions({
      LaunchTemplateId: launchTemplateId,
      Versions: ['$Default'],
    }).promise();
    if (!launchTemplates.LaunchTemplateVersions) {
      console.error(`Unable to describe launch template ${launchTemplateId}`);
      return;
    }
    const launchTemplate = launchTemplates.LaunchTemplateVersions[0];

    // non-active images
    imagesToDelete = imagesToDelete.filter(i => i.ImageId != launchTemplate.LaunchTemplateData?.ImageId);
    // images older than two days to avoid race conditions where an image is created while we're cleaning up
    imagesToDelete = imagesToDelete.filter(i => i.CreationDate && Date.parse(i.CreationDate) < (Date.now() - 1000 * 60 * 60 * 48));

    console.log(`${imagesToDelete.length} AMIs left after filtering by date and excluding AMI used by launch template`);
  }

  // delete all that we found
  for (const image of imagesToDelete) {
    if (!image.ImageId) {
      console.warn(`No image id? ${JSON.stringify(image)}`);
      continue;
    }

    console.log(`Deregistering ${image.ImageId}`);

    await ec2.deregisterImage({
      ImageId: image.ImageId,
    }).promise();

    for (const blockMapping of image.BlockDeviceMappings ?? []) {
      if (blockMapping.Ebs?.SnapshotId) {
        console.log(`Deleting ${blockMapping.Ebs.SnapshotId}`);

        await ec2.deleteSnapshot({
          SnapshotId: blockMapping.Ebs.SnapshotId,
        }).promise();
      }
    }
  }
}

/* eslint-disable @typescript-eslint/no-require-imports, import/no-extraneous-dependencies */
exports.handler = async function (event: DeleteAmiInput | AWSLambda.CloudFormationCustomResourceEvent, context: AWSLambda.Context) {
  try {
    console.log(JSON.stringify({ ...event, ResponseURL: '...' }));

    switch (event.RequestType) {
      case 'Scheduled':
        await deleteAmis(event.LaunchTemplateId, event.StackName, event.BuilderName, false);
        return;
      case 'Create':
      case 'Update':
        await customResourceRespond(event, 'SUCCESS', 'OK', 'DeleteAmis', {});
        break;
      case 'Delete':
        await deleteAmis('', event.ResourceProperties.StackName, event.ResourceProperties.BuilderName, true);
        await customResourceRespond(event, 'SUCCESS', 'OK', event.PhysicalResourceId, {});
        break;
    }
  } catch (e) {
    console.error(e);
    if (event.RequestType != 'Scheduled') {
      await customResourceRespond(event, 'FAILED', (e as Error).message || 'Internal Error', context.logStreamName, {});
    }
  }
};
