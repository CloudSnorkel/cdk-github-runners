#!/usr/bin/env node
/**
 * EC2 Windows provider example demonstrating EC2 runner configuration for Windows.
 *
 * This example demonstrates:
 * - EC2 provider with Windows runners
 * - Custom Windows image builder with additional tools
 * - VPC configuration
 */

import { App, Stack } from 'aws-cdk-lib';
import { Vpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import {
  GitHubRunners,
  Ec2RunnerProvider,
  RunnerImageComponent,
  Os,
} from '@cloudsnorkel/cdk-github-runners';

class Ec2WindowsProviderStack extends Stack {
  constructor(scope: App, id: string) {
    super(scope, id);

    // Note: Creating a VPC is not required. Providers can use the default VPC or an existing VPC.
    // We create one here to make this example self-contained and testable.
    // Create a VPC with public and private subnets
    const vpc = new Vpc(this, 'VPC', {
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });

    // Create a Windows image builder for EC2
    const ec2WindowsImageBuilder = Ec2RunnerProvider.imageBuilder(this, 'EC2WindowsImageBuilder', {
      os: Os.WINDOWS,
      vpc: vpc,
    });

    // Add custom components to the Windows image
    ec2WindowsImageBuilder.addComponent(
      RunnerImageComponent.custom({
        name: 'Windows Tools',
        commands: [
          '$ErrorActionPreference = \'Stop\'',
          '$url = "https://www.python.org/ftp/python/3.12.1/python-3.12.1-amd64.exe"',
          '$installer = "$env:TEMP\\python-installer.exe"',
          'Invoke-WebRequest -Uri $url -OutFile $installer',
          '$p = Start-Process $installer -PassThru -Wait -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1"',
          'if ($p.ExitCode -ne 0) { throw "Exit code is $p.ExitCode" }',
          'Remove-Item $installer',
        ],
      }),
    );

    // EC2 provider with Windows
    const ec2WindowsProvider = new Ec2RunnerProvider(this, 'EC2WindowsProvider', {
      labels: ['ec2', 'windows', 'x64'],
      vpc: vpc,
      imageBuilder: ec2WindowsImageBuilder,
    });

    // Create the GitHub runners infrastructure
    new GitHubRunners(this, 'GitHubRunners', {
      providers: [
        ec2WindowsProvider,
      ],
    });
  }
}

const app = new App();
new Ec2WindowsProviderStack(app, 'ec2-windows-provider-example');
app.synth();
