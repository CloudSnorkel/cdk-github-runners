import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import {
  DescribeExecutionCommand,
  ExecutionStatus,
  GetExecutionHistoryCommand,
  HistoryEventType,
  ListExecutionsCommand,
  SFNClient,
} from '@aws-sdk/client-sfn';
import * as AWSLambda from 'aws-lambda';
import { getAppOctokit, getOctokit } from './lambda-github';
import { getSecretJsonValue, getSecretValue } from './lambda-helpers';
import {
  executionArnToUrl,
  generateProvidersStatus,
  lambdaArnToLogGroup,
  logGroupUrl,
  logStreamUrl,
  regionFromArn,
  secretArnToUrl,
  stepFunctionArnToUrl,
} from './troubleshoot-helpers';

const sf = new SFNClient();
const cwl = new CloudWatchLogsClient();

const STALE_IMAGE_DAYS = 14;
const STUCK_EXECUTION_HOURS = 2;
const LOG_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MAX_EXECUTION_PAGES = 10;

// ---- types ----

interface Issue {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  title: string;
  description: string;
  suggestion: string;
  executionArn?: string;
  links: Record<string, string>;
}

interface TroubleshootReport {
  config: {
    auth: 'ok' | string;
    webhook: 'ok' | string;
    secrets: 'ok' | string;
  };
  summary: {
    executions: { total: number; succeeded: number; failed: number; aborted: number; timedOut: number; running: number };
    health: 'healthy' | 'warning' | 'critical';
    analysisWindow: string;
  };
  issues: Issue[];
  deepLinks: {
    stepFunction: string;
    webhookHandlerLogs: string;
    orchestratorLogs: string;
    providerLogs: Record<string, string>;
  };
}

interface ExecutionInfo {
  executionArn: string;
  name: string;
  status: string;
  startDate?: Date;
  stopDate?: Date;
  input?: any;
  error?: string;
  cause?: string;
}

// ---- parallel batch helper ----

async function parallelBatch<T, R>(items: T[], batchSize: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    results.push(...await Promise.all(batch.map(fn)));
  }
  return results;
}

// ---- data fetchers ----

async function fetchAllExecutions(stateMachineArn: string): Promise<ExecutionInfo[]> {
  const executions: ExecutionInfo[] = [];
  let nextToken: string | undefined;

  for (let page = 0; page < MAX_EXECUTION_PAGES; page++) {
    const result = await sf.send(new ListExecutionsCommand({
      stateMachineArn,
      maxResults: 100,
      nextToken,
    }));

    for (const ex of result.executions ?? []) {
      executions.push({
        executionArn: ex.executionArn!,
        name: ex.name!,
        status: ex.status ?? 'UNKNOWN',
        startDate: ex.startDate,
        stopDate: ex.stopDate,
      });
    }

    nextToken = result.nextToken;
    if (!nextToken) break;
  }

  return executions;
}

async function enrichExecution(ex: ExecutionInfo): Promise<ExecutionInfo> {
  try {
    const detail = await sf.send(new DescribeExecutionCommand({ executionArn: ex.executionArn }));
    ex.input = JSON.parse(detail.input || '{}');
    ex.error = detail.error;
    ex.cause = detail.cause;
  } catch (e) {
    ex.error = `DescribeExecution failed: ${e}`;
  }
  return ex;
}

interface HistoryAnalysis {
  failedStateName?: string;
  failedStateError?: string;
  failedStateCause?: string;
  hasCapacityError: boolean;
  hasThrottleRetry: boolean;
  providerTaskOutput?: any;
}

const CAPACITY_PATTERNS = [
  'InsufficientInstanceCapacity',
  'SpotMaxPriceTooLow',
  'CapacityError',
  'Insufficient capacity',
  'ResourceInitializationError',
  'CannotPullContainerError',
];

const THROTTLE_PATTERNS = [
  'Request limit exceeded',
  'Rate exceeded',
  'Throttling',
  'TooManyRequestsException',
];

