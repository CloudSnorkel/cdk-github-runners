import { aws_secretsmanager as secretsmanager } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * Secrets required for GitHub runners operation.
 */
export class Secrets extends Construct {
  readonly webhook: secretsmanager.Secret;
  readonly github: secretsmanager.Secret;
  readonly githubPrivateKey: secretsmanager.Secret;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.webhook = new secretsmanager.Secret(
      this,
      'Webhook',
      {
        generateSecretString: {
          secretStringTemplate: '{}',
          generateStringKey: 'webhookSecret',
          includeSpace: false,
          excludePunctuation: true,
        },
      },
    );

    this.github = new secretsmanager.Secret(
      this,
      'GitHub',
      {
        generateSecretString: {
          secretStringTemplate: JSON.stringify({
            domain: 'github.com',
            clientSecret: '',
            clientId: '',
            appId: '',
            installationId: '',
            personalAuthToken: '',
          }),
          generateStringKey: 'dummy',
          includeSpace: false,
          excludePunctuation: true,
        },
      },
    );

    // we create a separate secret for the private key because putting it in JSON secret is hard for the user
    this.githubPrivateKey = new secretsmanager.Secret(
      this,
      'GitHub Private Key',
      {
        secretStringValue: cdk.SecretValue.unsafePlainText('-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----'),
      },
    );
  }
}