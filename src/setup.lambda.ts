import * as crypto from 'crypto';
import * as fs from 'fs';
import { Octokit } from '@octokit/rest';
import * as AWSLambda from 'aws-lambda';
import { baseUrlFromDomain, GitHubSecrets } from './lambda-github';
import { getSecretJsonValue, updateSecretValue } from './lambda-helpers';

type ApiGatewayEvent = AWSLambda.APIGatewayProxyEvent | AWSLambda.APIGatewayProxyEventV2;

const nonce = crypto.randomBytes(64).toString('hex');

function getHtml(baseUrl: string, token: string, domain: string): string {
  return fs.readFileSync('index.html', 'utf-8')
    .replace(/INSERT_WEBHOOK_URL_HERE/g, process.env.WEBHOOK_URL!)
    .replace(/INSERT_BASE_URL_HERE/g, baseUrl)
    .replace(/INSERT_TOKEN_HERE/g, token)
    .replace(/INSERT_SECRET_ARN_HERE/g, process.env.SETUP_SECRET_ARN!)
    .replace(/INSERT_DOMAIN_HERE/g, domain)
    .replace(/<script/g, `<script nonce="${nonce}"`)
    .replace(/<style/g, `<style nonce="${nonce}"`);
}

function response(code: number, body: string): AWSLambda.APIGatewayProxyResultV2 {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'text/html',
      'Content-Security-Policy': `default-src 'unsafe-inline' 'nonce-${nonce}'; img-src data:; connect-src 'self'; form-action https:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'`,
    },
    body: body,
  };
}

async function handleRoot(event: ApiGatewayEvent, setupToken: string): Promise<AWSLambda.APIGatewayProxyResultV2> {
  const stage = event.requestContext.stage == '$default' ? '' : `/${event.requestContext.stage}`;
  const setupBaseUrl = `https://${event.requestContext.domainName}${stage}`;
  const githubSecrets: GitHubSecrets = await getSecretJsonValue(process.env.GITHUB_SECRET_ARN);

  return response(200, getHtml(setupBaseUrl, setupToken, githubSecrets.domain));
}

function decodeBody(event: ApiGatewayEvent) {
  let body = event.body;
  if (!body) {
    throw new Error('No body found');
  }
  if (event.isBase64Encoded) {
    body = Buffer.from(body, 'base64').toString('utf-8');
  }
  return JSON.parse(body);
}

async function handleDomain(event: ApiGatewayEvent): Promise<AWSLambda.APIGatewayProxyResultV2> {
  const body = decodeBody(event);
  if (!body.domain) {
    return response(400, 'Invalid domain');
  }
  if (body.runnerLevel !== 'repo' && body.runnerLevel !== 'org') {
    return response(400, 'Invalid runner registration level');
  }

  const githubSecrets: GitHubSecrets = await getSecretJsonValue(process.env.GITHUB_SECRET_ARN);
  githubSecrets.domain = body.domain;
  githubSecrets.runnerLevel = body.runnerLevel;
  await updateSecretValue(process.env.GITHUB_SECRET_ARN, JSON.stringify(githubSecrets));
  return response(200, 'Domain set');
}

async function handlePat(event: ApiGatewayEvent): Promise<AWSLambda.APIGatewayProxyResultV2> {
  const body = decodeBody(event);
  if (!body.pat || !body.domain) {
    return response(400, 'Invalid personal access token');
  }

  await updateSecretValue(process.env.GITHUB_SECRET_ARN, JSON.stringify(<GitHubSecrets>{
    domain: body.domain,
    appId: -1,
    personalAuthToken: body.pat,
    runnerLevel: 'repo',
  }));
  await updateSecretValue(process.env.SETUP_SECRET_ARN, JSON.stringify({ token: '' }));

  return response(200, 'Personal access token set');
}

