import { execFileSync } from 'child_process';
import * as cdk from 'aws-cdk-lib';
import { aws_apigateway as apigateway, aws_ec2 as ec2, aws_iam as iam, aws_lambda as lambda } from 'aws-cdk-lib';
import { PolicyDocument } from 'aws-cdk-lib/aws-iam';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';


export interface ApiGatewayAccessProps {
  /**
   * List of IP addresses in CIDR notation that are allowed to access the API Gateway.
   *
   * If not specified on public API Gateway, all IP addresses are allowed.
   *
   * If not specified on private API Gateway, no IP addresses are allowed (but specified security groups are).
   */
  readonly allowedIps?: string[];

  /**
   * Creates a private API Gateway and allows access from the specified VPC.
   */
  readonly allowedVpc?: ec2.IVpc;

  /**
   * List of security groups that are allowed to access the API Gateway.
   *
   * Only works for private API Gateways with {@link allowedVpc}.
   */
  readonly allowedSecurityGroups?: ec2.ISecurityGroup[];
}

/**
 * Access configuration options for Lambda functions like setup and webhook function. Use this to limit access to these functions.
 */
export abstract class LambdaAccess {
  /**
   * Disables access to the configured Lambda function. This is useful for the setup function after setup is done.
   */
  static noAccess(): LambdaAccess {
    return new NoAccess();
  }

  /**
   * Provide access using Lambda URL. This is the default and simplest option. It puts no limits on the requester, but the Lambda functions themselves authenticate every request.
   */
  static lambdaUrl(): LambdaAccess {
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
  static apiGateway(props?: ApiGatewayAccessProps): LambdaAccess {
    return new ApiGateway(props);
  }

  /**
   * Downloads the list of IP addresses used by GitHub.com for webhooks.
   *
   * Note that downloading dynamic data during deployment is not recommended in CDK. This is a workaround for the lack of a better solution.
   */
  static githubWebhookIps(): string[] {
    const githubMeta = execFileSync('curl', ['-fsSL', 'https://api.github.com/meta']).toString();
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

/**
 * @internal
 */
class NoAccess extends LambdaAccess {
  public _bind(_construct: Construct, _id: string, _lambdaFunction: lambda.Function): string {
    return '';
  }
}

/**
 * @internal
 */
class LambdaUrl extends LambdaAccess {
  public _bind(_construct: Construct, _id: string, lambdaFunction: lambda.Function): string {
    return lambdaFunction.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE,
    }).url;
  }
}

/**
 * @internal
 */
class ApiGateway {
  constructor(private readonly props?: ApiGatewayAccessProps) {}

  public _bind(scope: Construct, id: string, lambdaFunction: lambda.Function): string {
    let policy: iam.PolicyDocument;
    let endpointConfig: apigateway.EndpointConfiguration | undefined = undefined;

    if (this.props?.allowedVpc) {
      // private api gateway
      const sg = new ec2.SecurityGroup(scope, `${id}/SG`, {
        vpc: this.props.allowedVpc,
        allowAllOutbound: true,
      });

      for (const otherSg of this.props?.allowedSecurityGroups ?? []) {
        sg.connections.allowFrom(otherSg, ec2.Port.tcp(443));
      }

      const vpcEndpoint = new ec2.InterfaceVpcEndpoint(scope, `${id}/VpcEndpoint`, {
        vpc: this.props.allowedVpc,
        service: ec2.InterfaceVpcEndpointAwsService.APIGATEWAY,
        privateDnsEnabled: true,
        securityGroups: [sg],
        open: false,
      });

      endpointConfig = {
        types: [apigateway.EndpointType.PRIVATE],
        vpcEndpoints: [vpcEndpoint],
      };

      policy = PolicyDocument.fromJson({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: '*',
            Action: 'execute-api:Invoke',
            Resource: 'execute-api:/*/*/*',
            Condition: {
              StringEquals: {
                'aws:SourceVpce': vpcEndpoint.vpcEndpointId,
              },
            },
          },
        ],
      });
    } else {
      // public api gateway
      if (this.props?.allowedSecurityGroups) {
        cdk.Annotations.of(scope).addWarning('allowedSecurityGroups is ignored when allowedVpc is not specified.');
      }

      policy = PolicyDocument.fromJson({
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
      });
    }

    const api = new apigateway.LambdaRestApi(scope, id, {
      handler: lambdaFunction,
      proxy: true,
      cloudWatchRole: false,
      endpointConfiguration: endpointConfig,
      policy,
    });

    // remove CfnOutput
    api.node.tryRemoveChild('Endpoint');

    return api.url;
  }
}
