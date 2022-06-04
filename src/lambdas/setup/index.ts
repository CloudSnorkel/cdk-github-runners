/* eslint-disable import/no-extraneous-dependencies */
import * as crypto from 'crypto';
import * as querystring from 'querystring';
import { Octokit } from '@octokit/rest';
import { getSecretJsonValue, updateSecretValue } from '../helpers';

function getHtml(manifest: string, token: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8"/>
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <title>Setup GitHub Runners</title>
<body>
<h1>Setup GitHub Runners</h1>
<p>You can choose between creating a new app that will provide authentication for specific repositories, or a personal access token that will provide access to all repositories available to you. Apps are easier to set up and provide more fine-grained access control.</p>
<h2>Using App</h2>
<p>Choose whether you want a personal app, an organization app, or an existing app created according to the instructions in <a href="https://github.com/CloudSnorkel/cdk-github-runners/blob/main/SETUP_GITHUB.md">SETUP_GITHUB.md</a>. The scope of the app should match the scope of the repositories you need to provide runners for.</p>
<form action="https://github.com/settings/apps/new?state=${token}" method="post">
    <fieldset>
        <legend>New Personal App</legend>
        <input type="hidden" name="manifest" id="manifest">
        <input type="submit" value="Create">
    </fieldset>
</form>

<br>
<form action="https://github.com/organizations/ORGANIZATION/settings/apps/new?state=${token}" method="post">
    <fieldset>
        <legend>New Organization App</legend>
        <label for="org">Organization slug:</label>
        <input id="org" name="org" value="ORGANIZATION" onchange="this.form.action = \`https://github.com/organizations/\${this.value}/settings/apps/new?state=${token}\`"><br><br>
        <input type="hidden" name="manifest" id="manifestorg">
        <input type="submit" value="Create">
    </fieldset>
</form>

<br>
<form action="app" method="post">
    <fieldset>
        <p>Existing apps must have <code>actions</code> and <code>administration</code> write permissions. Don't forget to set up the webhook and its secret as described in <a href="https://github.com/CloudSnorkel/cdk-github-runners/blob/main/SETUP_GITHUB.md">SETUP_GITHUB.md</a>.</p>
        <legend>Existing App</legend>
        <label for="pat">App Id:</label>
        <input type="number" id="appid" name="appid"><br><br>
        <label for="pk">Private key:</label>
        <textarea id="pk" name="pk"></textarea><br><br>
        <input type="submit" value="Set">
    </fieldset>
</form>

<script>
    document.getElementById("manifest").value = JSON.stringify(${manifest});
    document.getElementById("manifestorg").value = JSON.stringify(${manifest});
</script>

<h2>Using Personal Access Token</h2>
<p>The personal token must have the <code>repo</code> scope enable. Don't forget to also create a webhook as described in <a href="https://github.com/CloudSnorkel/cdk-github-runners/blob/main/SETUP_GITHUB.md">SETUP_GITHUB.md</a>.</p>
<form action="pat?token=${token}" method="post">
    <fieldset>
        <label for="pat">Token:</label>
        <input type="password" id="pat" name="pat">
        <input type="submit" value="Set">
    </fieldset>
</form>
</body>
</html>
`;
}

function getManifest(baseUrl: string) {
  return JSON.stringify({
    url: 'https://github.com/CloudSnorkel/cdk-github-runners',
    hook_attributes: {
      url: process.env.WEBHOOK_URL,
    },
    redirect_url: `${baseUrl}/complete-new-app`,
    public: false,
    default_permissions: {
      actions: 'write',
      administration: 'write',
    },
    default_events: [
      'workflow_job',
    ],
  });
}

async function handleRoot(event: any, setupToken: string) {
  const setupBaseUrl = `https://${event.requestContext.domainName}`;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html',
    },
    body: getHtml(getManifest(setupBaseUrl), setupToken),
  };
}

function decodeBody(event: any) {
  let body = event.body;
  if (event.isBase64Encoded) {
    body = Buffer.from(body, 'base64').toString('utf-8');
  }
  return querystring.decode(body);
}

async function handlePat(event: any) {
  const body = decodeBody(event);
  if (!body.pat) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'text/html',
      },
      body: 'Invalid personal access token',
    };
  }

  await updateSecretValue(process.env.GITHUB_SECRET_ARN, JSON.stringify({
    domain: 'github.com',
    appId: '',
    personalAuthToken: body.pat,
  }));
  await updateSecretValue(process.env.SETUP_SECRET_ARN, JSON.stringify({ token: '' }));

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html',
    },
    body: 'Personal access token set',
  };
}

async function handleNewApp(event: any) {
  const code = event.queryStringParameters.code;

  if (!code) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'text/html',
      },
      body: 'Invalid code',
    };
  }

  const newApp = await new Octokit().rest.apps.createFromManifest({ code });

  await updateSecretValue(process.env.GITHUB_SECRET_ARN, JSON.stringify({
    domain: 'github.com',
    appId: newApp.data.id,
    personalAuthToken: '',
  }));
  await updateSecretValue(process.env.GITHUB_PRIVATE_KEY_SECRET_ARN, newApp.data.pem);
  await updateSecretValue(process.env.WEBHOOK_SECRET_ARN, JSON.stringify({
    webhookSecret: newApp.data.webhook_secret,
  }));
  await updateSecretValue(process.env.SETUP_SECRET_ARN, JSON.stringify({ token: '' }));

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html',
    },
    body: `New app set. <a href="${newApp.data.html_url}/installations/new">Install it</a> for your repositories.`,
  };
}

exports.handler = async function (event: any) {
  // confirm required environment variables
  if (!process.env.WEBHOOK_URL) {
    throw new Error('Missing environment variables');
  }

  const setupToken = (await getSecretJsonValue(process.env.SETUP_SECRET_ARN)).token;

  // bail out if setup was already completed
  if (!setupToken) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
      },
      body: 'Setup already complete. Put a new token in the setup secret if you want to redo it.',
    };
  }

  if (!event.queryStringParameters) {
    return {
      statusCode: 403,
      headers: {
        'Content-Type': 'text/html',
      },
      body: 'Wrong setup token.',
    };
  }

  // safely confirm url token matches our secret
  const urlToken = event.queryStringParameters.token || event.queryStringParameters.state;
  if (urlToken.length != setupToken.length || !crypto.timingSafeEqual(Buffer.from(urlToken, 'utf-8'), Buffer.from(setupToken, 'utf-8'))) {
    return {
      statusCode: 403,
      headers: {
        'Content-Type': 'text/html',
      },
      body: 'Wrong setup token.',
    };
  }

  // handle requests
  if (event.requestContext.http.path == '/') {
    return handleRoot(event, setupToken);
  } else if (event.requestContext.http.path == '/pat' && event.requestContext.http.method == 'POST') {
    return handlePat(event);
  } else if (event.requestContext.http.path == '/complete-new-app' && event.requestContext.http.method == 'GET') {
    return handleNewApp(event);
  } else {
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'text/html',
      },
      body: 'Not found',
    };
  }
};
