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

const ec2 = new EC2Client();
const ecr = new ECRClient();
const ib = new ImagebuilderClient();

/**
 * Physical resource id we hand out when the custom resource is first created.
 *
 * The id itself matters less than the fact that it never changes. We never want to see a replacement as that would cause us to delete all images, and
 * they might still be in use. That's also why on `Update` we just echo back whatever id came in (and it will be different for upgrades). Updates, and
 * rollbacks of updates, leave the resource alone. That's what makes it safe to delete everything we find on `Delete`.
 *
 * Stacks that predate this version keep the image version ARN they were given as their id, forever, and that's fine. What tells a real removal from a
 * leftover of the old behavior is the properties, not the id. See `deleteAllResources`.
 *
 * @internal
 */
export const CLEANER_PHYSICAL_RESOURCE_ID = 'runner-images-deleted-when-builder-is-removed';

/**
 * Number of finished images we keep around on the scheduled cleanup, on top of the image that's currently in use. It gives us something to fall back
 * on, and keeps an image built by a deployment that later rolled back from being collected the moment it's built.
 */
const KEEP_IMAGES = 2;

/**
 * Images that are done building. Anything else is still on its way to the launch template, as distribution is one of the build steps, so we never
 * touch it. The full list of states also has PENDING, CREATING, BUILDING, TESTING, DISTRIBUTING, and INTEGRATING.
 */
const DELETABLE_IMAGE_STATUSES = [
  'AVAILABLE',
  'DEPRECATED',
  'FAILED',
  'CANCELLED',
];

/**
 * The launch template is gone for good, so there is no AMI left for us to protect. Any other error means we simply don't know which AMI is in use,
 * which is not the same as knowing no AMI is in use.
 */
const MISSING_LAUNCH_TEMPLATE_ERRORS = [
  'InvalidLaunchTemplateId.NotFound',
  'InvalidLaunchTemplateId.Malformed',
];

/**
 * Someone already deregistered the AMI, or Image Builder recorded an id we can never act on. Either way there is nothing left of it to lose track of,
 * so the build that points at it can go. DescribeImages raises these rather than returning an empty list when it is given an explicit image id.
 *
 * Treating them as anything else would leave the build behind forever, failing every scheduled run and every delete for an AMI that is already gone.
 */
const MISSING_AMI_ERRORS = [
  'InvalidAMIID.NotFound',
  'InvalidAMIID.Unavailable',
  'InvalidAMIID.Malformed',
];

/**
 * The repository, or the image in it, is already gone. Same reasoning as `MISSING_AMI_ERRORS`.
 */
const MISSING_DOCKER_IMAGE_ERRORS = [
  'RepositoryNotFoundException',
  'ImageNotFoundException',
];

/**
 * The image build is already gone, so there is nothing left to delete. Same reasoning as `MISSING_AMI_ERRORS`.
 */
const MISSING_BUILD_ERRORS = [
  'ResourceNotFoundException',
];

/**
 * Everything we need to find the images of one builder, and the one image of those that's still in use.
 *
 * @internal
 */
export interface CleanerTarget {
  /**
   * Recipe whose images we clean up. EC2 Image Builder names images after the recipe that built them.
   *
   * Missing on a builder removed by the very deployment that upgrades from version 0.16.0 or below, as CloudFormation hands a `Delete` the
   * properties of the last template that deployed successfully. `ImageVersionArn` is used to find the recipe in that case.
   */
  readonly RecipeName?: string;

  /**
   * Launch template that EC2 Image Builder points at the latest AMI. We never delete the AMI of its default version, or runners still starting from
   * it would fail. Not set for Docker image builders.
   */
  readonly LaunchTemplateId?: string;

  /**
   * Current version of the recipe, as an image version ARN.
   *
   * This is the only property version 0.16.0 and below wrote, and the only one they read. We keep writing it for two reasons. It tells us the recipe
   * when we get a `Delete` carrying their properties. And should their code ever run against our properties -- a downgrade replaces the custom
   * resource, and the old code then handles the delete of the resource it superseded -- it has something scoped to work with. Without it, they call
   * ListImageBuildVersions with no image version, which lists every image build version in the account and deletes all of them.
   */
  readonly ImageVersionArn?: string;
}

/**
 * @internal
 */