async function handleNewApp(event: ApiGatewayEvent): Promise<AWSLambda.APIGatewayProxyResultV2> {
  if (!event.queryStringParameters) {
    return response(400, 'Invalid code');
  }

  const code = event.queryStringParameters.code;

  if (!code) {
    return response(400, 'Invalid code');
  }

  const githubSecrets: GitHubSecrets = await getSecretJsonValue(process.env.GITHUB_SECRET_ARN);
  const baseUrl = baseUrlFromDomain(githubSecrets.domain);
  const newApp = await new Octokit({ baseUrl }).rest.apps.createFromManifest({ code });

  githubSecrets.appId = newApp.data.id;
  githubSecrets.domain = new URL(newApp.data.html_url).host; // just in case it's different
  githubSecrets.personalAuthToken = '';
  // don't update runnerLevel as it was set by handleDomain() above

  await updateSecretValue(process.env.GITHUB_SECRET_ARN, JSON.stringify(githubSecrets));
  await updateSecretValue(process.env.GITHUB_PRIVATE_KEY_SECRET_ARN, newApp.data.pem);
  await updateSecretValue(process.env.WEBHOOK_SECRET_ARN, JSON.stringify({
    webhookSecret: newApp.data.webhook_secret,
  }));
  await updateSecretValue(process.env.SETUP_SECRET_ARN, JSON.stringify({ token: '' }));

  return response(200, `New app set. <a href="${newApp.data.html_url}/installations/new">Install it</a> for your repositories.`);
}

async function handleExistingApp(event: ApiGatewayEvent): Promise<AWSLambda.APIGatewayProxyResultV2> {
  const body = decodeBody(event);

  if (!body.appid || !body.pk || !body.domain || (body.runnerLevel !== 'repo' && body.runnerLevel !== 'org')) {
    return response(400, 'Missing fields');
  }

  await updateSecretValue(process.env.GITHUB_SECRET_ARN, JSON.stringify(<GitHubSecrets>{
    domain: body.domain,
    appId: body.appid,
    personalAuthToken: '',
    runnerLevel: body.runnerLevel,
  }));
  await updateSecretValue(process.env.GITHUB_PRIVATE_KEY_SECRET_ARN, body.pk as string);
  await updateSecretValue(process.env.SETUP_SECRET_ARN, JSON.stringify({ token: '' }));

  return response(200, 'Existing app set. Don\'t forget to set up the webhook.');
}

export async function handler(event: ApiGatewayEvent): Promise<AWSLambda.APIGatewayProxyResultV2> {
  // confirm required environment variables
  if (!process.env.WEBHOOK_URL) {
    throw new Error('Missing environment variables');
  }

  const setupToken = (await getSecretJsonValue(process.env.SETUP_SECRET_ARN)).token;

  // bail out if setup was already completed
  if (!setupToken) {
    return response(200, 'Setup already complete. Put a new token in the setup secret if you want to redo it.');
  }

  if (!event.queryStringParameters) {
    return response(403, 'Wrong setup token.');
  }

  // safely confirm url token matches our secret
  const urlToken = event.queryStringParameters.token || event.queryStringParameters.state || '';
  if (urlToken.length != setupToken.length || !crypto.timingSafeEqual(Buffer.from(urlToken, 'utf-8'), Buffer.from(setupToken, 'utf-8'))) {
    return response(403, 'Wrong setup token.');
  }

  // handle requests
  try {
    const path = (event as AWSLambda.APIGatewayProxyEvent).path ?? (event as AWSLambda.APIGatewayProxyEventV2).rawPath;
    const method = (event as AWSLambda.APIGatewayProxyEvent).httpMethod ?? (event as AWSLambda.APIGatewayProxyEventV2).requestContext.http.method;
    if (path == '/') {
      return await handleRoot(event, setupToken);
    } else if (path == '/domain' && method == 'POST') {
      return await handleDomain(event);
    } else if (path == '/pat' && method == 'POST') {
      return await handlePat(event);
    } else if (path == '/complete-new-app' && method == 'GET') {
      return await handleNewApp(event);
    } else if (path == '/app' && method == 'POST') {
      return await handleExistingApp(event);
    } else {
      return response(404, 'Not found');
    }
  } catch (e) {
    console.error(e);
    return response(500, `<b>Error:</b> ${e}`);
  }
}
