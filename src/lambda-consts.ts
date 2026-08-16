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
