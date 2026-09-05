// Mock AWS SDK clients before importing the handler
const mockEc2Send = jest.fn();
const mockEcrSend = jest.fn();
const mockIbSend = jest.fn();

jest.mock('@aws-sdk/client-ec2', () => {
  const actual = jest.requireActual('@aws-sdk/client-ec2');
  return {
    ...actual,
    EC2Client: jest.fn().mockImplementation(() => ({ send: mockEc2Send })),
  };
});

jest.mock('@aws-sdk/client-ecr', () => {
  const actual = jest.requireActual('@aws-sdk/client-ecr');
  return {
    ...actual,
    ECRClient: jest.fn().mockImplementation(() => ({ send: mockEcrSend })),
  };
});

jest.mock('@aws-sdk/client-imagebuilder', () => {
  const actual = jest.requireActual('@aws-sdk/client-imagebuilder');
  return {
    ...actual,
    ImagebuilderClient: jest.fn().mockImplementation(() => ({ send: mockIbSend })),
  };
});

const mockRespond = jest.fn();

jest.mock('../src/lambda-helpers', () => ({
  customResourceRespond: (...args: unknown[]) => mockRespond(...args),
}));

// Import after mocks are set up
import {
  DeregisterImageCommand,
  DescribeImagesCommand,
  DescribeLaunchTemplateVersionsCommand,
} from '@aws-sdk/client-ec2';
import { BatchDeleteImageCommand } from '@aws-sdk/client-ecr';
import { DeleteImageCommand, ImageSummary, ListImageBuildVersionsCommand, ListImagesCommand } from '@aws-sdk/client-imagebuilder';
import * as AWSLambda from 'aws-lambda';
import { CLEANER_PHYSICAL_RESOURCE_ID, handler } from '../src/image-builders/aws-image-builder/delete-resources.lambda';

const RECIPE = 'github-runners-test-Builder-AmiRecipe-1234ABCD';
const REPO = '123456789012.dkr.ecr.us-east-1.amazonaws.com/github-runners-test-repo';

function build(name: string, daysAgo: number, opts: { ami?: string; tags?: string[]; status?: string } = {}): ImageSummary {
  return {
    arn: `arn:aws:imagebuilder:us-east-1:123456789012:image/${RECIPE.toLowerCase()}/1.0.0/${name}`,
    name: RECIPE,
    dateCreated: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    state: { status: opts.status ?? 'AVAILABLE' },
    outputResources: {
      amis: opts.ami ? [{ image: opts.ami }] : undefined,
      containers: opts.tags ? [{ imageUris: opts.tags.map(t => `${REPO}:${t}`) }] : undefined,
    },
  };
}

/**
 * Have Image Builder return all given builds under a single image version, and EC2 return every AMI as existing.
 */
function setupBuilds(builds: ImageSummary[], defaultAmi?: string) {
  mockIbSend.mockImplementation(async (command: any) => {
    if (command instanceof ListImagesCommand) {
      return { imageVersionList: [{ arn: `arn:aws:imagebuilder:us-east-1:123456789012:image/${RECIPE.toLowerCase()}/1.0.0` }] };
    }
    if (command instanceof ListImageBuildVersionsCommand) {
      return { imageSummaryList: builds };
    }
    if (command instanceof DeleteImageCommand) {
      return {};
    }
    throw new Error(`Unexpected Image Builder command ${command.constructor.name}`);
  });

  mockEc2Send.mockImplementation(async (command: any) => {
    if (command instanceof DescribeLaunchTemplateVersionsCommand) {
      return { LaunchTemplateVersions: [{ LaunchTemplateData: { ImageId: defaultAmi } }] };
    }
    if (command instanceof DescribeImagesCommand) {
      return { Images: [{ ImageId: command.input.ImageIds[0] }] };
    }
    if (command instanceof DeregisterImageCommand) {
      return {};
    }
    throw new Error(`Unexpected EC2 command ${command.constructor.name}`);
  });

  mockEcrSend.mockImplementation(async () => ({}));
}

function deletedAmis() {
  return mockEc2Send.mock.calls
    .map(c => c[0])
    .filter(c => c instanceof DeregisterImageCommand)
    .map(c => c.input.ImageId);
}

function deletedTags() {
  return mockEcrSend.mock.calls
    .map(c => c[0])
    .filter(c => c instanceof BatchDeleteImageCommand)
    .map(c => c.input.imageIds[0].imageTag);
}

function deletedBuilds() {
  return mockIbSend.mock.calls
    .map(c => c[0])
    .filter(c => c instanceof DeleteImageCommand)
    .map(c => c.input.imageBuildVersionArn);
}

const context = {} as AWSLambda.Context;

