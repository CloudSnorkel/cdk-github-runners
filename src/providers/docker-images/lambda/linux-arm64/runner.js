const exec = require('child_process').exec;

exports.handler = async (event, context) => {
  await new Promise((resolve, reject) => {
    const shellScript = exec('sh runner.sh', {
      env: {
        ...process.env,
        RUNNER_JIT_CONFIG: event.jitConfig || '',
        RUNNER_NAME: event.runnerName,
        RUNNER_LABEL: event.label,
        OWNER: event.owner,
        REPO: event.repo,
        GITHUB_DOMAIN: event.githubDomain,
        // DEPRECATED: remove in 1.0.0. only executions that started before JIT runners pass these, to register with a registration token.
        RUNNER_TOKEN: event.token || '',
        REGISTRATION_URL: event.registrationUrl || '',
      },
    });
    shellScript.stdout.on('data', (data) => {
      console.log(data);
    });
    shellScript.stderr.on('data', (data) => {
      console.error(data);
    });
    shellScript.on('exit', (code) => {
      if (code) {
        reject(new Error(`Runner failed with exit code ${code}`));
      } else {
        resolve();
      }
    });
  });
}
