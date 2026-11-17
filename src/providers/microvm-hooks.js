// MicroVM lifecycle hook server. It's the image entrypoint, so it's also what Lambda snapshots when the image is built.
//
// Lambda POSTs /run with the runner details the step function put in the run hook payload. Hooks have to answer within
// a minute, so we only start the runner here and report the result with the task token once it's done. Then we exit,
// and since we're the main process of the MicroVM, that ends it. We exit to maintain separation between runners.
//
// This runs on the node the GitHub runner brings along for JavaScript actions. See RunnerImageComponent.microVmEntrypoint().

const http = require('http');
const { execFile, spawn } = require('child_process');

const PORT = 9000; // must match HOOK_PORT in microvm.ts, as that's the port we tell Lambda to call

function aws(...args) {
  spawn('aws', args, { stdio: 'inherit' });
}

function run(body) {
  const payload = JSON.parse(body.runHookPayload);
  const token = payload.taskToken;

  // the step function gives up on us if it doesn't hear from us for 10 minutes
  const heartbeat = setInterval(() => aws('stepfunctions', 'send-task-heartbeat', '--task-token', token), 60_000);

  const done = (error, cause) => {
    clearInterval(heartbeat);
    const report = error
      ? ['stepfunctions', 'send-task-failure', '--task-token', token, '--error', error, '--cause', cause]
      : ['stepfunctions', 'send-task-success', '--task-token', token, '--task-output', '{}'];
    // exit even if the report fails, like when the idle reaper already stopped the step function
    spawn('aws', report, { stdio: 'inherit' }).on('close', () => process.exit(0));
  };

  // the JIT config is too big for the run hook payload, so it waits for us in an SSM parameter only we know the name of
  const getParameter = ['ssm', 'get-parameter', '--name', payload.jitConfigParameter, '--with-decryption', '--query', 'Parameter.Value', '--output', 'text'];
  execFile('aws', getParameter, (error, jitConfig) => {
    if (error) {
      done('Runner.Error', `Unable to get JIT config: ${error.message}`);
      return;
    }

    aws('ssm', 'delete-parameter', '--name', payload.jitConfigParameter);

    // the hook server is root, but jobs should run as the runner user
    const runnerCmd = [
      '--preserve-env=AWS_REGION',
      '-H',
      '-u', 'runner',
      'bash', '/runner.sh', JSON.stringify({ ...payload, jitConfig: jitConfig.trim() })
    ];
    const runner = spawn('sudo', runnerCmd, { stdio: 'inherit', cwd: '/home/runner' });

    runner.on('error', (e) => {
      done('Runner.Error', `Unable to start the runner: ${e.message}`);
    });

    runner.on('exit', (code) => {
      console.log({ notice: 'Runner done', code });

      if (code === 0) {
        done();
      } else {
        done(`Runner.Error.${code}`, 'Runner failed, check the runner log group for the full log');
      }
    });
  });
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => body += chunk);
  req.on('end', () => {
    console.log({ notice: 'Hook called', hook: req.url });

    // answering at all is the answer for /ready: if we're serving, the runner can be started
    res.writeHead(200).end();

    if (req.url.endsWith('/run')) {
      // never let a bad hook take the server down with it, or the MicroVM is stuck until its maximum duration
      try {
        run(JSON.parse(body));
      } catch (e) {
        console.error({ notice: 'Unable to handle run hook', error: e });
        process.exit(1);
      }
    }
  });
});

server.listen(PORT, () => console.log({ notice: 'Hook server listening', port: PORT }));
