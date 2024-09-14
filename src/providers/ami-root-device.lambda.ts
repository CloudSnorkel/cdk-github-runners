import { DescribeImagesCommand, DescribeLaunchTemplateVersionsCommand, EC2Client } from '@aws-sdk/client-ec2';
import { GetImageCommand, ImagebuilderClient } from '@aws-sdk/client-imagebuilder';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import * as AWSLambda from 'aws-lambda';
import { customResourceRespond } from '../lambda-helpers';

const ssm = new SSMClient();
const ec2 = new EC2Client();
const ib = new ImagebuilderClient();


async function handleAmi(event: AWSLambda.CloudFormationCustomResourceEvent, ami: string) {
  const imageDescs = (await ec2.send(new DescribeImagesCommand({ ImageIds: [ami] })));
  if (imageDescs.Images?.length !== 1) {
    await customResourceRespond(event, 'FAILED', `${ami} doesn't exist`, 'ERROR', {});
    return;
  }

  const rootDevice = imageDescs.Images[0].RootDeviceName;
  if (!rootDevice) {
    await customResourceRespond(event, 'FAILED', `${ami} has no root device`, 'ERROR', {});
    return;
  }

  console.log(`Root device for ${ami} is ${rootDevice}`);

  await customResourceRespond(event, 'SUCCESS', 'OK', rootDevice, {});
  return;
}


export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent, context: AWSLambda.Context) {
  try {
    console.log({ ...event, ResponseURL: '...' });

    const ami = event.ResourceProperties.Ami as string;

    switch (event.RequestType) {
      case 'Create':
      case 'Update':
        if (ami.startsWith('ami-')) {
          console.log(`Checking AMI ${ami}`);

          await handleAmi(event, ami);
          break;
        }

        if (ami.startsWith('resolve:ssm:')) {
          const ssmParam = ami.substring('resolve:ssm:'.length);
          console.log(`Checking SSM ${ssmParam}`);

          const ssmValue = (await ssm.send(new GetParameterCommand({ Name: ssmParam }))).Parameter?.Value;
          if (!ssmValue) {
            await customResourceRespond(event, 'FAILED', `${ami} has no value`, 'ERROR', {});
            break;
          }

          await handleAmi(event, ssmValue);
          break;
        }

        if (ami.startsWith('lt-')) {
          console.log(`Checking Launch Template ${ami}`);

          const lts = await ec2.send(new DescribeLaunchTemplateVersionsCommand({ LaunchTemplateId: ami, Versions: ['$Latest'] }));
          if (lts.LaunchTemplateVersions?.length !== 1) {
            await customResourceRespond(event, 'FAILED', `${ami} doesn't exist`, 'ERROR', {});
            break;
          }

          if (!lts.LaunchTemplateVersions[0].LaunchTemplateData?.ImageId) {
            await customResourceRespond(event, 'FAILED', `${ami} doesn't have an AMI`, 'ERROR', {});
            break;
          }

          await handleAmi(event, lts.LaunchTemplateVersions[0].LaunchTemplateData.ImageId);
          break;
        }

        if (ami.match('^arn:aws[^:]*:imagebuilder:[^:]+:[^:]+:image/.*$')) {
          console.log(`Checking Image Builder ${ami}`);

          const img = await ib.send(new GetImageCommand({ imageBuildVersionArn: ami }));
          const actualAmi = img.image?.outputResources?.amis?.[0]?.image;
          if (!actualAmi) {
            await customResourceRespond(event, 'FAILED', `${ami} doesn't have an AMI`, 'ERROR', {});
            break;
          }

          await handleAmi(event, actualAmi);
          break;
        }

        await customResourceRespond(event, 'FAILED', `Unknown type of AMI ${ami}`, 'ERROR', {});
        break;
      case 'Delete':
        console.log('Nothing to delete');
        await customResourceRespond(event, 'SUCCESS', 'OK', event.PhysicalResourceId, {});
        break;
    }
  } catch (e) {
    console.error(e);
    await customResourceRespond(event, 'FAILED', (e as Error).message || 'Internal Error', context.logStreamName, {});
  }
}
