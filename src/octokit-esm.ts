/**
 * Helpers for consuming ESM-only dependencies (like newer Octokit packages)
 * from code that is compiled/bundled as CommonJS.
 *
 * These helpers are primarily intended for the esbuild-bundled Lambda assets
 * (see `bundle:*.lambda` tasks). Using dynamic `import()` here allows esbuild
 * to include Octokit in the bundle, even though Octokit itself is ESM.
 */
type OctokitRestModule = typeof import('@octokit/rest');
type OctokitCoreModule = typeof import('@octokit/core');
type OctokitAuthAppModule = typeof import('@octokit/auth-app');

let restModulePromise: Promise<OctokitRestModule> | undefined;
let coreModulePromise: Promise<OctokitCoreModule> | undefined;
let authAppModulePromise: Promise<OctokitAuthAppModule> | undefined;

export function loadOctokitRest(): Promise<OctokitRestModule> {
  return (restModulePromise ??= import('@octokit/rest') as Promise<OctokitRestModule>);
}

export function loadOctokitCore(): Promise<OctokitCoreModule> {
  return (coreModulePromise ??= import('@octokit/core') as Promise<OctokitCoreModule>);
}

export function loadOctokitAuthApp(): Promise<OctokitAuthAppModule> {
  return (authAppModulePromise ??= import('@octokit/auth-app') as Promise<OctokitAuthAppModule>);
}
