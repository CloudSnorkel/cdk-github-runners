import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { DeregisterImageCommand, DescribeImagesCommand, DescribeLaunchTemplateVersionsCommand, EC2Client } from '@aws-sdk/client-ec2';
import { BatchDeleteImageCommand, ECRClient } from '@aws-sdk/client-ecr';
import {
  DeleteImageCommand,
  ImagebuilderClient,
  ImageSummary,
  ListImageBuildVersionsCommand,
  ListImageBuildVersionsResponse,
  ListImagesCommand,
  ListImagesResponse,
} from '@aws-sdk/client-imagebuilder';
import * as AWSLambda from 'aws-lambda';
import { customResourceRespond } from '../../lambda-helpers';

const cfn = new CloudFormationClient();
const ec2 = new EC2Client();
const ecr = new ECRClient();
const ib = new ImagebuilderClient();

// only delete images that are done and not ones in progress
const DELETABLE_IMAGE_STATUSES = [
  'AVAILABLE',
  'DEPRECATED',
  'FAILED',
  'CANCELLED',
];

// delete all images when the stack is being torn down, as there is nothing left to protect and this is our last chance to clean up
const TEARDOWN_STACK_STATUSES = [
  'DELETE_IN_PROGRESS',
  'DELETE_FAILED',
  'DELETE_COMPLETE',
  // these are rollback from initial creation and specifically not UPDATE_ROLLBACK_* which is rollback of an update where stack lives on
  'ROLLBACK_IN_PROGRESS',
  'ROLLBACK_FAILED',
  'ROLLBACK_COMPLETE',
];

/**
 * @internal
 */
export interface DeleteResourcesProps {
  ServiceToken: string;

  /**
   * Current recipe version. We clean all versions, but this is here to make sure CloudFormation calls us to clean up after an update. Changing the
   * recipe changes the version, which makes CloudFormation delete the old physical resource once the update succeeded, and that's what gets us called
   * to clean up.
   */
  RecipeVersion: string;

  /**
   * Recipe whose images we clean up.
   *
   * This can be missing when cleaning up for deploys made with version 0.16.0 and below.
   */
  RecipeName?: string;

  /**
   * Launch template that gets updated by EC2 Image Builder with the latest AMI. We will skip deleting the AMI that the launch template points at, so
   * we don't break any runners that are still using it. When a stack is being deleted, we won't skip.
   */
  LaunchTemplateId?: string;
}

/**
 * Check whether the entire stack is being torn down.
 *
 * On any error we assume it isn't. Leaving an image behind costs a little money, but deleting one that's still in use breaks every runner until the
 * next scheduled build.
 */
async function isStackTearingDown(stackId: string) {
  try {
    const stacks = await cfn.send(new DescribeStacksCommand({ StackName: stackId }));
    const status = stacks.Stacks?.[0]?.StackStatus;
    if (!status) {
      console.warn({
        notice: 'Unable to find stack status, assuming the stack is staying around',
        stack: stackId,
      });
      return false;
    }
    return TEARDOWN_STACK_STATUSES.includes(status);
  } catch (e) {
    console.warn({
      notice: 'Unable to get stack status, assuming the stack is staying around',
      stack: stackId,
      error: e,
    });
    return false;
  }
}

// the launch template is gone for good, so there is no AMI left for us to protect
const MISSING_LAUNCH_TEMPLATE_ERRORS = [
  'InvalidLaunchTemplateId.NotFound',
  'InvalidLaunchTemplateId.Malformed',
  'InvalidLaunchTemplateId.VersionNotFound',
];

/**
 * Get AMI from launch template so we know to not delete an AMI that's still being used.
 *
 * We return undefined when the launch template is gone, or when its default version has no AMI yet, as neither leaves an AMI in use. That happens
 * when the stack is being torn down and the launch template is already deleted, and when the stack is rolling back the initial creation of the image
 * before the launch template had a chance to get an AMI.
 *
 * Any other error means we simply don't know which AMI is in use, which is not the same as knowing none is. We throw so the caller can leave
 * everything alone instead of deleting an AMI that runners may still be starting from.
 */
async function launchTemplateAmi(launchTemplateId: string) {
  try {
    const versions = await ec2.send(new DescribeLaunchTemplateVersionsCommand({
      LaunchTemplateId: launchTemplateId,
      Versions: ['$Default'],
    }));

    return versions.LaunchTemplateVersions?.[0]?.LaunchTemplateData?.ImageId;
  } catch (e) {
    if (MISSING_LAUNCH_TEMPLATE_ERRORS.includes((e as Error).name)) {
      console.log({
        notice: 'Launch template is gone, so no AMI needs to be protected',
        launchTemplate: launchTemplateId,
        error: (e as Error).name,
      });
      return undefined;
    }

    throw e;
  }
}

/**
 * Get image builds of every version of the recipe. We want to clean up all versions, not just the one CloudFormation gave us. Otherwise, leftovers
 * from previously interrupted deployments would stay around forever, as lifecycle policies retain images per recipe version and a leftover is usually
 * the only image of its version.
 */
