import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  E2E_ADMIN_ORIGIN,
  E2E_API_ORIGIN,
  E2E_DATABASE_URL,
  E2E_MEDIA_ROOT,
  E2E_PASSWORD,
  E2E_USERNAME,
} from './constants';

const e2eDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(e2eDir, '../../..');
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

export { E2E_PASSWORD, E2E_USERNAME } from './constants';

function runPnpm(args: string[]): void {
  const env = {
    ...process.env,
    DATABASE_URL: E2E_DATABASE_URL,
    MEDIA_ROOT: E2E_MEDIA_ROOT,
    ADMIN_ORIGIN: E2E_ADMIN_ORIGIN,
    CAMILA_API_BASE_URL: E2E_API_ORIGIN,
    CAMILA_E2E_USERNAME: E2E_USERNAME,
    CAMILA_E2E_PASSWORD: E2E_PASSWORD,
  };

  if (process.platform === 'win32') {
    // .cmd shims cannot be CreateProcess'd with shell:false (EINVAL).
    // Invoke pnpm.cmd through cmd.exe without shell:true (avoids DEP0190).
    const quoted = [pnpmCommand, ...args]
      .map((part) => (/\s/.test(part) ? `"${part}"` : part))
      .join(' ');
    execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', quoted], {
      cwd: repoRoot,
      env,
      stdio: 'inherit',
      shell: false,
    });
    return;
  }

  execFileSync(pnpmCommand, args, {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
    shell: false,
  });
}

export default async function globalSetup(): Promise<void> {
  if (process.env.FORCE_COLOR !== undefined) {
    delete process.env.NO_COLOR;
  }

  mkdirSync(E2E_MEDIA_ROOT, { recursive: true });

  runPnpm([
    '--filter',
    '@camila/api',
    'exec',
    'tsx',
    'src/cli/seed-e2e-admin.ts',
  ]);

  process.env.CAMILA_E2E_USERNAME = E2E_USERNAME;
  process.env.CAMILA_E2E_PASSWORD = E2E_PASSWORD;
  process.env.MEDIA_ROOT = E2E_MEDIA_ROOT;
  process.env.DATABASE_URL = E2E_DATABASE_URL;
}
