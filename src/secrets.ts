import { aws_secretsmanager as secretsmanager } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * Secrets required for GitHub runners operation.
 */
export class Secrets extends Construct {
  /**
   * Webhook secret used to confirm events are coming from GitHub and nowhere else.
   */
  readonly webhook: secretsmanager.Secret;

  /**
   * Authentication secret for GitHub containing either app details or personal authentication token. This secret is used to register runners and
   * cancel jobs when the runner fails to start.
   *
   * This secret is meant to be edited by the user after being created.
   */
  readonly github: secretsmanager.Secret;

  /**
   * GitHub app private key. Not needed when using personal authentication tokens.
   *
   * This secret is meant to be edited by the user after being created.
   */
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