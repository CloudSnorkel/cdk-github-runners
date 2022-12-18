import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { GitHubRunners } from '../src';

let app: cdk.App;
let stack: cdk.Stack;

describe('GitHubRunners', () => {
  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'test');
  });
  test('Create GithubRunners', () => {
    new GitHubRunners(stack, 'runners', {
      providers: [],
    });

    const template = Template.fromStack(stack);
    expect(template).toMatchInlineSnapshot(`
Object {
  "Mappings": Object {
    "ServiceprincipalMap": Object {
      "af-south-1": Object {
        "states": "states.af-south-1.amazonaws.com",
      },
      "ap-east-1": Object {
        "states": "states.ap-east-1.amazonaws.com",
      },
      "ap-northeast-1": Object {
        "states": "states.ap-northeast-1.amazonaws.com",
      },
      "ap-northeast-2": Object {
        "states": "states.ap-northeast-2.amazonaws.com",
      },
      "ap-northeast-3": Object {
        "states": "states.ap-northeast-3.amazonaws.com",
      },
      "ap-south-1": Object {
        "states": "states.ap-south-1.amazonaws.com",
      },
      "ap-southeast-1": Object {
        "states": "states.ap-southeast-1.amazonaws.com",
      },
      "ap-southeast-2": Object {
        "states": "states.ap-southeast-2.amazonaws.com",
      },
      "ap-southeast-3": Object {
        "states": "states.ap-southeast-3.amazonaws.com",
      },
      "ca-central-1": Object {
        "states": "states.ca-central-1.amazonaws.com",
      },
      "cn-north-1": Object {
        "states": "states.cn-north-1.amazonaws.com",
      },
      "cn-northwest-1": Object {
        "states": "states.cn-northwest-1.amazonaws.com",
      },
      "eu-central-1": Object {
        "states": "states.eu-central-1.amazonaws.com",
      },
      "eu-north-1": Object {
        "states": "states.eu-north-1.amazonaws.com",
      },
      "eu-south-1": Object {
        "states": "states.eu-south-1.amazonaws.com",
      },
      "eu-south-2": Object {
        "states": "states.eu-south-2.amazonaws.com",
      },
      "eu-west-1": Object {
        "states": "states.eu-west-1.amazonaws.com",
      },
      "eu-west-2": Object {
        "states": "states.eu-west-2.amazonaws.com",
      },
      "eu-west-3": Object {
        "states": "states.eu-west-3.amazonaws.com",
      },
      "me-south-1": Object {
        "states": "states.me-south-1.amazonaws.com",
      },
      "sa-east-1": Object {
        "states": "states.sa-east-1.amazonaws.com",
      },
      "us-east-1": Object {
        "states": "states.us-east-1.amazonaws.com",
      },
      "us-east-2": Object {
        "states": "states.us-east-2.amazonaws.com",
      },
      "us-gov-east-1": Object {
        "states": "states.us-gov-east-1.amazonaws.com",
      },
      "us-gov-west-1": Object {
        "states": "states.us-gov-west-1.amazonaws.com",
      },
      "us-iso-east-1": Object {
        "states": "states.amazonaws.com",
      },
      "us-iso-west-1": Object {
        "states": "states.amazonaws.com",
      },
      "us-isob-east-1": Object {
        "states": "states.amazonaws.com",
      },
      "us-west-1": Object {
        "states": "states.us-west-1.amazonaws.com",
      },
      "us-west-2": Object {
        "states": "states.us-west-2.amazonaws.com",
      },
    },
  },
  "Outputs": Object {
    "runnersstatuscommand4A30F0F5": Object {
      "Value": Object {
        "Fn::Join": Array [
          "",
          Array [
            "aws --region ",
            Object {
              "Ref": "AWS::Region",
            },
            " lambda invoke --function-name ",
            Object {
              "Ref": "runnersstatus1A5771C0",
            },
            " status.json",
          ],
        ],
      },
    },
  },
  "Parameters": Object {
    "BootstrapVersion": Object {
      "Default": "/cdk-bootstrap/hnb659fds/version",
      "Description": "Version of the CDK Bootstrap resources in this environment, automatically retrieved from SSM Parameter Store. [cdk:skip]",
      "Type": "AWS::SSM::Parameter::Value<String>",
    },
  },
  "Resources": Object {
    "LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8aFD4BFC8A": Object {
      "DependsOn": Array [
        "LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8aServiceRoleDefaultPolicyADDA7DEB",
        "LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8aServiceRole9741ECFB",
      ],
      "Properties": Object {
        "Code": Object {
          "S3Bucket": Object {
            "Fn::Sub": "cdk-hnb659fds-assets-\${AWS::AccountId}-\${AWS::Region}",
          },
          "S3Key": "eb5b005c858404ea0c8f68098ed5dcdf5340e02461f149751d10f59c210d5ef8.zip",
        },
        "Handler": "index.handler",
        "Role": Object {
          "Fn::GetAtt": Array [
            "LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8aServiceRole9741ECFB",
            "Arn",
          ],
        },
        "Runtime": "nodejs14.x",
      },
      "Type": "AWS::Lambda::Function",
    },
    "LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8aServiceRole9741ECFB": Object {
      "Properties": Object {
        "AssumeRolePolicyDocument": Object {
          "Statement": Array [
            Object {
              "Action": "sts:AssumeRole",
              "Effect": "Allow",
              "Principal": Object {
                "Service": "lambda.amazonaws.com",
              },
            },
          ],
          "Version": "2012-10-17",
        },
        "ManagedPolicyArns": Array [
          Object {
            "Fn::Join": Array [
              "",
              Array [
                "arn:",
                Object {
                  "Ref": "AWS::Partition",
                },
                ":iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
              ],
            ],
          },
        ],
      },
      "Type": "AWS::IAM::Role",
    },
    "LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8aServiceRoleDefaultPolicyADDA7DEB": Object {
      "Properties": Object {
        "PolicyDocument": Object {
          "Statement": Array [
            Object {
              "Action": Array [
                "logs:PutRetentionPolicy",
                "logs:DeleteRetentionPolicy",
              ],
              "Effect": "Allow",
              "Resource": "*",
            },
          ],
          "Version": "2012-10-17",
        },
        "PolicyName": "LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8aServiceRoleDefaultPolicyADDA7DEB",
        "Roles": Array [
          Object {
            "Ref": "LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8aServiceRole9741ECFB",
          },
        ],
      },
      "Type": "AWS::IAM::Policy",
    },
    "runnersRunnerOrchestratorF9B66EBA": Object {
      "DependsOn": Array [
        "runnersRunnerOrchestratorRoleDefaultPolicyD1C26D61",
        "runnersRunnerOrchestratorRole5D220AD7",
      ],
      "Properties": Object {
        "DefinitionString": Object {
          "Fn::Join": Array [
            "",
            Array [
              "{\\"StartAt\\":\\"Is self hosted?\\",\\"States\\":{\\"Is self hosted?\\":{\\"Type\\":\\"Choice\\",\\"Choices\\":[{\\"Variable\\":\\"$.labels.self-hosted\\",\\"IsPresent\\":false,\\"Next\\":\\"No\\"}],\\"Default\\":\\"Get Runner Token\\"},\\"Get Runner Token\\":{\\"Next\\":\\"Error Catcher\\",\\"Retry\\":[{\\"ErrorEquals\\":[\\"Lambda.ServiceException\\",\\"Lambda.AWSLambdaException\\",\\"Lambda.SdkClientException\\"],\\"IntervalSeconds\\":2,\\"MaxAttempts\\":6,\\"BackoffRate\\":2}],\\"Type\\":\\"Task\\",\\"ResultPath\\":\\"$.runner\\",\\"Resource\\":\\"",
              Object {
                "Fn::GetAtt": Array [
                  "runnerstokenretrieverD5E8392A",
                  "Arn",
                ],
              },
              "\\"},\\"Error Catcher\\":{\\"Type\\":\\"Parallel\\",\\"ResultPath\\":\\"$.result\\",\\"End\\":true,\\"Catch\\":[{\\"ErrorEquals\\":[\\"States.ALL\\"],\\"ResultPath\\":\\"$.error\\",\\"Next\\":\\"Delete Runner\\"}],\\"Branches\\":[{\\"StartAt\\":\\"Choose provider\\",\\"States\\":{\\"Choose provider\\":{\\"Type\\":\\"Choice\\",\\"Default\\":\\"Unknown label\\"},\\"Unknown label\\":{\\"Type\\":\\"Succeed\\"}}},{\\"StartAt\\":\\"Wait\\",\\"States\\":{\\"Wait\\":{\\"Type\\":\\"Wait\\",\\"Seconds\\":600,\\"Next\\":\\"Delete Idle Runner\\"},\\"Delete Idle Runner\\":{\\"End\\":true,\\"Retry\\":[{\\"ErrorEquals\\":[\\"Lambda.ServiceException\\",\\"Lambda.AWSLambdaException\\",\\"Lambda.SdkClientException\\"],\\"IntervalSeconds\\":2,\\"MaxAttempts\\":6,\\"BackoffRate\\":2}],\\"Type\\":\\"Task\\",\\"ResultPath\\":\\"$.delete\\",\\"Resource\\":\\"",
              Object {
                "Fn::GetAtt": Array [
                  "runnersdeleterunner7F8D5293",
                  "Arn",
                ],
              },
              "\\",\\"Parameters\\":{\\"runnerName.$\\":\\"$$.Execution.Name\\",\\"owner.$\\":\\"$.owner\\",\\"repo.$\\":\\"$.repo\\",\\"runId.$\\":\\"$.runId\\",\\"installationId.$\\":\\"$.installationId\\",\\"idleOnly\\":true}}}}]},\\"Delete Runner\\":{\\"Next\\":\\"Runner Failed\\",\\"Retry\\":[{\\"ErrorEquals\\":[\\"Lambda.ServiceException\\",\\"Lambda.AWSLambdaException\\",\\"Lambda.SdkClientException\\"],\\"IntervalSeconds\\":2,\\"MaxAttempts\\":6,\\"BackoffRate\\":2},{\\"ErrorEquals\\":[\\"RunnerBusy\\"],\\"IntervalSeconds\\":60,\\"MaxAttempts\\":60,\\"BackoffRate\\":1}],\\"Type\\":\\"Task\\",\\"ResultPath\\":\\"$.delete\\",\\"Resource\\":\\"",
              Object {
                "Fn::GetAtt": Array [
                  "runnersdeleterunner7F8D5293",
                  "Arn",
                ],
              },
              "\\",\\"Parameters\\":{\\"runnerName.$\\":\\"$$.Execution.Name\\",\\"owner.$\\":\\"$.owner\\",\\"repo.$\\":\\"$.repo\\",\\"runId.$\\":\\"$.runId\\",\\"installationId.$\\":\\"$.installationId\\",\\"idleOnly\\":false}},\\"Runner Failed\\":{\\"Type\\":\\"Fail\\"},\\"No\\":{\\"Type\\":\\"Succeed\\"}}}",
            ],
          ],
        },
        "RoleArn": Object {
          "Fn::GetAtt": Array [
            "runnersRunnerOrchestratorRole5D220AD7",
            "Arn",
          ],
        },
      },
      "Type": "AWS::StepFunctions::StateMachine",
    },
    "runnersRunnerOrchestratorRole5D220AD7": Object {
      "Properties": Object {
        "AssumeRolePolicyDocument": Object {
          "Statement": Array [
            Object {
              "Action": "sts:AssumeRole",
              "Effect": "Allow",
              "Principal": Object {
                "Service": Object {
                  "Fn::FindInMap": Array [
                    "ServiceprincipalMap",
                    Object {
                      "Ref": "AWS::Region",
                    },
                    "states",
                  ],
                },
              },
            },
          ],
          "Version": "2012-10-17",
        },
      },
      "Type": "AWS::IAM::Role",
    },
    "runnersRunnerOrchestratorRoleDefaultPolicyD1C26D61": Object {
      "Properties": Object {
        "PolicyDocument": Object {
          "Statement": Array [
            Object {
              "Action": "lambda:InvokeFunction",
              "Effect": "Allow",
              "Resource": Array [
                Object {
                  "Fn::GetAtt": Array [
                    "runnerstokenretrieverD5E8392A",
                    "Arn",
                  ],
                },
                Object {
                  "Fn::Join": Array [
                    "",
                    Array [
                      Object {
                        "Fn::GetAtt": Array [
                          "runnerstokenretrieverD5E8392A",
                          "Arn",
                        ],
                      },
                      ":*",
                    ],
                  ],
                },
              ],
            },
            Object {
              "Action": "lambda:InvokeFunction",
              "Effect": "Allow",
              "Resource": Array [
                Object {
                  "Fn::GetAtt": Array [
                    "runnersdeleterunner7F8D5293",
                    "Arn",
                  ],
                },
                Object {
                  "Fn::Join": Array [
                    "",
                    Array [
                      Object {
                        "Fn::GetAtt": Array [
                          "runnersdeleterunner7F8D5293",
                          "Arn",
                        ],
                      },
                      ":*",
                    ],
                  ],
                },
              ],
            },
          ],
          "Version": "2012-10-17",
        },
        "PolicyName": "runnersRunnerOrchestratorRoleDefaultPolicyD1C26D61",
        "Roles": Array [
          Object {
            "Ref": "runnersRunnerOrchestratorRole5D220AD7",
          },
        ],
      },
      "Type": "AWS::IAM::Policy",
    },
    "runnersSecretsGitHubEFD96479": Object {
      "DeletionPolicy": "Delete",
      "Properties": Object {
        "GenerateSecretString": Object {
          "ExcludePunctuation": true,
          "GenerateStringKey": "dummy",
          "IncludeSpace": false,
          "SecretStringTemplate": "{\\"domain\\":\\"github.com\\",\\"appId\\":\\"\\",\\"personalAuthToken\\":\\"\\"}",
        },
      },
      "Type": "AWS::SecretsManager::Secret",
      "UpdateReplacePolicy": "Delete",
    },
    "runnersSecretsGitHubPrivateKey79498F91": Object {
      "DeletionPolicy": "Delete",
      "Properties": Object {
        "SecretString": "-----BEGIN RSA PRIVATE KEY-----
...
-----END RSA PRIVATE KEY-----",
      },
      "Type": "AWS::SecretsManager::Secret",
      "UpdateReplacePolicy": "Delete",
    },
    "runnersSecretsSetup692A93B1": Object {
      "DeletionPolicy": "Delete",
      "Properties": Object {
        "GenerateSecretString": Object {
          "ExcludePunctuation": true,
          "GenerateStringKey": "token",
          "IncludeSpace": false,
          "SecretStringTemplate": "{\\"token\\":\\"\\"}",
        },
      },
      "Type": "AWS::SecretsManager::Secret",
      "UpdateReplacePolicy": "Delete",
    },
    "runnersSecretsWebhook7AF0D74E": Object {
      "DeletionPolicy": "Delete",
      "Properties": Object {
        "GenerateSecretString": Object {
          "ExcludePunctuation": true,
          "GenerateStringKey": "webhookSecret",
          "IncludeSpace": false,
          "SecretStringTemplate": "{}",
        },
      },
      "Type": "AWS::SecretsManager::Secret",
      "UpdateReplacePolicy": "Delete",
    },
    "runnersWebhookHandlerwebhookhandler22779A81": Object {
      "DependsOn": Array [
        "runnersWebhookHandlerwebhookhandlerServiceRoleDefaultPolicy1600452C",
        "runnersWebhookHandlerwebhookhandlerServiceRole03DB58D2",
      ],
      "Properties": Object {
        "Code": Object {
          "S3Bucket": Object {
            "Fn::Sub": "cdk-hnb659fds-assets-\${AWS::AccountId}-\${AWS::Region}",
          },
          "S3Key": "709fef0716eee2709012f6546e06fe02accd7dca0ce8cb276f2b374f3cb12252.zip",
        },
        "Description": "Handle GitHub webhook and start runner orchestrator",
        "Environment": Object {
          "Variables": Object {
            "AWS_NODEJS_CONNECTION_REUSE_ENABLED": "1",
            "STEP_FUNCTION_ARN": Object {
              "Ref": "runnersRunnerOrchestratorF9B66EBA",
            },
            "WEBHOOK_SECRET_ARN": Object {
              "Ref": "runnersSecretsWebhook7AF0D74E",
            },
          },
        },
        "Handler": "index.handler",
        "Role": Object {
          "Fn::GetAtt": Array [
            "runnersWebhookHandlerwebhookhandlerServiceRole03DB58D2",
            "Arn",
          ],
        },
        "Runtime": "nodejs14.x",
        "Timeout": 30,
      },
      "Type": "AWS::Lambda::Function",
    },
    "runnersWebhookHandlerwebhookhandlerFunctionUrlC8FB3D17": Object {
      "Properties": Object {
        "AuthType": "NONE",
        "TargetFunctionArn": Object {
          "Fn::GetAtt": Array [
            "runnersWebhookHandlerwebhookhandler22779A81",
            "Arn",
          ],
        },
      },
      "Type": "AWS::Lambda::Url",
    },
    "runnersWebhookHandlerwebhookhandlerLogRetention0F5ED260": Object {
      "Properties": Object {
        "LogGroupName": Object {
          "Fn::Join": Array [
            "",
            Array [
              "/aws/lambda/",
              Object {
                "Ref": "runnersWebhookHandlerwebhookhandler22779A81",
              },
            ],
          ],
        },
        "RetentionInDays": 30,
        "ServiceToken": Object {
          "Fn::GetAtt": Array [
            "LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8aFD4BFC8A",
            "Arn",
          ],
        },
      },
      "Type": "Custom::LogRetention",
    },
    "runnersWebhookHandlerwebhookhandlerServiceRole03DB58D2": Object {
      "Properties": Object {
        "AssumeRolePolicyDocument": Object {
          "Statement": Array [
            Object {
              "Action": "sts:AssumeRole",
              "Effect": "Allow",
              "Principal": Object {
                "Service": "lambda.amazonaws.com",
              },
            },
          ],
          "Version": "2012-10-17",
        },
        "ManagedPolicyArns": Array [
          Object {
            "Fn::Join": Array [
              "",
              Array [
                "arn:",
                Object {
                  "Ref": "AWS::Partition",
                },
                ":iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
              ],
            ],
          },
        ],
      },
      "Type": "AWS::IAM::Role",
    },
    "runnersWebhookHandlerwebhookhandlerServiceRoleDefaultPolicy1600452C": Object {
      "Properties": Object {
        "PolicyDocument": Object {
          "Statement": Array [
            Object {
              "Action": Array [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret",
              ],
              "Effect": "Allow",
              "Resource": Object {
                "Ref": "runnersSecretsWebhook7AF0D74E",
              },
            },
            Object {
              "Action": "states:StartExecution",
              "Effect": "Allow",
              "Resource": Object {
                "Ref": "runnersRunnerOrchestratorF9B66EBA",
              },
            },
          ],
          "Version": "2012-10-17",
        },
        "PolicyName": "runnersWebhookHandlerwebhookhandlerServiceRoleDefaultPolicy1600452C",
        "Roles": Array [
          Object {
            "Ref": "runnersWebhookHandlerwebhookhandlerServiceRole03DB58D2",
          },
        ],
      },
      "Type": "AWS::IAM::Policy",
    },
    "runnersWebhookHandlerwebhookhandlerinvokefunctionurl871AC245": Object {
      "Properties": Object {
        "Action": "lambda:InvokeFunctionUrl",
        "FunctionName": Object {
          "Fn::GetAtt": Array [
            "runnersWebhookHandlerwebhookhandler22779A81",
            "Arn",
          ],
        },
        "FunctionUrlAuthType": "NONE",
        "Principal": "*",
      },
      "Type": "AWS::Lambda::Permission",
    },
    "runnersdeleterunner7F8D5293": Object {
      "DependsOn": Array [
        "runnersdeleterunnerServiceRoleDefaultPolicyECFB6BF7",
        "runnersdeleterunnerServiceRole35856967",
      ],
      "Properties": Object {
        "Code": Object {
          "S3Bucket": Object {
            "Fn::Sub": "cdk-hnb659fds-assets-\${AWS::AccountId}-\${AWS::Region}",
          },
          "S3Key": "c1ff5e80643b8ca08710dd7ed4c42f9aeb6b243af091a7dc74c7d65deeb0249a.zip",
        },
        "Description": "Delete GitHub Actions runner on error",
        "Environment": Object {
          "Variables": Object {
            "AWS_NODEJS_CONNECTION_REUSE_ENABLED": "1",
            "GITHUB_PRIVATE_KEY_SECRET_ARN": Object {
              "Ref": "runnersSecretsGitHubPrivateKey79498F91",
            },
            "GITHUB_SECRET_ARN": Object {
              "Ref": "runnersSecretsGitHubEFD96479",
            },
          },
        },
        "Handler": "index.handler",
        "Role": Object {
          "Fn::GetAtt": Array [
            "runnersdeleterunnerServiceRole35856967",
            "Arn",
          ],
        },
        "Runtime": "nodejs14.x",
        "Timeout": 30,
      },
      "Type": "AWS::Lambda::Function",
    },
    "runnersdeleterunnerLogRetention76F47082": Object {
      "Properties": Object {
        "LogGroupName": Object {
          "Fn::Join": Array [
            "",
            Array [
              "/aws/lambda/",
              Object {
                "Ref": "runnersdeleterunner7F8D5293",
              },
            ],
          ],
        },
        "RetentionInDays": 30,
        "ServiceToken": Object {
          "Fn::GetAtt": Array [
            "LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8aFD4BFC8A",
            "Arn",
          ],
        },
      },
      "Type": "Custom::LogRetention",
    },
    "runnersdeleterunnerServiceRole35856967": Object {
      "Properties": Object {
        "AssumeRolePolicyDocument": Object {
          "Statement": Array [
            Object {
              "Action": "sts:AssumeRole",
              "Effect": "Allow",
              "Principal": Object {
                "Service": "lambda.amazonaws.com",
              },
            },
          ],
          "Version": "2012-10-17",
        },
        "ManagedPolicyArns": Array [
          Object {
            "Fn::Join": Array [
              "",
              Array [
                "arn:",
                Object {
                  "Ref": "AWS::Partition",
                },
                ":iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
              ],
            ],
          },
        ],
      },
      "Type": "AWS::IAM::Role",
    },
    "runnersdeleterunnerServiceRoleDefaultPolicyECFB6BF7": Object {
      "Properties": Object {
        "PolicyDocument": Object {
          "Statement": Array [
            Object {
              "Action": Array [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret",
              ],
              "Effect": "Allow",
              "Resource": Object {
                "Ref": "runnersSecretsGitHubEFD96479",
              },
            },
            Object {
              "Action": Array [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret",
              ],
              "Effect": "Allow",
              "Resource": Object {
                "Ref": "runnersSecretsGitHubPrivateKey79498F91",
              },
            },
          ],
          "Version": "2012-10-17",
        },
        "PolicyName": "runnersdeleterunnerServiceRoleDefaultPolicyECFB6BF7",
        "Roles": Array [
          Object {
            "Ref": "runnersdeleterunnerServiceRole35856967",
          },
        ],
      },
      "Type": "AWS::IAM::Policy",
    },
    "runnerssetup9896CB59": Object {
      "DependsOn": Array [
        "runnerssetupServiceRoleDefaultPolicy40EF213B",
        "runnerssetupServiceRole588BFE9A",
      ],
      "Properties": Object {
        "Code": Object {
          "S3Bucket": Object {
            "Fn::Sub": "cdk-hnb659fds-assets-\${AWS::AccountId}-\${AWS::Region}",
          },
          "S3Key": "0b8897e975551e3d9f5773f4b16d34842c635010d5f34103733cb132fc7e1e52.zip",
        },
        "Description": "Setup GitHub Actions integration with self-hosted runners",
        "Environment": Object {
          "Variables": Object {
            "AWS_NODEJS_CONNECTION_REUSE_ENABLED": "1",
            "GITHUB_PRIVATE_KEY_SECRET_ARN": Object {
              "Ref": "runnersSecretsGitHubPrivateKey79498F91",
            },
            "GITHUB_SECRET_ARN": Object {
              "Ref": "runnersSecretsGitHubEFD96479",
            },
            "SETUP_SECRET_ARN": Object {
              "Ref": "runnersSecretsSetup692A93B1",
            },
            "WEBHOOK_SECRET_ARN": Object {
              "Ref": "runnersSecretsWebhook7AF0D74E",
            },
            "WEBHOOK_URL": Object {
              "Fn::GetAtt": Array [
                "runnersWebhookHandlerwebhookhandlerFunctionUrlC8FB3D17",
                "FunctionUrl",
              ],
            },
          },
        },
        "Handler": "index.handler",
        "Role": Object {
          "Fn::GetAtt": Array [
            "runnerssetupServiceRole588BFE9A",
            "Arn",
          ],
        },
        "Runtime": "nodejs14.x",
        "Timeout": 180,
      },
      "Type": "AWS::Lambda::Function",
    },
    "runnerssetupFunctionUrlB8BC43E8": Object {
      "Properties": Object {
        "AuthType": "NONE",
        "TargetFunctionArn": Object {
          "Fn::GetAtt": Array [
            "runnerssetup9896CB59",
            "Arn",
          ],
        },
      },
      "Type": "AWS::Lambda::Url",
    },
    "runnerssetupLogRetentionA9A82D27": Object {
      "Properties": Object {
        "LogGroupName": Object {
          "Fn::Join": Array [
            "",
            Array [
              "/aws/lambda/",
              Object {
                "Ref": "runnerssetup9896CB59",
              },
            ],
          ],
        },
        "RetentionInDays": 30,
        "ServiceToken": Object {
          "Fn::GetAtt": Array [
            "LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8aFD4BFC8A",
            "Arn",
          ],
        },
      },
      "Type": "Custom::LogRetention",
    },
    "runnerssetupServiceRole588BFE9A": Object {
      "Properties": Object {
        "AssumeRolePolicyDocument": Object {
          "Statement": Array [
            Object {
              "Action": "sts:AssumeRole",
              "Effect": "Allow",
              "Principal": Object {
                "Service": "lambda.amazonaws.com",
              },
            },
          ],
          "Version": "2012-10-17",
        },
        "ManagedPolicyArns": Array [
          Object {
            "Fn::Join": Array [
              "",
              Array [
                "arn:",
                Object {
                  "Ref": "AWS::Partition",
                },
                ":iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
              ],
            ],
          },
        ],
      },
      "Type": "AWS::IAM::Role",
    },
    "runnerssetupServiceRoleDefaultPolicy40EF213B": Object {
      "Properties": Object {
        "PolicyDocument": Object {
          "Statement": Array [
            Object {
              "Action": Array [
                "secretsmanager:PutSecretValue",
                "secretsmanager:UpdateSecret",
              ],
              "Effect": "Allow",
              "Resource": Object {
                "Ref": "runnersSecretsWebhook7AF0D74E",
              },
            },
            Object {
              "Action": Array [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret",
              ],
              "Effect": "Allow",
              "Resource": Object {
                "Ref": "runnersSecretsGitHubEFD96479",
              },
            },
            Object {
              "Action": Array [
                "secretsmanager:PutSecretValue",
                "secretsmanager:UpdateSecret",
              ],
              "Effect": "Allow",
              "Resource": Object {
                "Ref": "runnersSecretsGitHubEFD96479",
              },
            },
            Object {
              "Action": Array [
                "secretsmanager:PutSecretValue",
                "secretsmanager:UpdateSecret",
              ],
              "Effect": "Allow",
              "Resource": Object {
                "Ref": "runnersSecretsGitHubPrivateKey79498F91",
              },
            },
            Object {
              "Action": Array [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret",
              ],
              "Effect": "Allow",
              "Resource": Object {
                "Ref": "runnersSecretsSetup692A93B1",
              },
            },
            Object {
              "Action": Array [
                "secretsmanager:PutSecretValue",
                "secretsmanager:UpdateSecret",
              ],
              "Effect": "Allow",
              "Resource": Object {
                "Ref": "runnersSecretsSetup692A93B1",
              },
            },
          ],
          "Version": "2012-10-17",
        },
        "PolicyName": "runnerssetupServiceRoleDefaultPolicy40EF213B",
        "Roles": Array [
          Object {
            "Ref": "runnerssetupServiceRole588BFE9A",
          },
        ],
      },
      "Type": "AWS::IAM::Policy",
    },
    "runnerssetupinvokefunctionurl5F3B865C": Object {
      "Properties": Object {
        "Action": "lambda:InvokeFunctionUrl",
        "FunctionName": Object {
          "Fn::GetAtt": Array [
            "runnerssetup9896CB59",
            "Arn",
          ],
        },
        "FunctionUrlAuthType": "NONE",
        "Principal": "*",
      },
      "Type": "AWS::Lambda::Permission",
    },
    "runnersstatus1A5771C0": Object {
      "DependsOn": Array [
        "runnersstatusServiceRoleDefaultPolicyBD4E619B",
        "runnersstatusServiceRole71A1ADB6",
      ],
      "Metadata": Object {
        "providers": Array [],
      },
      "Properties": Object {
        "Code": Object {
          "S3Bucket": Object {
            "Fn::Sub": "cdk-hnb659fds-assets-\${AWS::AccountId}-\${AWS::Region}",
          },
          "S3Key": "0bbefafcf329bd9e22fc22d1b25bc657dfe4653199e8875c7dd87409affa7c34.zip",
        },
        "Description": "Provide user with status about self-hosted GitHub Actions runners",
        "Environment": Object {
          "Variables": Object {
            "AWS_NODEJS_CONNECTION_REUSE_ENABLED": "1",
            "GITHUB_PRIVATE_KEY_SECRET_ARN": Object {
              "Ref": "runnersSecretsGitHubPrivateKey79498F91",
            },
            "GITHUB_SECRET_ARN": Object {
              "Ref": "runnersSecretsGitHubEFD96479",
            },
            "LOGICAL_ID": "runnersstatus1A5771C0",
            "SETUP_FUNCTION_URL": Object {
              "Fn::GetAtt": Array [
                "runnerssetupFunctionUrlB8BC43E8",
                "FunctionUrl",
              ],
            },
            "SETUP_SECRET_ARN": Object {
              "Ref": "runnersSecretsSetup692A93B1",
            },
            "STACK_NAME": "test",
            "STEP_FUNCTION_ARN": Object {
              "Ref": "runnersRunnerOrchestratorF9B66EBA",
            },
            "WEBHOOK_HANDLER_ARN": Object {
              "Fn::Join": Array [
                "",
                Array [
                  Object {
                    "Fn::GetAtt": Array [
                      "runnersWebhookHandlerwebhookhandler22779A81",
                      "Arn",
                    ],
                  },
                  ":$LATEST",
                ],
              ],
            },
            "WEBHOOK_SECRET_ARN": Object {
              "Ref": "runnersSecretsWebhook7AF0D74E",
            },
            "WEBHOOK_URL": Object {
              "Fn::GetAtt": Array [
                "runnersWebhookHandlerwebhookhandlerFunctionUrlC8FB3D17",
                "FunctionUrl",
              ],
            },
          },
        },
        "Handler": "index.handler",
        "Role": Object {
          "Fn::GetAtt": Array [
            "runnersstatusServiceRole71A1ADB6",
            "Arn",
          ],
        },
        "Runtime": "nodejs14.x",
        "Timeout": 180,
      },
      "Type": "AWS::Lambda::Function",
    },
    "runnersstatusLogRetention8EB4A773": Object {
      "Properties": Object {
        "LogGroupName": Object {
          "Fn::Join": Array [
            "",
            Array [
              "/aws/lambda/",
              Object {
                "Ref": "runnersstatus1A5771C0",
              },
            ],
          ],
        },
        "RetentionInDays": 30,
        "ServiceToken": Object {
          "Fn::GetAtt": Array [
            "LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8aFD4BFC8A",
            "Arn",
          ],
        },
      },
      "Type": "Custom::LogRetention",
    },
    "runnersstatusServiceRole71A1ADB6": Object {
      "Properties": Object {
        "AssumeRolePolicyDocument": Object {
          "Statement": Array [
            Object {
              "Action": "sts:AssumeRole",
              "Effect": "Allow",
              "Principal": Object {
                "Service": "lambda.amazonaws.com",
              },
            },
          ],
          "Version": "2012-10-17",
        },
        "ManagedPolicyArns": Array [
          Object {
            "Fn::Join": Array [
              "",
              Array [
                "arn:",
                Object {
                  "Ref": "AWS::Partition",
                },
                ":iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
              ],
            ],
          },
        ],
      },
      "Type": "AWS::IAM::Role",
    },
    "runnersstatusServiceRoleDefaultPolicyBD4E619B": Object {
      "Properties": Object {
        "PolicyDocument": Object {
          "Statement": Array [
            Object {
              "Action": "cloudformation:DescribeStackResource",
              "Effect": "Allow",
              "Resource": Object {
                "Ref": "AWS::StackId",
              },
            },
            Object {
              "Action": Array [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret",
              ],
              "Effect": "Allow",
              "Resource": Object {
                "Ref": "runnersSecretsWebhook7AF0D74E",
              },
            },
            Object {
              "Action": Array [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret",
              ],
              "Effect": "Allow",
              "Resource": Object {
                "Ref": "runnersSecretsGitHubEFD96479",
              },
            },
            Object {
              "Action": Array [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret",
              ],
              "Effect": "Allow",
              "Resource": Object {
                "Ref": "runnersSecretsGitHubPrivateKey79498F91",
              },
            },
            Object {
              "Action": Array [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret",
              ],
              "Effect": "Allow",
              "Resource": Object {
                "Ref": "runnersSecretsSetup692A93B1",
              },
            },
            Object {
              "Action": Array [
                "states:ListExecutions",
                "states:ListStateMachines",
              ],
              "Effect": "Allow",
              "Resource": Object {
                "Ref": "runnersRunnerOrchestratorF9B66EBA",
              },
            },
            Object {
              "Action": Array [
                "states:DescribeExecution",
                "states:DescribeStateMachineForExecution",
                "states:GetExecutionHistory",
              ],
              "Effect": "Allow",
              "Resource": Object {
                "Fn::Join": Array [
                  "",
                  Array [
                    "arn:",
                    Object {
                      "Ref": "AWS::Partition",
                    },
                    ":states:",
                    Object {
                      "Ref": "AWS::Region",
                    },
                    ":",
                    Object {
                      "Ref": "AWS::AccountId",
                    },
                    ":execution:",
                    Object {
                      "Fn::Select": Array [
                        6,
                        Object {
                          "Fn::Split": Array [
                            ":",
                            Object {
                              "Ref": "runnersRunnerOrchestratorF9B66EBA",
                            },
                          ],
                        },
                      ],
                    },
                    ":*",
                  ],
                ],
              },
            },
            Object {
              "Action": Array [
                "states:ListActivities",
                "states:DescribeStateMachine",
                "states:DescribeActivity",
              ],
              "Effect": "Allow",
              "Resource": "*",
            },
          ],
          "Version": "2012-10-17",
        },
        "PolicyName": "runnersstatusServiceRoleDefaultPolicyBD4E619B",
        "Roles": Array [
          Object {
            "Ref": "runnersstatusServiceRole71A1ADB6",
          },
        ],
      },
      "Type": "AWS::IAM::Policy",
    },
    "runnerstokenretrieverD5E8392A": Object {
      "DependsOn": Array [
        "runnerstokenretrieverServiceRoleDefaultPolicy24965D29",
        "runnerstokenretrieverServiceRole6099F71C",
      ],
      "Properties": Object {
        "Code": Object {
          "S3Bucket": Object {
            "Fn::Sub": "cdk-hnb659fds-assets-\${AWS::AccountId}-\${AWS::Region}",
          },
          "S3Key": "5407d0b33f3271510955edbddc37fd92399b7813da03e341adbb115330719fab.zip",
        },
        "Description": "Get token from GitHub Actions used to start new self-hosted runner",
        "Environment": Object {
          "Variables": Object {
            "AWS_NODEJS_CONNECTION_REUSE_ENABLED": "1",
            "GITHUB_PRIVATE_KEY_SECRET_ARN": Object {
              "Ref": "runnersSecretsGitHubPrivateKey79498F91",
            },
            "GITHUB_SECRET_ARN": Object {
              "Ref": "runnersSecretsGitHubEFD96479",
            },
          },
        },
        "Handler": "index.handler",
        "Role": Object {
          "Fn::GetAtt": Array [
            "runnerstokenretrieverServiceRole6099F71C",
            "Arn",
          ],
        },
        "Runtime": "nodejs14.x",
        "Timeout": 30,
      },
      "Type": "AWS::Lambda::Function",
    },
    "runnerstokenretrieverLogRetention05A536AD": Object {
      "Properties": Object {
        "LogGroupName": Object {
          "Fn::Join": Array [
            "",
            Array [
              "/aws/lambda/",
              Object {
                "Ref": "runnerstokenretrieverD5E8392A",
              },
            ],
          ],
        },
        "RetentionInDays": 30,
        "ServiceToken": Object {
          "Fn::GetAtt": Array [
            "LogRetentionaae0aa3c5b4d4f87b02d85b201efdd8aFD4BFC8A",
            "Arn",
          ],
        },
      },
      "Type": "Custom::LogRetention",
    },
    "runnerstokenretrieverServiceRole6099F71C": Object {
      "Properties": Object {
        "AssumeRolePolicyDocument": Object {
          "Statement": Array [
            Object {
              "Action": "sts:AssumeRole",
              "Effect": "Allow",
              "Principal": Object {
                "Service": "lambda.amazonaws.com",
              },
            },
          ],
          "Version": "2012-10-17",
        },
        "ManagedPolicyArns": Array [
          Object {
            "Fn::Join": Array [
              "",
              Array [
                "arn:",
                Object {
                  "Ref": "AWS::Partition",
                },
                ":iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
              ],
            ],
          },
        ],
      },
      "Type": "AWS::IAM::Role",
    },
    "runnerstokenretrieverServiceRoleDefaultPolicy24965D29": Object {
      "Properties": Object {
        "PolicyDocument": Object {
          "Statement": Array [
            Object {
              "Action": Array [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret",
              ],
              "Effect": "Allow",
              "Resource": Object {
                "Ref": "runnersSecretsGitHubEFD96479",
              },
            },
            Object {
              "Action": Array [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret",
              ],
              "Effect": "Allow",
              "Resource": Object {
                "Ref": "runnersSecretsGitHubPrivateKey79498F91",
              },
            },
          ],
          "Version": "2012-10-17",
        },
        "PolicyName": "runnerstokenretrieverServiceRoleDefaultPolicy24965D29",
        "Roles": Array [
          Object {
            "Ref": "runnerstokenretrieverServiceRole6099F71C",
          },
        ],
      },
      "Type": "AWS::IAM::Policy",
    },
  },
  "Rules": Object {
    "CheckBootstrapVersion": Object {
      "Assertions": Array [
        Object {
          "Assert": Object {
            "Fn::Not": Array [
              Object {
                "Fn::Contains": Array [
                  Array [
                    "1",
                    "2",
                    "3",
                    "4",
                    "5",
                  ],
                  Object {
                    "Ref": "BootstrapVersion",
                  },
                ],
              },
            ],
          },
          "AssertDescription": "CDK bootstrap stack version 6 required. Please run 'cdk bootstrap' with a recent version of the CDK CLI.",
        },
      ],
    },
  },
}
`);
  });

  test('Create GithubRunners with state machine logging enabled', () => {
    new GitHubRunners(stack, 'runners', {
      providers: [],
      logOptions: {
        logRetention: 1,
        logGroupName: 'test',
      },
    });

    const template = Template.fromStack(stack);

    template.hasResourceProperties(
      'AWS::Logs::LogGroup',
      Match.objectLike({
        LogGroupName: 'test',
        RetentionInDays: 1,
      }),
    );
  });
});
