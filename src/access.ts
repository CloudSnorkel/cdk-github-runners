import { execFileSync } from 'child_process';
import { aws_apigateway as apigateway, aws_ec2 as ec2, aws_lambda as lambda } from 'aws-cdk-lib';
import { PolicyDocument } from 'aws-cdk-lib/aws-iam';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';


export interface ApiGatewayAccessProps {
  /**
   * List of IP addresses that are allowed to access the API Gateway. If not specified, all IP addresses are allowed.
   */
  readonly allowedIps?: string[];

  /**
   * List of VPCs that are allowed to access the API Gateway. If not specified, all VPCs are allowed.
   */
  readonly allowedVpcs?: ec2.IVpc[];
}


export abstract class LambdaAccess {
  /**
   * Disables access to the configured Lambda function. This is useful for the setup function after setup is done.
   */
  static noAccess() {
    return new NoAccess();
  }

  /**
   * Provide access using Lambda URL. This is the default and simplest option. It puts no limits on the requester, but the Lambda functions themselves authenticate every request.
   */
  static lambdaUrl() {
    return new LambdaUrl();
  }

  /**
   * Provide access using API Gateway. This is the most secure option, but requires additional configuration. It allows you to limit access to specific IP addresses and even to a specific VPC.
   *
   * To limit access to GitHub.com use:
   *
   * ```
   * LambdaAccess.apiGateway({
   *   allowedIps: LambdaAccess.githubWebhookIps(),
   * });
   * ```
   *
   * Alternatively, get and manually update the list manually with:
   *
   * ```
   * curl https://api.github.com/meta | jq .hooks
   * ```
   */
  static apiGateway(props?: ApiGatewayAccessProps) {
    return new ApiGateway(props);
  }

  /**
   * Downloads the list of IP addresses used by GitHub.com for webhooks.
   *
   * Note that downloading dynamic data during deployment is not recommended in CDK. This is a workaround for the lack of a better solution.
   */
  static githubWebhookIps(): string[] {
    const githubMeta = execFileSync('curl', ['https://api.github.com/meta']).toString();
    const githubMetaJson = JSON.parse(githubMeta);
    return githubMetaJson.hooks;
  }

  /**
   * Creates all required resources and returns access URL or empty string if disabled.
   *
   * @internal
   */
  public abstract _bind(construct: Construct, id: string, lambdaFunction: lambda.Function): string;
}

class NoAccess extends LambdaAccess {
  public _bind(_construct: Construct, _id: string, _lambdaFunction: lambda.Function): string {
    return '';
  }
}

class LambdaUrl extends LambdaAccess {
  public _bind(_construct: Construct, _id: string, lambdaFunction: lambda.Function): string {
    return lambdaFunction.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
    }).url;
  }
}
class ApiGateway {
  constructor(private readonly props?: ApiGatewayAccessProps) {}

  public _bind(scope: Construct, id: string, lambdaFunction: lambda.Function): string {
    const api = new apigateway.LambdaRestApi(scope, id, {
      handler: lambdaFunction,
      proxy: true,
      cloudWatchRole: false,
      policy: PolicyDocument.fromJson({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: '*',
            Action: 'execute-api:Invoke',
            Resource: 'execute-api:/*/*/*',
            Condition: {
              IpAddress: {
                'aws:SourceIp': this.props?.allowedIps ?? ['0.0.0.0/0'],
              },
            },
          },
        ],
      }),
    });
    api.node.tryRemoveChild('Endpoint'); // remove CfnOutput
    // TODO vpce, aws:SourceVpce, security group, https://gist.github.com/skorfmann/6941326b2dd75f52cb67e1853c5f8601
    // TODO endpointTypes: this.props?.allowedVpcs ? [apigateway.EndpointType.PRIVATE] : undefined,
    return api.url;
  }
}


