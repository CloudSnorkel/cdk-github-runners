import { Architecture, Os, RunnerImageComponent, RunnerVersion } from '../src';

describe('Component version options', () => {
  test('cloudWatchAgent uses latest in URL', () => {
    const comp = RunnerImageComponent.cloudWatchAgent();
    const ubuntu = comp.getCommands(Os.LINUX_UBUNTU_2204, Architecture.X86_64);
    const win = comp.getCommands(Os.WINDOWS, Architecture.X86_64);
    expect(ubuntu.some(c => c.includes('/latest/'))).toBe(true);
    expect(win.some(c => c.includes('latest'))).toBe(true);
  });

  test('cloudWatchAgent Windows throws on ARM64 (x64 only)', () => {
    const comp = RunnerImageComponent.cloudWatchAgent();
    expect(() => comp.getCommands(Os.WINDOWS, Architecture.ARM64)).toThrow(
      /CloudWatch agent on Windows is only supported for x64/,
    );
  });

  test('awsCli uses version in URL when specified', () => {
    const latest = RunnerImageComponent.awsCli();
    const versioned = RunnerImageComponent.awsCli('2.15.0');

    const latestLinux = latest.getCommands(Os.LINUX_UBUNTU_2204, Architecture.X86_64);
    const versionedLinux = versioned.getCommands(Os.LINUX_UBUNTU_2204, Architecture.X86_64);
    expect(versionedLinux.some(c => c.includes('awscli-exe-linux-x86_64-2.15.0.zip'))).toBe(true);
    expect(latestLinux.some(c => c.includes('awscli-exe-linux-x86_64.zip'))).toBe(true);

    const versionedWin = versioned.getCommands(Os.WINDOWS, Architecture.X86_64);
    expect(versionedWin.some(c => c.includes('AWSCLIV2-2.15.0.msi'))).toBe(true);
  });

  test('awsCli treats empty string and latest as no version (avoids malformed URLs)', () => {
    const emptyStr = RunnerImageComponent.awsCli('');
    const latestStr = RunnerImageComponent.awsCli('latest');
    expect(emptyStr.getCommands(Os.LINUX_UBUNTU_2204, Architecture.X86_64).some(c => c.includes('awscli-exe-linux-x86_64.zip'))).toBe(true);
    expect(latestStr.getCommands(Os.LINUX_UBUNTU_2204, Architecture.X86_64).some(c => c.includes('awscli-exe-linux-x86_64.zip'))).toBe(true);
  });

  test('version with invalid characters throws (security)', () => {
    expect(() => RunnerImageComponent.awsCli('1.0; rm -rf /')).toThrow(/Invalid version.*only alphanumeric/);
    expect(() => RunnerImageComponent.docker('29.1.5;')).toThrow(/Invalid version.*only alphanumeric/); // trim would not remove ';'
    expect(() => RunnerImageComponent.githubCli('2.40.0$(whoami)')).toThrow(/Invalid version.*only alphanumeric/);
    expect(() => RunnerImageComponent.git('2.43.0.windows.1 ')).not.toThrow(); // trim makes it valid
  });

  test('validateVersion: trimmed version is used in URL', () => {
    const comp = RunnerImageComponent.awsCli('  2.15.0  ');
    const cmds = comp.getCommands(Os.LINUX_UBUNTU_2204, Architecture.X86_64);
    expect(cmds.some(c => c.includes('2.15.0') && c.includes('awscli-exe-linux'))).toBe(true);
    expect(cmds.some(c => c.includes('  2.15.0  '))).toBe(false);
  });

  test('validateVersion: Latest (case insensitive) is treated as no version', () => {
    const comp = RunnerImageComponent.awsCli('Latest');
    const cmds = comp.getCommands(Os.LINUX_UBUNTU_2204, Architecture.X86_64);
    expect(cmds.some(c => c.includes('awscli-exe-linux-x86_64.zip'))).toBe(true);
  });

  test('validateVersion: dots, dashes, underscores allowed', () => {
    expect(() => RunnerImageComponent.awsCli('2.15.0')).not.toThrow();
    expect(() => RunnerImageComponent.git('2.43.0.windows.1')).not.toThrow();
  });

  test('githubCli uses version on Windows when specified', () => {
    const latest = RunnerImageComponent.githubCli();
    const versioned = RunnerImageComponent.githubCli('2.40.0');

    const latestWin = latest.getCommands(Os.WINDOWS, Architecture.X86_64);
    const versionedWin = versioned.getCommands(Os.WINDOWS, Architecture.X86_64);
    expect(latestWin.some(c => c.includes('releases/latest'))).toBe(true);
    expect(versionedWin.some(c => c.includes('v2.40.0') && c.includes('gh_2.40.0'))).toBe(true);
    expect(versionedWin.length).toBeLessThan(latestWin.length); // no redirect fetch
  });

  test('githubCli treats empty string and latest as no version on Windows', () => {
    const emptyStr = RunnerImageComponent.githubCli('');
    const latestStr = RunnerImageComponent.githubCli('latest');
    expect(emptyStr.getCommands(Os.WINDOWS, Architecture.X86_64).some(c => c.includes('releases/latest'))).toBe(true);
    expect(latestStr.getCommands(Os.WINDOWS, Architecture.X86_64).some(c => c.includes('releases/latest'))).toBe(true);
  });

  test('githubCli Windows uses amd64 for x64 and arm64 for ARM64', () => {
    const versioned = RunnerImageComponent.githubCli('2.40.0');
    const x64 = versioned.getCommands(Os.WINDOWS, Architecture.X86_64);
    const arm64 = versioned.getCommands(Os.WINDOWS, Architecture.ARM64);
    expect(x64.some(c => c.includes('gh_2.40.0_windows_amd64.msi'))).toBe(true);
    expect(arm64.some(c => c.includes('gh_2.40.0_windows_arm64.msi'))).toBe(true);
  });

  test('git uses version on Windows when specified', () => {
    const latest = RunnerImageComponent.git();
    const versioned = RunnerImageComponent.git('2.43.0.windows.1');

    const latestWin = latest.getCommands(Os.WINDOWS, Architecture.X86_64);
    const versionedWin = versioned.getCommands(Os.WINDOWS, Architecture.X86_64);
    expect(latestWin.some(c => c.includes('releases/latest'))).toBe(true);
    expect(versionedWin.some(c => c.includes('v2.43.0.windows.1') && c.includes('Git-2.43.0-64-bit'))).toBe(true);
  });

  test('git revision 2+ is included in Windows download filename', () => {
    const versioned = RunnerImageComponent.git('2.43.0.windows.2');
    const versionedWin = versioned.getCommands(Os.WINDOWS, Architecture.X86_64);
    expect(versionedWin.some(c => c.includes('v2.43.0.windows.2') && c.includes('Git-2.43.0.2-64-bit.exe'))).toBe(true);
  });

  test('git treats empty string and latest as no version on Windows', () => {
    const emptyStr = RunnerImageComponent.git('');
    const latestStr = RunnerImageComponent.git('latest');
    expect(emptyStr.getCommands(Os.WINDOWS, Architecture.X86_64).some(c => c.includes('releases/latest'))).toBe(true);
    expect(latestStr.getCommands(Os.WINDOWS, Architecture.X86_64).some(c => c.includes('releases/latest'))).toBe(true);
  });

  test('docker throws when version specified and building for Ubuntu', () => {
    const comp = RunnerImageComponent.docker('29.1.5');
    expect(() => comp.getCommands(Os.LINUX_UBUNTU_2204, Architecture.X86_64)).toThrow(
      /RunnerImageComponent\.docker\(version\): version is only used on Windows/,
    );
  });

  test('docker throws when version specified and building for Amazon Linux', () => {
    const comp = RunnerImageComponent.docker('29.1.5');
    expect(() => comp.getCommands(Os.LINUX_AMAZON_2, Architecture.X86_64)).toThrow(
      /RunnerImageComponent\.docker\(version\): version is only used on Windows/,
    );
    expect(() => comp.getCommands(Os.LINUX_AMAZON_2023, Architecture.X86_64)).toThrow(
      /RunnerImageComponent\.docker\(version\): version is only used on Windows/,
    );
  });

  test('docker uses version when specified on Windows', () => {
    const versioned = RunnerImageComponent.docker('29.1.5');
    const versionedWin = versioned.getCommands(Os.WINDOWS, Architecture.X86_64);
    expect(versionedWin.some(c => c.includes('docker-29.1.5.zip'))).toBe(true);
  });

  test('docker Windows uses x86_64 for x64', () => {
    const versioned = RunnerImageComponent.docker('29.1.5');
    const x64 = versioned.getCommands(Os.WINDOWS, Architecture.X86_64).join(' ');
    expect(x64).toContain('stable/x86_64/');
    expect(x64).toContain('docker-compose-Windows-x86_64.exe');
  });

  test('docker Windows throws on ARM64 (x64 only at download.docker.com/win/static/stable/)', () => {
    const comp = RunnerImageComponent.docker();
    expect(() => comp.getCommands(Os.WINDOWS, Architecture.ARM64)).toThrow(
      /Docker on Windows is only supported for x64/,
    );
  });

  test('docker treats empty string and latest as no version on Windows (avoids docker-.zip)', () => {
    const emptyStr = RunnerImageComponent.docker('');
    const latestStr = RunnerImageComponent.docker('latest');
    const emptyCmds = emptyStr.getCommands(Os.WINDOWS, Architecture.X86_64).join(' ');
    const latestCmds = latestStr.getCommands(Os.WINDOWS, Architecture.X86_64).join(' ');
    expect(emptyCmds).not.toContain('docker-.zip');
    expect(latestCmds).not.toContain('docker-.zip');
  });

  test('docker uses latest on Ubuntu when version not specified', () => {
    const latest = RunnerImageComponent.docker();
    const ubuntu = latest.getCommands(Os.LINUX_UBUNTU_2204, Architecture.X86_64);
    expect(ubuntu.some(c => c.includes('apt-get install') && c.includes('docker-ce '))).toBe(true);
  });

  test('dockerInDocker forwards version to docker (Windows)', () => {
    const versioned = RunnerImageComponent.dockerInDocker('29.1.5');
    const cmds = versioned.getCommands(Os.WINDOWS, Architecture.X86_64);
    expect(cmds.some(c => c.includes('docker-29.1.5.zip'))).toBe(true);
  });

  test('git throws when version specified and building for Linux', () => {
    const comp = RunnerImageComponent.git('2.43.0.windows.1');
    expect(() => comp.getCommands(Os.LINUX_UBUNTU_2204, Architecture.X86_64)).toThrow(
      /RunnerImageComponent\.git\(version\): version is only used on Windows/,
    );
  });

  test('git does not throw when building for Windows', () => {
    const comp = RunnerImageComponent.git('2.43.0.windows.1');
    expect(() => comp.getCommands(Os.WINDOWS, Architecture.X86_64)).not.toThrow();
  });

  test('git Windows uses 64-bit for x64 and arm64 for ARM64', () => {
    const versioned = RunnerImageComponent.git('2.43.0.windows.1');
    const x64 = versioned.getCommands(Os.WINDOWS, Architecture.X86_64);
    const arm64 = versioned.getCommands(Os.WINDOWS, Architecture.ARM64);
    expect(x64.some(c => c.includes('Git-2.43.0-64-bit.exe'))).toBe(true);
    expect(arm64.some(c => c.includes('Git-2.43.0-arm64.exe'))).toBe(true);
  });

  test('githubRunner Windows uses x64 for X86_64 and arm64 for ARM64', () => {
    const comp = RunnerImageComponent.githubRunner(RunnerVersion.latest());
    const x64 = comp.getCommands(Os.WINDOWS, Architecture.X86_64);
    const arm64 = comp.getCommands(Os.WINDOWS, Architecture.ARM64);
    expect(x64.some(c => c.includes('actions-runner-win-x64-'))).toBe(true);
    expect(arm64.some(c => c.includes('actions-runner-win-arm64-'))).toBe(true);
  });

  test('git does not throw when version is not specified', () => {
    expect(() =>
      RunnerImageComponent.git().getCommands(Os.LINUX_UBUNTU_2204, Architecture.X86_64),
    ).not.toThrow();
  });

  test('githubCli throws when version specified and building for Linux', () => {
    const comp = RunnerImageComponent.githubCli('2.40.0');
    expect(() => comp.getCommands(Os.LINUX_UBUNTU_2204, Architecture.X86_64)).toThrow(
      /RunnerImageComponent\.githubCli\(version\): version is only used on Windows/,
    );
  });

  test('githubCli does not throw when building for Windows', () => {
    const comp = RunnerImageComponent.githubCli('2.40.0');
    expect(() => comp.getCommands(Os.WINDOWS, Architecture.X86_64)).not.toThrow();
  });
});

