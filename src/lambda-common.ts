/**
 * Maximum length of a runner name. We use the runner name as the step function execution name which is limited to 80 characters.
 * But GitHub runner names are limited to 64 characters, so we use that as the maximum length for the runner name.
 *
 * @internal
 */
export const MAX_RUNNER_NAME_LENGTH = 64;

/**
 * Job id used for warm runners, which aren't started for any job in particular.
 *
 * @internal
 */
export const WARM_RUNNER_JOB_ID = -1;

/**
 * Private key secret value we deploy with. The user is meant to replace it with a real key, and a runner that gets
 * this far with the placeholder still in place was never set up.
 *
 * @internal
 */
export const GITHUB_PRIVATE_KEY_PLACEHOLDER = '-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----';

/**
 * Path of the providers file in the webhook handler layer. It's a layer and not an environment variable because all
 * environment variables of a function are limited to 4kb together, and users with many providers go over that.
 *
 * @internal
 */
export const PROVIDERS_PATH = '/opt/providers.json';

/**
 * Input for the runner orchestrator step function. Read back from the step function itself when a runner needs
 * replacing, so it never has to be stored anywhere else.
 *
 * @internal
 */
export interface OrchestratorInput {
  readonly owner: string;
  readonly repo: string;
  readonly jobId: number;
  readonly jobUrl: string;
  readonly installationId: number;
  readonly jobLabels: string;
  readonly provider: string;
  readonly labels: string;
  readonly maxIdleSeconds: number;
}
