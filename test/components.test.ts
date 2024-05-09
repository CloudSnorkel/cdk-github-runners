import { Architecture, Os, RunnerImageComponent } from '../src';

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