export interface DeleteResourcesProps extends CleanerTarget {
  readonly ServiceToken: string;
}

/**
 * Scheduled event sent by the EventBridge rule of a single builder.
 *
 * @internal
 */
export interface ScheduledCleanupEvent extends CleanerTarget {
  readonly RequestType: 'Scheduled';
}

/**
 * Get the AMI the launch template points at, so we know not to delete an image that's still in use.
 *
 * EC2 Image Builder sets the default version of the launch template outside of CloudFormation, and RunInstances uses that same default version, so
 * it's the only reliable answer to "which AMI is in use". Note this is `$Default` and not `$Latest`.
 *
 * Returns undefined when the launch template is gone, or when its default version has no AMI yet, as neither leaves an AMI in use. Throws on any
 * other error so the caller can leave everything alone.
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
        notice: 'Launch template is gone or empty, so no AMI needs to be protected',
        launchTemplate: launchTemplateId,
        error: (e as Error).name,
      });
      return undefined;
    }

    throw e;
  }
}

/**
 * Get the image builds of every version of the recipe.
 *
 * Every version is listed and not just the current one. Recipe versions change with every component change, so leftovers from interrupted deployments
 * would otherwise stay around forever. `includeDeprecated` is required or deprecated versions are never returned and can never be cleaned up.
 *
 * The `name` filter is case-sensitive, so it has to be the recipe name as written and not the lowercased form that image ARNs use.
 */
async function recipeBuilds(recipeName: string) {
  const builds: ImageSummary[] = [];
  let listed = 0;

  let versions: ListImagesResponse = {};
  do {
    versions = await ib.send(new ListImagesCommand({
      owner: 'Self',
      filters: [{ name: 'name', values: [recipeName] }],
      includeDeprecated: true,
      nextToken: versions.nextToken,
    }));

    for (const version of versions.imageVersionList ?? []) {
      if (!version.arn) {
        continue;
      }

      listed++;

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

  console.log({
    notice: 'Listed image versions',
    recipe: recipeName,
    versions: listed,
    builds: builds.length,
  });

  return builds;
}

function buildDate(build: ImageSummary) {
  return (build.dateCreated ? Date.parse(build.dateCreated) : 0) || 0;
}

/**
 * Returns false if the AMI is still out there, so the caller knows to keep the build that points at it. An AMI we can no longer find is not a
 * failure, as there is nothing left to lose track of.
 */
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
      return true;
    }

    await ec2.send(new DeregisterImageCommand({
      ImageId: imageId,
      DeleteAssociatedSnapshots: true,
    }));

    return true;
  } catch (e) {
    if (MISSING_AMI_ERRORS.includes((e as Error).name)) {
      console.log({
        notice: 'AMI is already gone',
        image: imageId,
        error: (e as Error).name,
      });
      return true;
    }

    console.warn({
      notice: 'Failed to delete AMI',
      image: imageId,
      error: e,
    });
    return false;
  }
}

/**
 * Returns false if the tag is still out there, so the caller knows to keep the build that points at it. Skipping 'latest' is not a failure, as it is
 * never ours to delete and every Docker build carries it.
 */
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
    // the repository is a child of the builder, so removing the builder or destroying the stack takes it with them and
    // ecr.Repository(... emptyOnDelete: true ...) takes care of the tag.
    if (tag === 'latest') {
      console.log({
        notice: 'Skipping latest tag as it is shared and still in use',
        image,
      });
      return true;
    }

    await ecr.send(new BatchDeleteImageCommand({
      repositoryName: repo,
      imageIds: [
        {
          imageTag: tag,
        },
      ],
    }));

    return true;
  } catch (e) {
    if (MISSING_DOCKER_IMAGE_ERRORS.includes((e as Error).name)) {
      console.log({
        notice: 'Docker image is already gone',
        image,
        error: (e as Error).name,
      });
      return true;
    }

    console.warn({
      notice: 'Failed to delete docker image',
      image,
      error: e,
    });
    return false;
  }
}

/**
 * Returns false if the build is still there, so the caller knows something was left behind.
 */