async function recipeBuilds(recipeName: string) {
  const builds: ImageSummary[] = [];

  let versions: ListImagesResponse = {};
  do {
    versions = await ib.send(new ListImagesCommand({
      owner: 'Self',
      filters: [{ name: 'name', values: [recipeName] }],
      nextToken: versions.nextToken,
    }));

    for (const version of versions.imageVersionList ?? []) {
      if (!version.arn) {
        continue;
      }

      let result: ListImageBuildVersionsResponse = {};
      do {
        result = await ib.send(new ListImageBuildVersionsCommand({
          imageVersionArn: version.arn,
          nextToken: result.nextToken,
        }));
        builds.push(...result.imageSummaryList ?? []);
      } while (result.nextToken);
    }
  } while (versions.nextToken);

  return builds;
}

/**
 * Decide whether a build can be deleted. During teardown everything goes, as nothing is left to protect and we won't be called again. Otherwise, we
 * only touch builds that finished, and never the AMI runners are currently using.
 */
function keepBuild(build: ImageSummary, protectedAmi: string | undefined, teardown: boolean) {
  if (teardown) {
    // last chance to clean up, so try everything. deleting a build that's still running will simply fail and be logged.
    return false;
  }

  if (!build.state?.status || !DELETABLE_IMAGE_STATUSES.includes(build.state.status)) {
    console.log({
      notice: 'Keeping build as it has not finished yet',
      build: build.arn,
      status: build.state?.status,
    });
    return true;
  }

  if (protectedAmi && (build.outputResources?.amis ?? []).some(ami => ami.image === protectedAmi)) {
    console.log({
      notice: 'Keeping build as its AMI is used by the launch template',
      build: build.arn,
      image: protectedAmi,
    });
    return true;
  }

  return false;
}

async function deleteAmi(imageId: string) {
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
      return;
    }

    await ec2.send(new DeregisterImageCommand({
      ImageId: imageId,
      DeleteAssociatedSnapshots: true,
    }));
  } catch (e) {
    console.warn({
      notice: 'Failed to delete AMI',
      image: imageId,
      error: e,
    });
  }
}

async function deleteDockerImage(image: string) {
  try {
    console.log({
      notice: 'Deleting Docker Image',
      image,
    });

    // image looks like 0123456789.dkr.ecr.us-east-1.amazonaws.com/github-runners-test-windowsimagebuilderrepositorya4cbb6d8-hehdl99r7s3d:1.0.10-1
    const parts = image.split('/')[1].split(':');
    const repo = parts[0];
    const tag = parts[1];

    // skip 'latest' as it's a shared tag across recipe versions.
    // without this skip, simple recipe upgrades will end up with latest being gone and runners not starting.
    // old image versions will still point to 'latest' even when a new one replaced it.
    // on complete stack destruction, ecr.Repository(... emptyOnDelete: true ...) will take care of it.
    if (tag === 'latest') {
      console.log({
        notice: 'Skipping latest tag as it is shared',
        image,
      });
      return;
    }

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

async function deleteBuild(build: string) {
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

async function deleteResources(props: DeleteResourcesProps, teardown: boolean) {
  if (!props.RecipeName) {
    console.log({
      notice: 'Skipping resource left by an older version of this construct, the next deployment will clean it up',
    });
    return;
  }

  const builds = await recipeBuilds(props.RecipeName);

  let protectedAmi: string | undefined;
  if (props.LaunchTemplateId && !teardown) {
    try {
      protectedAmi = await launchTemplateAmi(props.LaunchTemplateId);
    } catch (e) {
      // we can't tell which AMI is in use, so we leave everything alone. the next deployment will clean up instead.
      console.warn({
        notice: 'Unable to read launch template, skipping cleanup so an AMI in use is not deleted',
        launchTemplate: props.LaunchTemplateId,
        error: e,
      });
      return;
    }
  }

  const filteredBuilds = builds.filter(build => !keepBuild(build, protectedAmi, teardown));

  for (const build of filteredBuilds) {
    for (const output of build.outputResources?.amis ?? []) {
      if (output.image) {
        await deleteAmi(output.image);
      }
    }

    for (const output of build.outputResources?.containers ?? []) {
      for (const image of output.imageUris ?? []) {
        await deleteDockerImage(image);
      }
    }
  }

  // delete builds last so retries would still work
  for (const build of builds) {
    if (build.arn) {
      await deleteBuild(build.arn);
    }
  }
}

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent, _context: AWSLambda.Context) {
  try {
    console.log({
      notice: 'CloudFormation custom resource request',
      ...event,
      ResponseURL: '...',
    });

    const props = event.ResourceProperties as DeleteResourcesProps;

    switch (event.RequestType) {
      case 'Create':
      case 'Update':
        // we just return the recipe version as the physical id.
        // this way a change in the version makes CloudFormation delete the old physical resource, which is how we get called to clean up after a
        // successful update. it also gets us called on stack deletion. the cleanup itself covers every version of the recipe, so it doesn't matter
        // which version we're called for.
        await customResourceRespond(event, 'SUCCESS', 'OK', props.RecipeVersion, {});
        break;
      case 'Delete':
        if (event.PhysicalResourceId != 'FAIL') {
          await deleteResources(props, await isStackTearingDown(event.StackId));
        }
        await customResourceRespond(event, 'SUCCESS', 'OK', event.PhysicalResourceId, {});
        break;
    }
  } catch (e) {
    console.error({
      notice: 'Failed to delete Image Builder resources',
      error: e,
    });
    await customResourceRespond(event, 'FAILED', (e as Error).message || 'Internal Error', 'FAIL', {});
  }
}
