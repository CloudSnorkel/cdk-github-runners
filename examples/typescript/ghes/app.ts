#!/usr/bin/env node
/**
 * Example: GitHub Enterprise Server (GHES) configuration.
 *
 * This example demonstrates how to configure runners for GitHub Enterprise Server
 * hosted in a VPC, using API Gateway with VPC-only access.
 *
 * Important: Runners must be in the same VPC as GHES to communicate with it.
 * If GHES uses a self-signed certificate, you'll need to configure extraCertificates
 * for both the runner image and the management functions.
 */

import { App, Stack } from 'aws-cdk-lib';
import { Vpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import {
  GitHubRunners,
  CodeBuildRunnerProvider,
  LambdaAccess,
  RunnerImageComponent,
} from '@cloudsnorkel/cdk-github-runners';

class GhesStack extends Stack {
  constructor(scope: App, id: string) {
    super(scope, id);

    // Note: Creating a VPC is not required. Providers can use the default VPC or an existing VPC.
    // We create one here to make this example self-contained and testable.
    // In a real scenario, you might import an existing VPC where GitHub Enterprise Server is hosted
    const vpc = new Vpc(this, 'VPC', {
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'Private',
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });

    // Create a CodeBuild provider in the GHES VPC
    // Runners need to be in the same VPC as GHES to communicate with it
    const codebuildProvider = new CodeBuildRunnerProvider(this, 'CodeBuildProvider', {
      labels: ['codebuild', 'linux', 'x64'],
      vpc: vpc, // Runners must be in the GHES VPC to communicate with GHES
    });

    // If GitHub Enterprise Server uses a self-signed certificate, you need to:
    // 1. Add the certificate to the runner image
    // 2. Add the certificate to the management functions
    //
    // Example for self-signed certificates:
    // const imageBuilder = CodeBuildRunnerProvider.imageBuilder(this, 'ImageBuilder');
    // imageBuilder.addComponent(
    //   RunnerImageComponent.extraCertificates('path-to-certs/certs.pem', 'ghes-ca')
    // );
    // const codebuildProvider = new CodeBuildRunnerProvider(this, 'CodeBuildProvider', {
    //   labels: ['codebuild', 'linux', 'x64'],
    //   vpc: vpc,
    //   imageBuilder: imageBuilder,
    // });
    //
    // Then add extraCertificates to GitHubRunners:
    // extraCertificates: 'path-to-certs', // Directory containing certs.pem

    // Create the GitHub runners infrastructure
    // Configure webhookAccess to use API Gateway accessible only from within the VPC
    // This allows GitHub Enterprise Server (hosted in the VPC) to send webhooks
    new GitHubRunners(this, 'GitHubRunners', {
      providers: [codebuildProvider],
      // VPC for management functions (webhook, status, etc.) and runners
      vpc: vpc,
      // Configure webhook access to be accessible only from within the VPC
      // GitHub Enterprise Server in the VPC can send webhooks to this endpoint
      webhookAccess: LambdaAccess.apiGateway({
        allowedVpc: vpc,
        // Optionally, you can also restrict to specific IPs if GHES has a known IP
        // allowedIps: ['10.0.1.100/32'], // Replace with your GHES IP
      }),
      // If GHES uses a self-signed certificate, uncomment and provide the path:
      // extraCertificates: 'path-to-certs', // Directory containing certs.pem file
    });
  }
}

const app = new App();
new GhesStack(app, 'ghes-example');
app.synth();