async function deleteBuild(build: string) {
  try {
    console.log({
      notice: 'Deleting Image Build',
      build,
    });

    await ib.send(new DeleteImageCommand({
      imageBuildVersionArn: build,
    }));

    return true;
  } catch (e) {
    if (MISSING_BUILD_ERRORS.includes((e as Error).name)) {
      console.log({
        notice: 'Image build is already gone',
        build,
        error: (e as Error).name,
      });
      return true;
    }

    console.warn({
      notice: 'Failed to delete image version build',
      build,
      error: e,
    });
    return false;
  }
}

/**
 * Delete the given builds along with everything they produced. The EC2 Image Builder resource is the only way back to an AMI or a Docker image, so a
 * build is deleted last and only once everything it points at is gone. Leave one behind and whatever it produced leaks with no way to find it again.
 *
 * Deletes everything it can first, and only then reports what was left behind. A scheduled run is retried by Lambda and then again the next day. A
 * custom resource responds FAILED, which CloudFormation retries every few minutes before it gives up and skips the resource, and which the user sees
 * either way instead of quietly paying for AMIs nothing will ever come back for.
 *
 * Every one of those retries relists the recipe, so it picks up exactly what the last attempt could not delete. That only works because the builds
 * pointing at those leftovers were kept: delete a build and its AMI is unreachable, so the retry would find nothing left to do.
 */
async function deleteBuilds(builds: ImageSummary[]) {
  const leftBehind = new Set<ImageSummary>();

  for (const build of builds) {
    for (const output of build.outputResources?.amis ?? []) {
      if (output.image && !await deleteAmi(output.image)) {
        leftBehind.add(build);
      }
    }

    for (const output of build.outputResources?.containers ?? []) {
      for (const image of output.imageUris ?? []) {
        if (!await deleteDockerImage(image)) {
          leftBehind.add(build);
        }
      }
    }
  }

  for (const build of builds) {
    if (!build.arn) {
      continue;
    }

    if (leftBehind.has(build)) {
      // keep it, so the next run can still find what we could not delete
      console.warn({
        notice: 'Keeping image build as not everything it produced could be deleted',
        build: build.arn,
      });
      continue;
    }

    if (!await deleteBuild(build.arn)) {
      leftBehind.add(build);
    }
  }

  if (leftBehind.size > 0) {
    throw new Error(`Failed to delete ${leftBehind.size} of ${builds.length} runner image builds. See the log for the error of each one.`);
  }
}

/**
 * Scheduled cleanup of one builder. Keeps the image that's in use, the newest few images, and anything that hasn't finished building.
 */
async function deleteOldResources(target: CleanerTarget) {
  if (!target.RecipeName) {
    console.warn({
      notice: 'No recipe name, nothing to clean up',
    });
    return;
  }

  let protectedAmi: string | undefined;
  if (target.LaunchTemplateId) {
    try {
      protectedAmi = await launchTemplateAmi(target.LaunchTemplateId);
    } catch (e) {
      // we can't tell which AMI is in use, so we leave everything alone and try again tomorrow
      console.warn({
        notice: 'Unable to read launch template, skipping cleanup so an AMI in use is not deleted',
        launchTemplate: target.LaunchTemplateId,
        error: e,
      });
      return;
    }
  }

  // unfinished builds may still be on their way to the launch template, so they are never deleted and never counted
  const finished = (await recipeBuilds(target.RecipeName)).filter(build => {
    if (build.state?.status && DELETABLE_IMAGE_STATUSES.includes(build.state.status)) {
      return true;
    }

    console.log({
      notice: 'Keeping build as it has not finished yet',
      build: build.arn,
      status: build.state?.status,
    });
    return false;
  });

  // newest first, so the newest few can be kept
  finished.sort((a, b) => buildDate(b) - buildDate(a));

  // remove any non-successful build + all successful builds after the first KEEP_IMAGES, but skip protectedAmi
  const successful = finished.filter(build => build.state?.status === 'AVAILABLE');
  const unsuccessful = finished.filter(build => build.state?.status !== 'AVAILABLE');
  const oldBuilds = unsuccessful.concat(successful.slice(KEEP_IMAGES)).filter(build => {
    if (protectedAmi && (build.outputResources?.amis ?? []).some(ami => ami.image === protectedAmi)) {
      console.log({
        notice: 'Keeping build as its AMI is used by the launch template',
        build: build.arn,
        image: protectedAmi,
      });
      return false;
    }

    return true;
  });

  console.log({
    notice: 'Deleting old images',
    recipe: target.RecipeName,
    found: finished.length,
    deleting: oldBuilds.length,
  });

  await deleteBuilds(oldBuilds);
}

