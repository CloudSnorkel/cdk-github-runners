import { DeleteSnapshotCommand, DeregisterImageCommand, DescribeImagesCommand, EC2Client } from '@aws-sdk/client-ec2';
import { BatchDeleteImageCommand, ECRClient } from '@aws-sdk/client-ecr';
import { DeleteImageCommand, ImagebuilderClient, ListImageBuildVersionsCommand, ListImageBuildVersionsResponse } from '@aws-sdk/client-imagebuilder';
import * as AWSLambda from 'aws-lambda';
import { customResourceRespond } from '../../lambda-helpers';

const ec2 = new EC2Client();
const ecr = new ECRClient();
const ib = new ImagebuilderClient();

/**
 * @internal
 */
export interface DeleteResourcesProps {
  ServiceToken: string;
  ImageVersionArn: string;
}

async function deleteResources(props: DeleteResourcesProps) {
  const buildsToDelete: string[] = [];
  const amisToDelete: string[] = [];
  const dockerImagesToDelete: string[] = [];

  let result: ListImageBuildVersionsResponse = {};
  do {
    result = await ib.send(new ListImageBuildVersionsCommand({
      imageVersionArn: props.ImageVersionArn,
      nextToken: result.nextToken,
    }));
    if (result.imageSummaryList) {
      for (const image of result.imageSummaryList) {
        if (image.arn) {
          buildsToDelete.push(image.arn);
        }
        for (const output of image.outputResources?.amis ?? []) {
          if (output.image) {
            amisToDelete.push(output.image);
          }
        }
        for (const output of image.outputResources?.containers ?? []) {
          if (output.imageUris) {
            dockerImagesToDelete.push(...output.imageUris);
          }
        }
      }
    }
  } while (result.nextToken);

  // delete amis
  for (const imageId of amisToDelete) {
    try {
      console.log({
        notice: 'Deleting AMI',
        image: imageId,
      });

      const imageDesc = await ec2.send(new DescribeImagesCommand({
        Owners: ['self'],
        ImageIds: [imageId],
      }));

      if (imageDesc.Images?.length !== 1) {
        console.warn({
          notice: 'Unable to find AMI',
          image: imageId,
        });
        continue;
      }

      await ec2.send(new DeregisterImageCommand({
        ImageId: imageId,
      }));

      for (const blockMapping of imageDesc.Images[0].BlockDeviceMappings ?? []) {
        if (blockMapping.Ebs?.SnapshotId) {
          console.log({
            notice: 'Deleting EBS snapshot',
            image: imageId,
            snapshot: blockMapping.Ebs.SnapshotId,
          });

          await ec2.send(new DeleteSnapshotCommand({
            SnapshotId: blockMapping.Ebs.SnapshotId,
          }));
        }
      }
    } catch (e) {
      console.warn({
        notice: 'Failed to delete AMI',
        image: imageId,
        error: e,
      });
    }
  }

  // delete docker images
  for (const image of dockerImagesToDelete) {
    try {
      console.log({
        notice: 'Deleting Docker Image',
        image,
      });

      // image looks like 0123456789.dkr.ecr.us-east-1.amazonaws.com/github-runners-test-windowsimagebuilderrepositorya4cbb6d8-hehdl99r7s3d:1.0.10-1
      const parts = image.split('/')[1].split(':');
      const repo = parts[0];
      const tag = parts[1];

      // delete image
      await ecr.send(new BatchDeleteImageCommand({
        repositoryName: repo,
        imageIds: [
          {
            imageTag: tag,
          },
        ],
      }));
    } catch (e) {
      console.warn({
        notice: 'Failed to delete docker image',
        image,
        error: e,
      });
    }
  }

  // delete builds (last so retries would still work)
  for (const build of buildsToDelete) {
    try {
      console.log({
        notice: 'Deleting Image Build',
        build,
      });

      await ib.send(new DeleteImageCommand({
        imageBuildVersionArn: build,
      }));
    } catch (e) {
      console.warn({
        notice: 'Failed to delete image version build',
        build,
        error: e,
      });
    }
  }
}

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent, _context: AWSLambda.Context) {
  try {
    console.log({
      ...event,
      ResponseURL: '...',
    });

    const props = event.ResourceProperties as DeleteResourcesProps;

    switch (event.RequestType) {
      case 'Create':
      case 'Update':
        // we just return the arn as the physical id
        // this way a change in the version will trigger delete of the old version on cleanup of stack
        // it will also trigger delete on stack deletion
        await customResourceRespond(event, 'SUCCESS', 'OK', props.ImageVersionArn, {});
        break;
      case 'Delete':
        if (event.PhysicalResourceId != 'FAIL') {
          await deleteResources(props);
        }
        await customResourceRespond(event, 'SUCCESS', 'OK', event.PhysicalResourceId, {});
        break;
    }
  } catch (e) {
    console.error(e);
    await customResourceRespond(event, 'FAILED', (e as Error).message || 'Internal Error', 'FAIL', {});
  }
}