async function analyzeHistory(executionArn: string): Promise<HistoryAnalysis> {
  const result: HistoryAnalysis = {
    hasCapacityError: false,
    hasThrottleRetry: false,
  };

  try {
    let nextToken: string | undefined;
    const events = [];

    // paginate through all history events
    do {
      const resp = await sf.send(new GetExecutionHistoryCommand({
        executionArn,
        reverseOrder: true,
        maxResults: 100,
        nextToken,
      }));
      events.push(...(resp.events ?? []));
      nextToken = resp.nextToken;
    } while (nextToken);

    for (const event of events) {
      const type = event.type;

      if (type === HistoryEventType.TaskFailed || type === HistoryEventType.ExecutionFailed) {
        const details = event.taskFailedEventDetails ?? event.executionFailedEventDetails;
        if (details) {
          if (!result.failedStateName) {
            result.failedStateError = details.error;
            result.failedStateCause = details.cause;
          }

          const text = `${details.error ?? ''} ${details.cause ?? ''}`;
          if (CAPACITY_PATTERNS.some(p => text.includes(p))) {
            result.hasCapacityError = true;
          }
          if (THROTTLE_PATTERNS.some(p => text.includes(p))) {
            result.hasThrottleRetry = true;
          }
        }
      }

      if (type === HistoryEventType.TaskStateEntered) {
        const details = event.stateEnteredEventDetails;
        if (details && !result.failedStateName) {
          result.failedStateName = details.name;
        }
      }

      if (type === HistoryEventType.TaskSucceeded) {
        const details = event.taskSucceededEventDetails;
        if (details?.output && !result.providerTaskOutput) {
          try {
            result.providerTaskOutput = JSON.parse(details.output);
          } catch { /* ignore parse errors */ }
        }
      }

      if (type === HistoryEventType.TaskSubmitFailed || type === HistoryEventType.TaskTimedOut) {
        const details = event.taskSubmitFailedEventDetails ?? event.taskTimedOutEventDetails;
        if (details) {
          const text = `${(details as any).error ?? ''} ${(details as any).cause ?? ''}`;
          if (THROTTLE_PATTERNS.some(p => text.includes(p))) {
            result.hasThrottleRetry = true;
          }
        }
      }
    }
  } catch (e) {
    result.failedStateError = `GetExecutionHistory failed: ${e}`;
  }

  return result;
}

async function fetchLogMatches(logGroupName: string, filterPattern: string, lookbackMs: number): Promise<number> {
  try {
    let count = 0;
    let nextToken: string | undefined;
    const startTime = Date.now() - lookbackMs;

    do {
      const resp = await cwl.send(new FilterLogEventsCommand({
        logGroupName,
        filterPattern,
        startTime,
        nextToken,
        limit: 100,
      }));
      count += resp.events?.length ?? 0;
      nextToken = resp.nextToken;
    } while (nextToken);

    return count;
  } catch {
    return -1; // signal that log query failed
  }
}

async function fetchInstallationRepos(appOctokit: any): Promise<Set<string>> {
  const repos = new Set<string>();

  try {
    const installations = (await appOctokit.request('GET /app/installations')).data;
    for (const installation of installations) {
      try {
        const token = (await appOctokit.auth({
          type: 'installation',
          installationId: installation.id,
        }) as any).token;

        const { Octokit } = await import('@octokit/rest');
        const installOctokit = new Octokit({ auth: token });

        let page = 1;
        while (true) {
          const resp = await installOctokit.request('GET /installation/repositories', {
            per_page: 100,
            page,
          });
          for (const repo of resp.data.repositories) {
            repos.add((repo.full_name as string).toLowerCase());
          }
          if (resp.data.repositories.length < 100) break;
          page++;
        }
      } catch { /* skip installations we can't auth to */ }
    }
  } catch { /* skip if can't list installations */ }

  return repos;
}

