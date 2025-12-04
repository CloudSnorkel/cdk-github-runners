import * as imagebuilder2 from '@aws-cdk/aws-imagebuilder-alpha';
import { aws_s3_assets as s3_assets } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Architecture, Os, RunnerVersion } from '../../../providers';
import { RunnerImageComponent } from '../../components';
import { ImageBuilderComponent } from '../builder';

/**
 * Components for Windows that can be used with AWS Image Builder based builders. These cannot be used by {@link CodeBuildImageBuilder}.
 *
 * @deprecated Use `RunnerImageComponent` instead.
 */
export class WindowsComponents {
  public static cloudwatchAgent(scope: Construct, id: string) {
    return new ImageBuilderComponent(scope, id, {
      platform: imagebuilder2.Platform.WINDOWS,
      displayName: 'CloudWatch agent',
      description: 'Install latest version of CloudWatch agent for sending logs to CloudWatch',
      commands: [
        '$p = Start-Process msiexec.exe -PassThru -Wait -ArgumentList \'/i https://s3.amazonaws.com/amazoncloudwatch-agent/windows/amd64/latest/amazon-cloudwatch-agent.msi /qn\'',
        'if ($p.ExitCode -ne 0) { throw "Exit code is $p.ExitCode" }',
      ],
    });
  }

  public static awsCli(scope: Construct, id: string) {
    return new ImageBuilderComponent(scope, id, {
      platform: imagebuilder2.Platform.WINDOWS,
      displayName: 'AWS CLI',
      description: 'Install latest version of AWS CLI',
      commands: [
        '$p = Start-Process msiexec.exe -PassThru -Wait -ArgumentList \'/i https://awscli.amazonaws.com/AWSCLIV2.msi /qn\'',
        'if ($p.ExitCode -ne 0) { throw "Exit code is $p.ExitCode" }',
      ],
    });
  }

  public static githubCli(scope: Construct, id: string) {
    return new ImageBuilderComponent(scope, id, {
      platform: imagebuilder2.Platform.WINDOWS,
      displayName: 'GitHub CLI',
      description: 'Install latest version of gh',
      commands: [
        'cmd /c curl -w "%{redirect_url}" -fsS https://github.com/cli/cli/releases/latest > $Env:TEMP\\latest-gh',
        '$LatestUrl = Get-Content $Env:TEMP\\latest-gh',
        '$GH_VERSION = ($LatestUrl -Split \'/\')[-1].substring(1)',
        'Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_windows_amd64.msi" -OutFile gh.msi',
        '$p = Start-Process msiexec.exe -PassThru -Wait -ArgumentList \'/i gh.msi /qn\'',
        'if ($p.ExitCode -ne 0) { throw "Exit code is $p.ExitCode" }',
        'del gh.msi',
      ],
    });
  }

  public static git(scope: Construct, id: string) {
    return new ImageBuilderComponent(scope, id, {
      platform: imagebuilder2.Platform.WINDOWS,
      displayName: 'Git',
      description: 'Install latest version of git',
      commands: [
        'cmd /c curl -w "%{redirect_url}" -fsS https://github.com/git-for-windows/git/releases/latest > $Env:TEMP\\latest-git',
        '$LatestUrl = Get-Content $Env:TEMP\\latest-git',
        '$GIT_VERSION = ($LatestUrl -Split \'/\')[-1].substring(1)',
        '$GIT_VERSION_SHORT = ($GIT_VERSION -Split \'.windows.\')[0]',
        '$GIT_REVISION = ($GIT_VERSION -Split \'.windows.\')[1]',
        'If ($GIT_REVISION -gt 1) {$GIT_VERSION_SHORT = "$GIT_VERSION_SHORT.$GIT_REVISION"}',
        'Invoke-WebRequest -UseBasicParsing -Uri https://github.com/git-for-windows/git/releases/download/v${GIT_VERSION}/Git-${GIT_VERSION_SHORT}-64-bit.exe -OutFile git-setup.exe',
        '$p = Start-Process git-setup.exe -PassThru -Wait -ArgumentList \'/VERYSILENT\'',
        'if ($p.ExitCode -ne 0) { throw "Exit code is $p.ExitCode" }',
        'del git-setup.exe',
      ],
    });
  }

  public static githubRunner(scope: Construct, id: string, runnerVersion: RunnerVersion) {
    let runnerCommands: string[];
    if (runnerVersion.is(RunnerVersion.latest())) {
      runnerCommands = [
        'cmd /c curl -w "%{redirect_url}" -fsS https://github.com/actions/runner/releases/latest > $Env:TEMP\\latest-gha',
        '$LatestUrl = Get-Content $Env:TEMP\\latest-gha',
        '$RUNNER_VERSION = ($LatestUrl -Split \'/\')[-1].substring(1)',
      ];
    } else {
      runnerCommands = [`$RUNNER_VERSION = '${runnerVersion.version}'`];
    }

    return new ImageBuilderComponent(scope, id, {
      platform: imagebuilder2.Platform.WINDOWS,
      displayName: 'GitHub Actions Runner',
      description: 'Install latest version of GitHub Actions Runner',
      commands: runnerCommands.concat([
        'Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-win-x64-${RUNNER_VERSION}.zip" -OutFile actions.zip',
        'Expand-Archive actions.zip -DestinationPath C:\\actions',
        'del actions.zip',
        `echo ${runnerVersion.version} | Out-File -Encoding ASCII -NoNewline C:\\actions\\RUNNER_VERSION`,
      ]),
    });
  }

  public static docker(scope: Construct, id: string) {
    return new ImageBuilderComponent(scope, id, {
      platform: imagebuilder2.Platform.WINDOWS,
      displayName: 'Docker',
      description: 'Install latest version of Docker',
      commands: RunnerImageComponent.docker().getCommands(Os.WINDOWS, Architecture.X86_64),
      reboot: true,
    });
  }

  public static extraCertificates(scope: Construct, id: string, path: string) {
    return new ImageBuilderComponent(scope, id, {
      platform: imagebuilder2.Platform.WINDOWS,
      displayName: 'Extra certificates',
      description: 'Install self-signed certificates to provide access to GitHub Enterprise Server',
      commands: [
        'Import-Certificate -FilePath certs\\certs.pem -CertStoreLocation Cert:\\LocalMachine\\Root',
      ],
      assets: [
        {
          path: 'certs',
          asset: new s3_assets.Asset(scope, `${id} Asset`, { path }),
        },
      ],
    });
  }
}