const LEGACY_PHYSICAL_ID = `arn:aws:imagebuilder:us-east-1:123456789012:image/${RECIPE.toLowerCase()}/1.0.3`;

function customResourceEvent(requestType: 'Create' | 'Update' | 'Delete', physicalResourceId?: string) {
  return {
    RequestType: requestType,
    PhysicalResourceId: physicalResourceId,
    ResponseURL: 'https://example.com/',
    StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test/1234',
    RequestId: 'req',
    LogicalResourceId: 'Cleaner',
    ResourceType: 'Custom::ImageBuilder-Delete-Resources',
    ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:cleaner',
    ResourceProperties: {
      ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:cleaner',
      RecipeName: RECIPE,
      LaunchTemplateId: 'lt-1234',
    },
  } as unknown as AWSLambda.CloudFormationCustomResourceEvent;
}

/**
 * A cleaner deployed by an older version of this construct: the image version ARN as its physical id, and no recipe name in its properties.
 */
function legacyCustomResourceEvent(requestType: 'Update' | 'Delete') {
  const event = customResourceEvent(requestType, LEGACY_PHYSICAL_ID) as any;
  event.ResourceProperties = {
    ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:cleaner',
    ImageVersionArn: LEGACY_PHYSICAL_ID,
  };
  return event as AWSLambda.CloudFormationCustomResourceEvent;
}

function scheduledEvent(launchTemplateId?: string) {
  return {
    RequestType: 'Scheduled' as const,
    RecipeName: RECIPE,
    LaunchTemplateId: launchTemplateId,
  };
}