async function fetchWebhookDeliveryHealth(appOctokit: any): Promise<{ total: number; failed: number }> {
  try {
    const resp = await appOctokit.request('GET /app/hook/deliveries', { per_page: 100 });
    const deliveries = resp.data as any[];
    const total = deliveries.length;
    const failed = deliveries.filter((d: any) => d.status === 'failed' || (d.status_code && d.status_code >= 400)).length;
    return { total, failed };
  } catch {
    return { total: -1, failed: -1 };
  }
}

// ---- detection functions ----

function checkConfigHealth(configResult: { auth: string; webhook: string; secrets: string }): Issue[] {
  const issues: Issue[] = [];

  if (configResult.secrets !== 'ok') {
    issues.push({
      severity: 'critical',
      category: 'config',
      title: 'Secret read failure',
      description: configResult.secrets,
      suggestion: 'Verify the secret exists and the troubleshoot Lambda has secretsmanager:GetSecretValue permission.',
      links: {},
    });
  }

  if (configResult.auth !== 'ok') {
    issues.push({
      severity: 'critical',
      category: 'config',
      title: 'GitHub authentication failure',
      description: configResult.auth,
      suggestion: 'Check the GitHub secret value. For GitHub App, verify the app ID and private key. For PAT, verify the token is valid.',
      links: {
        githubSecret: secretArnToUrl(process.env.GITHUB_SECRET_ARN!),
      },
    });
  }

  if (configResult.webhook !== 'ok') {
    issues.push({
      severity: 'critical',
      category: 'config',
      title: 'Webhook URL mismatch',
      description: configResult.webhook,
      suggestion: 'Update the webhook URL in your GitHub App settings to match the expected URL.',
      links: {},
    });
  }

  return issues;
}

function detectStolenRunners(executions: ExecutionInfo[], installationRepos: Set<string>): Issue[] {
  if (installationRepos.size === 0) return [];

  const issues: Issue[] = [];
  for (const ex of executions) {
    if (!ex.input?.owner || !ex.input?.repo) continue;
    const fullName = `${ex.input.owner}/${ex.input.repo}`.toLowerCase();
    if (!installationRepos.has(fullName)) {
      issues.push({
        severity: 'critical',
        category: 'stolen-runner',
        title: `Runner provisioned for uninstalled repo: ${fullName}`,
        description: `Execution ${ex.name} provisioned a runner for ${fullName}, but the GitHub App is not installed on that repository.`,
        suggestion: `Install the GitHub App on ${fullName}, or investigate why this repo triggered a runner.`,
        executionArn: ex.executionArn,
        links: {
          execution: executionArnToUrl(ex.executionArn),
        },
      });
    }
  }
  return issues;
}

function detectCapacityFailures(executions: ExecutionInfo[], histories: Map<string, HistoryAnalysis>): Issue[] {
  const issues: Issue[] = [];
  for (const ex of executions) {
    if (ex.status !== ExecutionStatus.FAILED) continue;
    const history = histories.get(ex.executionArn);
    if (!history?.hasCapacityError) continue;

    issues.push({
      severity: 'critical',
      category: 'spot-interruption',
      title: `Capacity failure: ${ex.name}`,
      description: `Execution failed due to capacity issues at state "${history.failedStateName}": ${history.failedStateCause?.slice(0, 200) ?? 'unknown'}`,
      suggestion: 'Consider adding fallback providers, using on-demand instances, or increasing spot price.',
      executionArn: ex.executionArn,
      links: {
        execution: executionArnToUrl(ex.executionArn),
      },
    });
  }
  return issues;
}

