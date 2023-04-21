/* eslint-disable-next-line import/no-extraneous-dependencies,import/no-unresolved */
import * as AWSLambda from 'aws-lambda';
/* eslint-disable-next-line import/no-extraneous-dependencies */
import * as AWS from 'aws-sdk';

interface ReaperInput {
  /**
   * Recipe/image name.
   */
  RecipeName: string;
}

const ec2 = new AWS.EC2();
const ecr = new AWS.ECR();
const ib = new AWS.Imagebuilder();

async function iterateImageVersions(imageName: string) {
  let result: string[] = [];

  let params: AWS.Imagebuilder.ListImagesRequest = {
    owner: 'Self',
    filters: [
      {
        name: 'name',
        values: [imageName],
      },
    ],
  };

  while (true) {
    const response = await ib.listImages(params).promise();

    if (response.imageVersionList) {
      for (const imageVersion of response.imageVersionList) {
        if (imageVersion.arn) {
          result.push(imageVersion.arn);
        }
      }
    }

    if (!response.nextToken) {
      break;
    }
    params.nextToken = response.nextToken;
  }

  return result;
}

async function iterateImageBuildVersions(imageVersionArn: string) {
  let result: AWS.Imagebuilder.ImageSummary[] = [];

  let params: AWS.Imagebuilder.ListImageBuildVersionsRequest = {
    imageVersionArn: imageVersionArn,
  };

  while (true) {
    const response = await ib.listImageBuildVersions(params).promise();

    if (response.imageSummaryList) {
      for (const imageBuildVersion of response.imageSummaryList) {
        if (imageBuildVersion.state?.status !== 'AVAILABLE') {
          // if it's not available, then it's still being created
          console.log(`${imageBuildVersion.arn} is still being created, so we can't delete it`);
          continue;
        }

        result.push(imageBuildVersion);
      }
    }

    if (!response.nextToken) {
      break;
    }
    params.nextToken = response.nextToken;
  }

  return result;
}

async function amisGone(amis?: AWS.Imagebuilder.AmiList) {
  if (!amis) {
    console.log('No AMIs found, so we can delete the image version build');
    return true;
  }

  for (const ami of amis) {
    console.log(`Checking if ${ami.image} exists`);

    if (!ami.image) {
      // no image? delete it
      console.log('No AMI, so we can delete it');
      continue;
    }

    try {
      const response = await ec2.describeImages({
        ImageIds: [ami.image],
      }).promise();

      if (response.Images?.length ?? 0 > 0) {
        // image still available
        console.log('AMI still available, so we can\'t delete it');
        return false;
      }
    } catch (e: any) {
      if (e.code != 'InvalidAMIID.NotFound') {
        // unknown exception, keep image for now
        console.error(`Unknown exception while checking if ${ami.image} exists:`, e);
        return false;
      }
    }
  }

  console.log('All AMIs are gone, so we can delete the image version build');

  return true;
}

async function dockerImagesGone(dockerImages?: AWS.Imagebuilder.ContainerList) {
  if (!dockerImages) {
    console.log('No docker images, so we can delete the image version build');
    return true;
  }

  for (const images of dockerImages) {
    for (const image of images.imageUris ?? []) {
      const [repo, version] = image.split(':', 2);
      const [_, repoName] = repo.split('/', 2);

      if (version === 'latest') {
        // don't check latest as image builder sometimes keeps that tag on forever
        // we want to check if the image is still tagged as latest in ECR, not Image Builder
        continue;
      }

      console.log(`Checking if ${repoName}:${version} exists`);

      try {
        const response = await ecr.describeImages({
          repositoryName: repoName,
          imageIds: [{ imageTag: version }],
        }).promise();

        if (response.imageDetails && response.imageDetails.length > 0) {
          // image still available
          if (response.imageDetails[0].imageTags?.includes('latest')) {
            console.log(`Docker image ${repoName}:${version} still available and tagged latest, so we can't delete it`);
            return false;
          }
        }
      } catch (e: any) {
        if (e.code != 'RepositoryNotFoundException' && e.code != 'ImageNotFoundException') {
          // unknown exception, keep image for now
          console.error(`Unknown exception while checking if ${repoName}:${version} exists:`, e);
          return false;
        }
      }
    }
  }

  console.log('All Docker images are gone, so we can delete the image version build');

  return true;
}

/* eslint-disable @typescript-eslint/no-require-imports, import/no-extraneous-dependencies */
exports.handler = async function (event: ReaperInput, _context: AWSLambda.Context) {
  for (const imageVersion of await iterateImageVersions(event.RecipeName)) {
    for (const imageBuildVersion of await iterateImageBuildVersions(imageVersion)) {
      if (!imageBuildVersion.arn) {
        continue;
      }

      console.log(`Checking ${imageBuildVersion.name}/${imageBuildVersion.version}`);

      if (await amisGone(imageBuildVersion.outputResources?.amis) && await dockerImagesGone(imageBuildVersion.outputResources?.containers)) {
        console.log('Deleting image version build', imageBuildVersion.arn);
        await ib.deleteImage({
          imageBuildVersionArn: imageBuildVersion.arn,
        }).promise();
      }
    }
  }
};
