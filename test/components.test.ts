import { Architecture, Os, RunnerImageComponent } from '../src';

describe('Component version options', () => {
  test('cloudWatchAgent uses latest in URL', () => {
    const comp = RunnerImageComponent.cloudWatchAgent();
    const ubuntu = comp.getCommands(Os.LINUX_UBUNTU_2204, Architecture.X86_64);
    const win = comp.getCommands(Os.WINDOWS, Architecture.X86_64);
    expect(ubuntu.some(c => c.includes('/latest/'))).toBe(true);
    expect(win.some(c => c.includes('latest'))).toBe(true);
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

  test('githubCli uses version on Windows when specified', () => {
    const latest = RunnerImageComponent.githubCli();
    const versioned = RunnerImageComponent.githubCli('2.40.0');

    const latestWin = latest.getCommands(Os.WINDOWS, Architecture.X86_64);
    const versionedWin = versioned.getCommands(Os.WINDOWS, Architecture.X86_64);
    expect(latestWin.some(c => c.includes('releases/latest'))).toBe(true);
    expect(versionedWin.some(c => c.includes('v2.40.0') && c.includes('gh_2.40.0'))).toBe(true);
    expect(versionedWin.length).toBeLessThan(latestWin.length); // no redirect fetch
  });

  test('git uses version on Windows when specified', () => {
    const latest = RunnerImageComponent.git();
    const versioned = RunnerImageComponent.git('2.43.0.windows.1');

    const latestWin = latest.getCommands(Os.WINDOWS, Architecture.X86_64);
    const versionedWin = versioned.getCommands(Os.WINDOWS, Architecture.X86_64);
    expect(latestWin.some(c => c.includes('releases/latest'))).toBe(true);
    expect(versionedWin.some(c => c.includes('v2.43.0.windows.1') && c.includes('Git-2.43.0-64-bit'))).toBe(true);
  });

  test('docker throws when version specified and building for Ubuntu', () => {
    const comp = RunnerImageComponent.docker('29.1.5');
    expect(() => comp.getCommands(Os.LINUX_UBUNTU_2204, Architecture.X86_64)).toThrow(
      /RunnerImageComponent\.docker\(version\): version is only used on Windows/,
    );
  });

  test('docker uses version when specified on Windows', () => {
    const versioned = RunnerImageComponent.docker('29.1.5');
    const versionedWin = versioned.getCommands(Os.WINDOWS, Architecture.X86_64);
    expect(versionedWin.some(c => c.includes('docker-29.1.5.zip'))).toBe(true);
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
