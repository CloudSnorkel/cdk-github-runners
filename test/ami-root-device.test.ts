import * as AWSLambda from 'aws-lambda';

// Mock AWS SDK clients before importing the handler
const mockSsmSend = jest.fn();
const mockEc2Send = jest.fn();

jest.mock('@aws-sdk/client-ssm', () => {
  const actual = jest.requireActual('@aws-sdk/client-ssm');
  return {
    ...actual,
    SSMClient: jest.fn().mockImplementation(() => ({
      send: mockSsmSend,
    })),
  };
});

jest.mock('@aws-sdk/client-ec2', () => {
  const actual = jest.requireActual('@aws-sdk/client-ec2');
  return {
    ...actual,
    EC2Client: jest.fn().mockImplementation(() => ({
      send: mockEc2Send,
    })),
  };
});

jest.mock('../src/lambda-helpers', () => ({
  customResourceRespond: jest.fn().mockResolvedValue(undefined),
}));

// Import handler after mocks are set up
import * as handler from '../src/providers/ami-root-device.lambda';
import { customResourceRespond } from '../src/lambda-helpers';

beforeEach(() => {
  jest.clearAllMocks();
});

const createEvent = (
  requestType: 'Create' | 'Update' | 'Delete',
  ami: string,
): AWSLambda.CloudFormationCustomResourceEvent => ({
  RequestType: requestType,
  ResponseURL: 'https://example.com',
  StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test/123',
  RequestId: 'test-request-id',
  ResourceType: 'Custom::AmiRootDevice',
  LogicalResourceId: 'TestResource',
  PhysicalResourceId: requestType === 'Delete' ? 'test-physical-id' : undefined,
  ResourceProperties: {
    Ami: ami,
  },
  ServiceToken: 'arn:aws:lambda:us-east-1:123456789012:function:test',
});

const createContext = (): AWSLambda.Context => ({
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test-function',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
  memoryLimitInMB: '128',
  awsRequestId: 'test-request-id',
  logGroupName: '/aws/lambda/test',
  logStreamName: '2024/01/01/[$LATEST]test',
  getRemainingTimeInMillis: () => 30000,
  done: jest.fn(),
  fail: jest.fn(),
  succeed: jest.fn(),
});

describe('ami-root-device Lambda handler', () => {
  describe('SSM parameter handling', () => {
    test('handles ssm: prefix with parameter name', async () => {
      const amiId = 'ami-12345678';
      const rootDevice = '/dev/xvda';

      mockSsmSend.mockResolvedValueOnce({
        Parameter: {
          Value: amiId,
        },
      });

      mockEc2Send.mockResolvedValueOnce({
        Images: [
          {
            RootDeviceName: rootDevice,
          },
        ],
      });

      const event = createEvent('Create', 'ssm:/aws/service/ami/amazon-linux-2023');
      const context = createContext();

      await handler.handler(event, context);

      expect(mockSsmSend).toHaveBeenCalledTimes(1);
      expect(mockSsmSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Name: '/aws/service/ami/amazon-linux-2023',
          }),
        }),
      );

      expect(mockEc2Send).toHaveBeenCalledTimes(1);
      expect(mockEc2Send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            ImageIds: [amiId],
          },
        }),
      );
    });

    test('handles ssm: prefix with ARN and extracts parameter name correctly', async () => {
      const amiId = 'ami-12345678';
      const rootDevice = '/dev/xvda';
      const ssmArn = 'arn:aws:ssm:us-east-1:123456789012:parameter/my-parameter/name';

      mockSsmSend.mockResolvedValueOnce({
        Parameter: {
          Value: amiId,
        },
      });

      mockEc2Send.mockResolvedValueOnce({
        Images: [
          {
            RootDeviceName: rootDevice,
          },
        ],
      });

      const event = createEvent('Create', `ssm:${ssmArn}`);
      const context = createContext();

      await handler.handler(event, context);

      expect(mockSsmSend).toHaveBeenCalledTimes(1);
      // Should extract 'my-parameter/name' from the ARN
      expect(mockSsmSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Name: 'my-parameter/name',
          }),
        }),
      );

      expect(mockEc2Send).toHaveBeenCalledTimes(1);
      expect(mockEc2Send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            ImageIds: [amiId],
          },
        }),
      );
    });

    test('handles ssm: prefix with ARN containing nested parameter path', async () => {
      const amiId = 'ami-12345678';
      const rootDevice = '/dev/xvda';
      const ssmArn = 'arn:aws:ssm:us-east-1:123456789012:parameter/aws/service/ami/amazon-linux-2023';

      mockSsmSend.mockResolvedValueOnce({
        Parameter: {
          Value: amiId,
        },
      });

      mockEc2Send.mockResolvedValueOnce({
        Images: [
          {
            RootDeviceName: rootDevice,
          },
        ],
      });

      const event = createEvent('Create', `ssm:${ssmArn}`);
      const context = createContext();

      await handler.handler(event, context);

      expect(mockSsmSend).toHaveBeenCalledTimes(1);
      // Should extract 'aws/service/ami/amazon-linux-2023' from the ARN
      expect(mockSsmSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Name: 'aws/service/ami/amazon-linux-2023',
          }),
        }),
      );
    });

    test('handles error when SSM parameter has no value', async () => {
      mockSsmSend.mockResolvedValueOnce({
        Parameter: undefined,
      });

      const event = createEvent('Create', 'ssm:/aws/service/ami/amazon-linux-2023');
      const context = createContext();

      await handler.handler(event, context);

      expect(mockSsmSend).toHaveBeenCalledTimes(1);
      expect(customResourceRespond).toHaveBeenCalledWith(
        event,
        'FAILED',
        'ssm:/aws/service/ami/amazon-linux-2023 has no value',
        'ERROR',
        {},
      );
      expect(mockEc2Send).not.toHaveBeenCalled();
    });

    test('handles error when SSM parameter value is empty string', async () => {
      mockSsmSend.mockResolvedValueOnce({
        Parameter: {
          Value: '',
        },
      });

      const event = createEvent('Create', 'ssm:/aws/service/ami/amazon-linux-2023');
      const context = createContext();

      await handler.handler(event, context);

      expect(mockSsmSend).toHaveBeenCalledTimes(1);
      expect(customResourceRespond).toHaveBeenCalledWith(
        event,
        'FAILED',
        'ssm:/aws/service/ami/amazon-linux-2023 has no value',
        'ERROR',
        {},
      );
      expect(mockEc2Send).not.toHaveBeenCalled();
    });

    test('handles ARN with single-level parameter name', async () => {
      const amiId = 'ami-12345678';
      const rootDevice = '/dev/xvda';
      const ssmArn = 'arn:aws:ssm:us-east-1:123456789012:parameter/my-parameter';

      mockSsmSend.mockResolvedValueOnce({
        Parameter: {
          Value: amiId,
        },
      });

      mockEc2Send.mockResolvedValueOnce({
        Images: [
          {
            RootDeviceName: rootDevice,
          },
        ],
      });

      const event = createEvent('Create', `ssm:${ssmArn}`);
      const context = createContext();

      await handler.handler(event, context);

      expect(mockSsmSend).toHaveBeenCalledTimes(1);
      // Should extract 'my-parameter' from the ARN
      expect(mockSsmSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Name: 'my-parameter',
          }),
        }),
      );
    });
  });
});