describe('Image cleaner custom resource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('create returns a constant physical resource id so CloudFormation never replaces it', async () => {
    await handler(customResourceEvent('Create'), context);

    expect(mockRespond).toHaveBeenCalledWith(expect.anything(), 'SUCCESS', 'OK', CLEANER_PHYSICAL_RESOURCE_ID, {});
  });

  test('update keeps the physical resource id it was given and deletes nothing', async () => {
    setupBuilds([build('old', 30, { ami: 'ami-old' })]);

    await handler(customResourceEvent('Update', CLEANER_PHYSICAL_RESOURCE_ID), context);

    expect(mockRespond).toHaveBeenCalledWith(expect.anything(), 'SUCCESS', 'OK', CLEANER_PHYSICAL_RESOURCE_ID, {});
    expect(deletedAmis()).toEqual([]);
    expect(deletedBuilds()).toEqual([]);
  });

  test('upgrading an older deployment does not change the physical resource id', async () => {
    setupBuilds([build('old', 30, { ami: 'ami-old' })]);

    // the properties are the new ones, the physical id is the image version ARN the old version handed out
    await handler(customResourceEvent('Update', LEGACY_PHYSICAL_ID), context);

    // returning anything else here would be a replacement, and a rollback would then delete every image of a builder still in use
    expect(mockRespond).toHaveBeenCalledWith(expect.anything(), 'SUCCESS', 'OK', LEGACY_PHYSICAL_ID, {});
    expect(deletedAmis()).toEqual([]);
    expect(deletedBuilds()).toEqual([]);
  });

  test('delete of an upgraded resource removes everything even though its id is still the old one', async () => {
    setupBuilds([
      build('newest', 0, { ami: 'ami-in-use' }),
      build('older', 10, { ami: 'ami-old' }),
    ], 'ami-in-use');

    await handler(customResourceEvent('Delete', LEGACY_PHYSICAL_ID), context);

    expect(deletedAmis()).toEqual(['ami-in-use', 'ami-old']);
    expect(mockRespond).toHaveBeenCalledWith(expect.anything(), 'SUCCESS', 'OK', LEGACY_PHYSICAL_ID, {});
  });

  test('delete removes everything, including the AMI in use and the latest tag', async () => {
    setupBuilds([
      build('newest', 0, { ami: 'ami-in-use', tags: ['latest', '1.0.2-1'] }),
      build('older', 10, { ami: 'ami-old' }),
    ], 'ami-in-use');

    await handler(customResourceEvent('Delete', CLEANER_PHYSICAL_RESOURCE_ID), context);

    expect(deletedAmis()).toEqual(['ami-in-use', 'ami-old']);
    expect(deletedTags()).toEqual(['latest', '1.0.2-1']);
    expect(deletedBuilds()).toHaveLength(2);
    expect(mockRespond).toHaveBeenCalledWith(expect.anything(), 'SUCCESS', 'OK', CLEANER_PHYSICAL_RESOURCE_ID, {});
  });

  test('delete of a builder removed by the upgrade itself finds the recipe from the image version', async () => {
    setupBuilds([
      build('newest', 0, { ami: 'ami-in-use', tags: ['latest'] }),
      build('older', 10, { ami: 'ami-old' }),
    ], 'ami-in-use');

    // new code, but CloudFormation hands us the properties of the last template that deployed successfully, which is the old one
    await handler(legacyCustomResourceEvent('Delete'), context);

    // the recipe name comes off the builds of the image version, with the casing the ListImages filter needs
    const listImages = mockIbSend.mock.calls.map(c => c[0]).find(c => c instanceof ListImagesCommand);
    expect(listImages.input.filters).toEqual([{ name: 'name', values: [RECIPE] }]);

    expect(deletedAmis()).toEqual(['ami-in-use', 'ami-old']);
    expect(deletedTags()).toEqual(['latest']);
    expect(mockRespond).toHaveBeenCalledWith(expect.anything(), 'SUCCESS', 'OK', LEGACY_PHYSICAL_ID, {});
  });

  test('delete of a builder whose image version has no builds left deletes nothing', async () => {
    setupBuilds([build('newest', 0, { ami: 'ami-in-use' })], 'ami-in-use');
    mockIbSend.mockImplementation(async (command: any) => {
      if (command instanceof ListImageBuildVersionsCommand) {
        return { imageSummaryList: [] };
      }
      throw new Error(`Unexpected Image Builder command ${command.constructor.name}`);
    });

    await handler(legacyCustomResourceEvent('Delete'), context);

    expect(deletedAmis()).toEqual([]);
    expect(deletedBuilds()).toEqual([]);
    expect(mockRespond).toHaveBeenCalledWith(expect.anything(), 'SUCCESS', 'OK', LEGACY_PHYSICAL_ID, {});
  });

  test('a failed update keeps the physical resource id it was given', async () => {
    setupBuilds([build('old', 30, { ami: 'ami-old' })]);
    mockRespond.mockRejectedValueOnce(new Error('could not reach the response URL'));

    await handler(customResourceEvent('Update', CLEANER_PHYSICAL_RESOURCE_ID), context);

    // a different id would be a replacement, and rolling one back deletes the new physical resource -- every image of a builder still in use
    expect(mockRespond).toHaveBeenLastCalledWith(expect.anything(), 'FAILED', expect.anything(), CLEANER_PHYSICAL_RESOURCE_ID, {});
  });

  test('a failed create falls back to the id a successful one would have returned', async () => {
    setupBuilds([]);
    mockRespond.mockRejectedValueOnce(new Error('could not reach the response URL'));

    // there is no physical resource id yet, and the rollback still has to delete whatever the failed create managed to build
    await handler(customResourceEvent('Create'), context);

    expect(mockRespond).toHaveBeenLastCalledWith(expect.anything(), 'FAILED', expect.anything(), CLEANER_PHYSICAL_RESOURCE_ID, {});
  });

  test('delete with neither a recipe name nor an image version deletes nothing', async () => {
    setupBuilds([build('newest', 0, { ami: 'ami-in-use' })], 'ami-in-use');

    const event = customResourceEvent('Delete', CLEANER_PHYSICAL_RESOURCE_ID) as any;
    event.ResourceProperties = { ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:cleaner' };

    await handler(event, context);

    expect(deletedAmis()).toEqual([]);
    expect(deletedBuilds()).toEqual([]);
  });
});