function detectFailedStarts(executions: ExecutionInfo[], histories: Map<string, HistoryAnalysis>): Issue[] {
  const issues: Issue[] = [];
  const tokenStateNames = ['Get Runner Token', 'GetRunnerToken'];

  for (const ex of executions) {
    if (ex.status !== ExecutionStatus.FAILED) continue;
    const history = histories.get(ex.executionArn);
    if (!history) continue;
    if (history.hasCapacityError) continue; // already reported as capacity failure

    const failedAt = history.failedStateName ?? 'unknown';
    const isTokenFailure = tokenStateNames.some(n => failedAt.includes(n));
    const isEarlyFailure = failedAt.includes('Error Handler') || failedAt.includes('Run Providers');

    if (isTokenFailure || isEarlyFailure) {
      issues.push({
        severity: 'critical',
        category: 'failed-start',
        title: `Runner failed to start: ${ex.name}`,
        description: `Execution failed at "${failedAt}": ${history.failedStateError ?? ''} ${history.failedStateCause?.slice(0, 200) ?? ''}`.trim(),
        suggestion: isTokenFailure
          ? 'Check GitHub App permissions and runner registration token generation.'
          : 'Check provider logs for infrastructure startup failures.',
        executionArn: ex.executionArn,
        links: {
          execution: executionArnToUrl(ex.executionArn),
        },
      });
    }
  }
  return issues;
}