/**
 * Name of the recipe that built a given image version, read off one of its builds.
 *
 * EC2 Image Builder names an image after the recipe that built it, and unlike the name inside the ARN this one keeps the original casing that the
 * ListImages filter needs. One page is enough, as every build of a version carries the same name.
 */
async function recipeOfImageVersion(imageVersionArn: string) {
  try {
    const builds = await ib.send(new ListImageBuildVersionsCommand({ imageVersionArn }));
    return builds.imageSummaryList?.find(build => build.name)?.name;
  } catch (e) {
    console.warn({
      notice: 'Failed to look up the recipe of an image version',
      image: imageVersionArn,
      error: e,
    });
    return undefined;
  }
}

/**
 * The builder is being removed, so nothing it built is in use anymore. Delete all of it, including the AMI of the launch template.
 *
 * Nothing else can get us here. The physical resource id never changes, so CloudFormation never replaces this resource, and a `Delete` can only mean
 * the builder is gone from the template or the stack is being deleted.
 */
async function deleteAllResources(target: CleanerTarget) {
  let recipeName = target.RecipeName;

  if (!recipeName) {
    // properties written by version 0.16.0 or below, which named the image version instead of the recipe. we get those for a builder removed by the
    // very deployment that upgrades, as its last successful template is still the old one.
    if (!target.ImageVersionArn) {
      console.warn({
        notice: 'Neither a recipe name nor an image version to clean up',
      });
      return;
    }

    recipeName = await recipeOfImageVersion(target.ImageVersionArn);
    if (!recipeName) {
      console.warn({
        notice: 'No builds left to tell us which recipe to clean up',
        image: target.ImageVersionArn,
      });
      return;
    }

    console.log({
      notice: 'Found the recipe of a builder last deployed by an older version of this construct',
      image: target.ImageVersionArn,
      recipe: recipeName,
    });
  }

  const builds = await recipeBuilds(recipeName);

  console.log({
    notice: 'Deleting all images',
    recipe: recipeName,
    deleting: builds.length,
  });

  await deleteBuilds(builds);
}

export async function handler(event: ScheduledCleanupEvent | AWSLambda.CloudFormationCustomResourceEvent, _context: AWSLambda.Context) {
  if (event.RequestType === 'Scheduled') {
    console.log({
      notice: 'Scheduled image cleanup request',
      ...event,
    });

    await deleteOldResources(event);
    return;
  }

  try {
    console.log({
      notice: 'CloudFormation custom resource request',
      ...event,
      ResponseURL: '...',
    });

    switch (event.RequestType) {
      case 'Create':
        await customResourceRespond(event, 'SUCCESS', 'OK', CLEANER_PHYSICAL_RESOURCE_ID, {});
        break;
      case 'Update':
        // echo the id back rather than returning our own, so it never changes -- not even on the deployment that upgrades from a version that used
        // the image version ARN as the id. a changed id is a replacement, and CloudFormation backs a replacement out by deleting the new physical
        // resource, which would have us delete every image of a builder that is still very much in use.
        await customResourceRespond(event, 'SUCCESS', 'OK', event.PhysicalResourceId, {});
        break;
      case 'Delete':
        // the id never changes, so a Delete can only mean this builder is going away
        await deleteAllResources(event.ResourceProperties as DeleteResourcesProps);
        await customResourceRespond(event, 'SUCCESS', 'OK', event.PhysicalResourceId, {});
        break;
    }
  } catch (e) {
    console.error({
      notice: 'Failed to delete Image Builder resources',
      error: e,
    });
    // never hand back an id other than the one we were given. a changed id is a replacement, and CloudFormation backs a replacement out by deleting
    // the new physical resource, which would have us delete every image of a builder that is still in use. a failed Create has no id yet, and the
    // constant below is the one a successful Create would have returned anyway, so its rollback still deletes whatever the failed create did build.
    const physicalResourceId = ('PhysicalResourceId' in event && event.PhysicalResourceId) || CLEANER_PHYSICAL_RESOURCE_ID;
    await customResourceRespond(event, 'FAILED', (e as Error).message || 'Internal Error', physicalResourceId, {});
  }
}
