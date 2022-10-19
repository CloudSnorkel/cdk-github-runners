import { Construct } from 'constructs';
import { RunnerVersion } from '../common';
import { ImageBuilderComponent } from './common';

/**
 * Components for Windows that can be used with AWS Image Builder based builders. These cannot be used by CodeBuildImageBuilder.
 */
export class WindowsComponents {
  public static cloudwatchAgent(scope: Construct, id: string) {
    return new ImageBuilderComponent(scope, id, {
      platform: 'Windows',
      displayName: 'CloudWatch agent',
      description: 'Install latest version of CloduWatch agent for sending logs to CloudWatch',
      commands: [
        '$ErrorActionPreference = \'Stop\'',
        'Start-Process msiexec.exe -Wait -ArgumentList \'/i https://s3.amazonaws.com/amazoncloudwatch-agent/windows/amd64/latest/amazon-cloudwatch-agent.msi /qn\'',
      ],
    });
  }

  public static awsCli(scope: Construct, id: string) {
    return new ImageBuilderComponent(scope, id, {
      platform: 'Windows',
      displayName: 'AWS CLI',
      description: 'Install latest version of AWS CLI',
      commands: [
        '$ErrorActionPreference = \'Stop\'',
        'Start-Process msiexec.exe -Wait -ArgumentList \'/i https://awscli.amazonaws.com/AWSCLIV2.msi /qn\'',
      ],
    });
  }

  public static githubCli(scope: Construct, id: string) {
    return new ImageBuilderComponent(scope, id, {
      platform: 'Windows',
      displayName: 'GitHub CLI',
      description: 'Install latest version of gh',
      commands: [
        '$ErrorActionPreference = \'Stop\'',
        'cmd /c curl -w "%{redirect_url}" -fsS https://github.com/cli/cli/releases/latest > $Env:TEMP\\latest-gh',
        '$LatestUrl = Get-Content $Env:TEMP\\latest-gh',
        '$GH_VERSION = ($LatestUrl -Split \'/\')[-1].substring(1)',
        '$ProgressPreference = \'SilentlyContinue\'',
        'Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_windows_amd64.msi" -OutFile gh.msi',
        'Start-Process msiexec.exe -Wait -ArgumentList \'/i gh.msi /qn\'',
        'del gh.msi',
      ],
    });
  }

  public static git(scope: Construct, id: string) {
    return new ImageBuilderComponent(scope, id, {
      platform: 'Windows',
      displayName: 'Git',
      description: 'Install latest version of git',
      commands: [
        '$ErrorActionPreference = \'Stop\'',
        '$ProgressPreference = \'SilentlyContinue\'',
        'cmd /c curl -w "%{redirect_url}" -fsS https://github.com/git-for-windows/git/releases/latest > $Env:TEMP\\latest-git',
        '$LatestUrl = Get-Content $Env:TEMP\\latest-git',
        '$GIT_VERSION = ($LatestUrl -Split \'/\')[-1].substring(1)',
        '$GIT_VERSION_SHORT = ($GIT_VERSION -Split \'.windows.\')[0]',
        'Invoke-WebRequest -UseBasicParsing -Uri https://github.com/git-for-windows/git/releases/download/v${GIT_VERSION}/Git-${GIT_VERSION_SHORT}-64-bit.exe -OutFile git-setup.exe',
        'Start-Process git-setup.exe -Wait -ArgumentList \'/VERYSILENT\'',
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
      platform: 'Windows',
      displayName: 'GitHub Actions Runner',
      description: 'Install latest version of GitHub Actions Runner',
      commands: [
        '$ErrorActionPreference = \'Stop\'',
        '$ProgressPreference = \'SilentlyContinue\'',
      ].concat(runnerCommands, [
        'Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-win-x64-${RUNNER_VERSION}.zip" -OutFile actions.zip',
        'Expand-Archive actions.zip -DestinationPath C:\\actions',
        'del actions.zip',
      ]),
    });
  }

  public static docker(scope: Construct, id: string) {
    return new ImageBuilderComponent(scope, id, {
      platform: 'Windows',
      displayName: 'Docker',
      description: 'Install latest version of Docker',
      commands: [
        '$ErrorActionPreference = \'Stop\'',
        '$ProgressPreference = \'SilentlyContinue\'',
        'Invoke-WebRequest -UseBasicParsing -Uri https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe -OutFile docker-setup.exe',
        'Start-Process \'docker-setup.exe\' -Wait -ArgumentList \'/install --quiet --accept-license\'',
        'del docker-setup.exe',
        'cmd /c curl -w "%{redirect_url}" -fsS https://github.com/docker/compose/releases/latest > $Env:TEMP\\latest-docker-compose',
        '$LatestUrl = Get-Content $Env:TEMP\\latest-docker-compose',
        '$LatestDockerCompose = ($LatestUrl -Split \'/\')[-1]',
        'Invoke-WebRequest -UseBasicParsing -Uri  "https://github.com/docker/compose/releases/download/${LatestDockerCompose}/docker-compose-Windows-x86_64.exe" -OutFile $Env:ProgramFiles\\Docker\\docker-compose.exe',
        'copy $Env:ProgramFiles\\Docker\\docker-compose.exe $Env:ProgramFiles\\Docker\\cli-plugins\\docker-compose.exe',
      ],
    });
  }
}