function detectIdleReaps(executions: ExecutionInfo[]): Issue[] {
  const issues: Issue[] = [];
  const idleReaps = executions.filter(ex => ex.status === ExecutionStatus.ABORTED && ex.error === 'IdleRunner');
  const total = executions.length;

  if (idleReaps.length === 0) return [];

  // group by repo
  const byRepo = new Map<string, number>();
  for (const ex of idleReaps) {
    const key = ex.input ? `${ex.input.owner}/${ex.input.repo}` : 'unknown';
    byRepo.set(key, (byRepo.get(key) ?? 0) + 1);
  }

  const topRepos = [...byRepo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const repoSummary = topRepos.map(([repo, count]) => `${repo} (${count})`).join(', ');

  issues.push({
    severity: idleReaps.length > total * 0.3 ? 'warning' : 'info',
    category: 'idle-reap',
    title: `${idleReaps.length} of ${total} executions were idle-reaped`,
    description: `Runners were started but never picked up a job. Top repos: ${repoSummary}`,
    suggestion: idleReaps.length > total * 0.3
      ? 'If many idle reaps come from the same repo, the workflow likely uses max-parallel. Consider increasing idleTimeout or using a provider selector.'
      : 'A small number of idle reaps is normal.',
    links: {},
  });

  return issues;
}

function detectStuckExecutions(executions: ExecutionInfo[]): Issue[] {
  const issues: Issue[] = [];
  const threshold = STUCK_EXECUTION_HOURS * 60 * 60 * 1000;
  const now = Date.now();

  for (const ex of executions) {
    if (ex.status !== ExecutionStatus.RUNNING) continue;
    if (!ex.startDate) continue;

    const runningMs = now - ex.startDate.getTime();
    if (runningMs > threshold) {
      const hours = Math.floor(runningMs / (60 * 60 * 1000));
      issues.push({
        severity: 'warning',
        category: 'stuck-execution',
        title: `Execution running for ${hours}h: ${ex.name}`,
        description: `Execution has been running for ${hours} hours, which exceeds the ${STUCK_EXECUTION_HOURS}h threshold.`,
        suggestion: 'Check if the runner is responsive via SSM. If the runner is OOMing, consider a larger instance type. You may need to manually stop this execution.',
        executionArn: ex.executionArn,
        links: {
          execution: executionArnToUrl(ex.executionArn),
        },
      });
    }
  }
  return issues;
}

function detectExecutionNameCollisions(collisionCount: number, region: string, webhookLogGroup: string): Issue[] {
  if (collisionCount <= 0) return [];
  return [{
    severity: 'warning',
    category: 'name-collision',
    title: `${collisionCount} execution name collision(s) in last 24h`,
    description: 'StartExecution returned ExecutionAlreadyExists. This causes 502 responses to GitHub and runners that never start.',
    suggestion: 'This usually means repo names are too long for the execution name limit. Upgrade to the latest version which includes truncation fixes.',
    links: {
      webhookHandlerLogs: logGroupUrl(region, webhookLogGroup),
    },
  }];
}

function detectWebhookFailures(health: { total: number; failed: number }, region: string, webhookLogGroup: string): Issue[] {
  if (health.total <= 0) return [];
  if (health.failed === 0) return [];

  const rate = Math.round((health.failed / health.total) * 100);
  return [{
    severity: rate > 10 ? 'warning' : 'info',
    category: 'webhook-delivery',
    title: `${health.failed}/${health.total} webhook deliveries failed (${rate}%)`,
    description: `${health.failed} of the last ${health.total} webhook deliveries from GitHub failed.`,
    suggestion: 'Check the webhook handler Lambda logs for errors. Verify the webhook URL and secret are configured correctly.',
    links: {
      webhookHandlerLogs: logGroupUrl(region, webhookLogGroup),
    },
  }];
}

function detectLabelMismatches(mismatchCount: number, region: string, webhookLogGroup: string): Issue[] {
  if (mismatchCount <= 0) return [];
  return [{
    severity: 'info',
    category: 'label-mismatch',
    title: `${mismatchCount} webhook(s) ignored due to label mismatch in last 24h`,
    description: 'Webhooks were received but no provider matched the requested labels.',
    suggestion: 'Check that your workflow runs-on labels match your provider labels. Common mistake: using runs-on: [self-hosted, linux, codebuild] when the provider only has [self-hosted, codebuild].',
    links: {
      webhookHandlerLogs: logGroupUrl(region, webhookLogGroup),
    },
  }];
}

function detectStaleImages(providers: any[]): Issue[] {
  const issues: Issue[] = [];
  const threshold = STALE_IMAGE_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();

  if (!Array.isArray(providers)) return [];

  for (const p of providers) {
    const name = p.constructPath ?? p.type ?? 'unknown';

    if (p.image?.latestImage?.date) {
      const age = now - new Date(p.image.latestImage.date).getTime();
      if (age > threshold) {
        const days = Math.floor(age / (24 * 60 * 60 * 1000));
        issues.push({
          severity: 'warning',
          category: 'stale-image',
          title: `Container image for ${name} is ${days} days old`,
          description: `The latest container image was pushed ${days} days ago.`,
          suggestion: 'Rebuild runner images to get the latest security patches and runner version.',
          links: {},
        });
      }
    }

    if (p.ami?.latestAmi && p.ami?.launchTemplate) {
      // AMI age not directly available from DescribeLaunchTemplateVersions, but we flag if no recent image
      // This is a heuristic; the image builder should run periodically
    }
  }
  return issues;
}

function detectThrottling(executions: ExecutionInfo[], histories: Map<string, HistoryAnalysis>): Issue[] {
  let throttledCount = 0;
  for (const ex of executions) {
    const history = histories.get(ex.executionArn);
    if (history?.hasThrottleRetry) throttledCount++;
  }

  if (throttledCount === 0) return [];
  return [{
    severity: 'info',
    category: 'ec2-throttling',
    title: `EC2 API throttling detected in ${throttledCount} execution(s)`,
    description: 'RunInstances or other EC2 API calls were throttled during burst starts. The system retried automatically.',
    suggestion: 'Consider staggering job starts or using CodeBuild/Fargate providers for burst workloads.',
    links: {},
  }];
}

function buildExecutionSummary(executions: ExecutionInfo[]): TroubleshootReport['summary'] {
  const counts = { total: executions.length, succeeded: 0, failed: 0, aborted: 0, timedOut: 0, running: 0 };
  for (const ex of executions) {
    switch (ex.status) {
      case ExecutionStatus.SUCCEEDED: counts.succeeded++; break;
      case ExecutionStatus.FAILED: counts.failed++; break;
      case ExecutionStatus.ABORTED: counts.aborted++; break;
      case ExecutionStatus.TIMED_OUT: counts.timedOut++; break;
      case ExecutionStatus.RUNNING: counts.running++; break;
    }
  }

  let health: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (counts.failed > 0 || counts.timedOut > 0) health = 'critical';
  else if (counts.aborted > counts.total * 0.3) health = 'warning';

  return {
    executions: counts,
    health,
    analysisWindow: `last ${counts.total} executions`,
  };
}

// ---- config checking ----

async function checkConfig(): Promise<{ auth: string; webhook: string; secrets: string }> {
  const result = { auth: 'ok', webhook: 'ok', secrets: 'ok' };

  // check secrets are readable
  try {
    await getSecretJsonValue(process.env.GITHUB_SECRET_ARN);
  } catch (e) {
    result.secrets = `Cannot read GitHub secret: ${e}`;
    return result;
  }

  try {
    await getSecretValue(process.env.GITHUB_PRIVATE_KEY_SECRET_ARN);
  } catch (e) {
    result.secrets = `Cannot read private key secret: ${e}`;
    return result;
  }

  try {
    await getSecretValue(process.env.WEBHOOK_SECRET_ARN);
  } catch (e) {
    result.secrets = `Cannot read webhook secret: ${e}`;
    return result;
  }

  // check GitHub auth
  try {
    const appOctokit = await getAppOctokit();
    if (appOctokit) {
      await appOctokit.request('GET /app');
      result.auth = 'ok';

      // check webhook URL
      try {
        const hookConfig = await appOctokit.request('GET /app/hook/config', {});
        if (hookConfig.data.url !== process.env.WEBHOOK_URL) {
          result.webhook = `GitHub App webhook URL (${hookConfig.data.url}) does not match expected (${process.env.WEBHOOK_URL})`;
        }
      } catch (e) {
        result.webhook = `Cannot check webhook config: ${e}`;
      }
    } else {
      // PAT auth -- try getOctokit which validates the token
      const { octokit } = await getOctokit();
      await octokit.request('GET /user');
      result.auth = 'ok';
      result.webhook = 'Cannot verify automatically with PAT auth';
    }
  } catch (e) {
    result.auth = `GitHub authentication failed: ${e}`;
  }

  return result;
}

// ---- deep links ----

function buildDeepLinks(region: string, webhookHandlerArn: string, sfnArn: string, sfnLogGroup: string, providers: any[]): TroubleshootReport['deepLinks'] {
  const webhookLogGroup = lambdaArnToLogGroup(webhookHandlerArn);
  const providerLogs: Record<string, string> = {};

  if (Array.isArray(providers)) {
    for (const p of providers) {
      const name = p.constructPath ?? p.type ?? 'unknown';
      if (p.logGroup) {
        providerLogs[name] = logGroupUrl(region, p.logGroup);
      }
    }
  }

  return {
    stepFunction: stepFunctionArnToUrl(sfnArn),
    webhookHandlerLogs: logGroupUrl(region, webhookLogGroup),
    orchestratorLogs: sfnLogGroup ? logGroupUrl(region, sfnLogGroup) : '',
    providerLogs,
  };
}

function addProviderLogLinks(issues: Issue[], executions: ExecutionInfo[], providers: any[], region: string) {
  for (const issue of issues) {
    if (!issue.executionArn) continue;
    const ex = executions.find(e => e.executionArn === issue.executionArn);
    if (!ex) continue;

    // find the provider from execution input
    const providerPath = ex.input?.provider;
    if (!providerPath || !Array.isArray(providers)) continue;

    const provider = providers.find((p: any) => p.constructPath === providerPath);
    if (!provider?.logGroup) continue;

    issue.links.providerLogGroup = logGroupUrl(region, provider.logGroup);

    // for EC2, the log stream name is the execution name (runner name)
    if (provider.type === 'ec2' || provider.constructPath?.toLowerCase().includes('ec2')) {
      issue.links.providerLogStream = logStreamUrl(region, provider.logGroup, ex.name);
    }
  }
}

// ---- main handler ----

function safeReturnValue(event: Partial<AWSLambda.APIGatewayProxyEvent>, report: any) {
  if (event.path) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    };
  }
  return report;
}