test('Environment variable escaping', () => {
  const comp = RunnerImageComponent.environmentVariables({
    test: '$h$e>>llo\'""\'\'"',
    normal: 'bar',
  });

  const linuxCommands = comp.getCommands(Os.LINUX_AMAZON_2, Architecture.X86_64);
  const winCommands = comp.getCommands(Os.WINDOWS, Architecture.X86_64);

  linuxCommands.forEach(c => console.log(c));
  winCommands.forEach(c => console.log(c));

  expect(linuxCommands).toStrictEqual([
    'echo \'test=$h$e>>llo\'"\'"\'""\'"\'"\'\'"\'"\'"\' >> /home/runner/.env',
    'echo \'normal=bar\' >> /home/runner/.env',
  ]);

  expect(winCommands).toStrictEqual([
    'Add-Content -Path C:\\actions\\.env -Value \'test=$h$e>>llo\'\'""\'\'\'\'"\'',
    'Add-Content -Path C:\\actions\\.env -Value \'normal=bar\'',
  ]);
});

test('Environment variable should not contain newlines', () => {
  expect(() => {
    RunnerImageComponent.environmentVariables({
      linebreak: 'foo\nbar',
    });
  }).toThrow(/Environment variable cannot contain newlines: /);

  expect(() => {
    RunnerImageComponent.environmentVariables({
      'foo\nbar': 'hello',
    });
  }).toThrow(/Environment variable cannot contain newlines: /);
});
