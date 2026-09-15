import type * as fs from 'fs';
import { PROVIDERS_PATH } from '../src/lambda-common';

/**
 * Providers returned by the fake providers file. Set it in your test to control what the webhook handler sees.
 */
export const providersFile: { providers: Record<string, string[]> } = { providers: {} };

/**
 * Replacement for `fs` that fakes the providers file the webhook handler gets from its layer. Use it with
 * `jest.mock('fs', () => require('./providers-file').fsWithProvidersFile());`.
 */
export function fsWithProvidersFile() {
  const actual = jest.requireActual<typeof fs>('fs');

  return {
    ...actual,
    readFileSync: (file: any, options: any) =>
      file === PROVIDERS_PATH ? JSON.stringify(providersFile.providers) : actual.readFileSync(file, options),
  };
}