export async function handler(event: Partial<AWSLambda.APIGatewayProxyEvent>) {
  if (!process.env.GITHUB_SECRET_ARN || !process.env.GITHUB_PRIVATE_KEY_SECRET_ARN || !process.env.LOGICAL_ID ||
      !process.env.WEBHOOK_HANDLER_ARN || !process.env.STEP_FUNCTION_ARN || !process.env.WEBHOOK_SECRET_ARN ||
      !process.env.STACK_NAME) {
    throw new Error('Missing environment variables');
  }

  const region = regionFromArn(process.env.STEP_FUNCTION_ARN);
  const webhookLogGroup = lambdaArnToLogGroup(process.env.WEBHOOK_HANDLER_ARN);

  // -- Phase 0: config check (short-circuit on failure) --
  const configResult = await checkConfig();
  const configIssues = checkConfigHealth(configResult);
  const configBroken = configIssues.some(i => i.severity === 'critical');

  if (configBroken) {
    const report: TroubleshootReport = {
      config: configResult as any,
      summary: { executions: { total: 0, succeeded: 0, failed: 0, aborted: 0, timedOut: 0, running: 0 }, health: 'critical', analysisWindow: 'none (config broken)' },
      issues: configIssues,
      deepLinks: buildDeepLinks(region, process.env.WEBHOOK_HANDLER_ARN, process.env.STEP_FUNCTION_ARN, process.env.STEP_FUNCTION_LOG_GROUP ?? '', []),
    };
    return safeReturnValue(event, report);
  }

  // -- Phase 1: parallel data fetch --
  const appOctokit = await getAppOctokit();

  const [executions, installationRepos, providers, collisionCount, mismatchCount, webhookHealth] = await Promise.all([
    fetchAllExecutions(process.env.STEP_FUNCTION_ARN),
    appOctokit ? fetchInstallationRepos(appOctokit) : Promise.resolve(new Set<string>()),
    generateProvidersStatus(process.env.STACK_NAME, process.env.LOGICAL_ID).then(r => Array.isArray(r) ? r : []),
    fetchLogMatches(webhookLogGroup, 'ExecutionAlreadyExists', LOG_LOOKBACK_MS),
    fetchLogMatches(webhookLogGroup, 'Ignoring labels', LOG_LOOKBACK_MS),
    appOctokit ? fetchWebhookDeliveryHealth(appOctokit) : Promise.resolve({ total: -1, failed: -1 }),
  ]);

  // -- Phase 2: enrich executions --
  const enriched = await parallelBatch(executions, 10, enrichExecution);

  // -- Phase 3: get execution history for non-succeeded --
  const nonSucceeded = enriched.filter(ex => ex.status !== ExecutionStatus.SUCCEEDED && ex.status !== ExecutionStatus.RUNNING);
  const historyResults = await parallelBatch(nonSucceeded, 10, async (ex) => {
    const analysis = await analyzeHistory(ex.executionArn);
    return { arn: ex.executionArn, analysis };
  });
  const histories = new Map<string, HistoryAnalysis>();
  for (const { arn, analysis } of historyResults) {
    histories.set(arn, analysis);
  }

  // -- Phase 4: run all detections --
  const issues: Issue[] = [
    ...configIssues,
    ...detectStolenRunners(enriched, installationRepos),
    ...detectCapacityFailures(enriched, histories),
    ...detectFailedStarts(enriched, histories),
    ...detectIdleReaps(enriched),
    ...detectStuckExecutions(enriched),
    ...detectExecutionNameCollisions(collisionCount, region, webhookLogGroup),
    ...detectWebhookFailures(webhookHealth, region, webhookLogGroup),
    ...detectLabelMismatches(mismatchCount, region, webhookLogGroup),
    ...detectStaleImages(providers),
    ...detectThrottling(enriched, histories),
  ];

  // enrich issues with provider log links
  addProviderLogLinks(issues, enriched, providers, region);

  // sort: critical first, then warning, then info
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const report: TroubleshootReport = {
    config: configResult as any,
    summary: buildExecutionSummary(enriched),
    issues,
    deepLinks: buildDeepLinks(region, process.env.WEBHOOK_HANDLER_ARN, process.env.STEP_FUNCTION_ARN, process.env.STEP_FUNCTION_LOG_GROUP ?? '', providers),
  };

  return safeReturnValue(event, report);
}