describe('Image cleaner schedule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('keeps the AMI used by the launch template, the newest images, and unfinished builds', async () => {
    setupBuilds([
      build('building', 0, { status: 'BUILDING' }),
      build('newest', 1, { ami: 'ami-newest' }),
      build('second', 2, { ami: 'ami-second' }),
      build('in-use', 3, { ami: 'ami-in-use' }),
      build('oldest', 4, { ami: 'ami-oldest' }),
    ], 'ami-in-use');

    await handler(scheduledEvent('lt-1234'), context);

    expect(deletedAmis()).toEqual(['ami-oldest']);
    expect(deletedBuilds()).toEqual([expect.stringContaining('/oldest')]);
  });

  test('builds that produced no image do not take up the slots of the ones we keep to fall back on', async () => {
    setupBuilds([
      build('failed-today', 0, { status: 'FAILED' }),
      build('failed-yesterday', 1, { status: 'FAILED' }),
      build('newest', 2, { ami: 'ami-newest' }),
      build('second', 3, { ami: 'ami-second' }),
      build('oldest', 4, { ami: 'ami-oldest' }),
    ]);

    await handler(scheduledEvent(), context);

    // both fallbacks survive two days of failures, and only the third image goes
    expect(deletedAmis()).toEqual(['ami-oldest']);
    expect(deletedBuilds()).toEqual([
      expect.stringContaining('/failed-today'),
      expect.stringContaining('/failed-yesterday'),
      expect.stringContaining('/oldest'),
    ]);
  });

  test('builds that produced no image are deleted however new they are', async () => {
    setupBuilds([
      build('newest', 0, { ami: 'ami-newest' }),
      build('second', 1, { ami: 'ami-second' }),
      build('failed', 2, { status: 'FAILED' }),
      build('cancelled', 3, { status: 'CANCELLED' }),
      build('deprecated', 4, { ami: 'ami-deprecated', status: 'DEPRECATED' }),
    ]);

    await handler(scheduledEvent(), context);

    // there is nothing to fall back on in any of them, and the logs and the failure notification are not ours to keep
    expect(deletedAmis()).toEqual(['ami-deprecated']);
    expect(deletedBuilds()).toEqual([
      expect.stringContaining('/failed'),
      expect.stringContaining('/cancelled'),
      expect.stringContaining('/deprecated'),
    ]);
  });

  test('keeps a deprecated build whose AMI is the one in use', async () => {
    setupBuilds([
      build('newest', 0, { ami: 'ami-newest' }),
      build('second', 1, { ami: 'ami-second' }),
      build('deprecated-in-use', 2, { ami: 'ami-in-use', status: 'DEPRECATED' }),
    ], 'ami-in-use');

    await handler(scheduledEvent('lt-1234'), context);

    // deprecating an image does not take it out of the launch template, and runners are still starting from it
    expect(deletedAmis()).toEqual([]);
    expect(deletedBuilds()).toEqual([]);
  });

  test('keeps the latest Docker tag but deletes the versioned tags of old images', async () => {
    setupBuilds([
      build('newest', 1, { tags: ['latest', '1.0.4-1'] }),
      build('second', 2, { tags: ['1.0.3-1'] }),
      build('third', 3, { tags: ['latest', '1.0.2-1'] }),
    ]);

    await handler(scheduledEvent(), context);

    expect(deletedTags()).toEqual(['1.0.2-1']);
    expect(deletedBuilds()).toEqual([expect.stringContaining('/third')]);
  });

  test('deletes nothing when the launch template cannot be read', async () => {
    setupBuilds([
      build('newest', 1, { ami: 'ami-newest' }),
      build('second', 2, { ami: 'ami-second' }),
      build('oldest', 3, { ami: 'ami-oldest' }),
    ], 'ami-newest');

    mockEc2Send.mockImplementation(async (command: any) => {
      if (command instanceof DescribeLaunchTemplateVersionsCommand) {
        throw Object.assign(new Error('Rate exceeded'), { name: 'RequestLimitExceeded' });
      }
      throw new Error(`Unexpected EC2 command ${command.constructor.name}`);
    });

    await handler(scheduledEvent('lt-1234'), context);

    expect(deletedAmis()).toEqual([]);
    expect(deletedBuilds()).toEqual([]);
  });

  test('cleans up when the launch template is gone for good', async () => {
    setupBuilds([
      build('newest', 1, { ami: 'ami-newest' }),
      build('second', 2, { ami: 'ami-second' }),
      build('oldest', 3, { ami: 'ami-oldest' }),
    ]);

    const describeImages = mockEc2Send.getMockImplementation()!;
    mockEc2Send.mockImplementation(async (command: any) => {
      if (command instanceof DescribeLaunchTemplateVersionsCommand) {
        throw Object.assign(new Error('gone'), { name: 'InvalidLaunchTemplateId.NotFound' });
      }
      return describeImages(command);
    });

    await handler(scheduledEvent('lt-1234'), context);

    expect(deletedAmis()).toEqual(['ami-oldest']);
  });

  test('deletes Image Builder resources after the images they point at', async () => {
    setupBuilds([
      build('newest', 1, { ami: 'ami-newest' }),
      build('second', 2, { ami: 'ami-second' }),
      build('oldest', 3, { ami: 'ami-oldest' }),
    ]);

    await handler(scheduledEvent(), context);

    expect(deletedBuilds()).toEqual([expect.stringContaining('/oldest')]);
    expect(deletedAmis()).toEqual(['ami-oldest']);
  });

  test('lists deprecated image versions too', async () => {
    setupBuilds([build('newest', 1, { ami: 'ami-newest' })]);

    await handler(scheduledEvent(), context);

    const listImages = mockIbSend.mock.calls.map(c => c[0]).find(c => c instanceof ListImagesCommand);
    expect(listImages.input).toMatchObject({
      owner: 'Self',
      includeDeprecated: true,
      filters: [{ name: 'name', values: [RECIPE] }],
    });
  });
});
