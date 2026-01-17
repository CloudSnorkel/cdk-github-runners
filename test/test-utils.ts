import * as fs from 'fs';
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
  if (app?.outdir) {
    const tmpDir = process.env.TEMP || process.env.TMPDIR || '/tmp';
    if (path.resolve(app.outdir).startsWith(path.resolve(tmpDir))) {
      // Recursively delete outdir
      fs.rmSync(path.resolve(app.outdir), { recursive: true, force: true });
    }
  }
}
