import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';

/**
 * Cleans up CDK App outdir.
 * This removes the app.outdir if it's set and is under the OS temp directory.
 *
 * @param app - The CDK App instance to clean up
 */
export function cleanUp(app: cdk.App | undefined): void {
  // Remove app.outdir if it's set and is under the OS temp directory
  if (app?.outdir && app?.outdir !== '') {
    const tmpDir = os.tmpdir();
    const resolvedOutdir = path.resolve(app.outdir);
    const resolvedTmpDir = path.resolve(tmpDir);
    // Ensure tmpDir ends with path separator to prevent false matches like /tmp2/ matching /tmp
    const tmpDirWithSep = resolvedTmpDir.endsWith(path.sep) ? resolvedTmpDir : resolvedTmpDir + path.sep;
    const outdirWithSep = resolvedOutdir.endsWith(path.sep) ? resolvedOutdir : resolvedOutdir + path.sep;
    if (outdirWithSep !== tmpDirWithSep && outdirWithSep.startsWith(tmpDirWithSep)) {
      // Recursively delete outdir
      fs.rmSync(resolvedOutdir, { recursive: true, force: true });
    }
  }
}
