import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  E2E_DATABASE_URL,
  E2E_MEDIA_ROOT,
  E2E_PASSWORD,
  E2E_USERNAME,
} from './constants';

const e2eDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(e2eDir, '../../..');
const statePath = path.join(e2eDir, '.e2e-state.json');

export { E2E_PASSWORD, E2E_USERNAME } from './constants';

export default async function globalSetup(): Promise<void> {
  mkdirSync(E2E_MEDIA_ROOT, { recursive: true });

  execFileSync(
    'pnpm',
    ['--filter', '@camila/api', 'exec', 'tsx', 'src/cli/seed-e2e-admin.ts'],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        DATABASE_URL: E2E_DATABASE_URL,
        MEDIA_ROOT: E2E_MEDIA_ROOT,
        ADMIN_ORIGIN: 'http://127.0.0.1:5173',
        CAMILA_API_BASE_URL: 'http://127.0.0.1:3000',
        CAMILA_E2E_STATE_PATH: statePath,
        CAMILA_E2E_USERNAME: E2E_USERNAME,
        CAMILA_E2E_PASSWORD: E2E_PASSWORD,
      },
      stdio: 'inherit',
      shell: true,
    },
  );

  process.env.CAMILA_E2E_STATE = statePath;
  process.env.CAMILA_E2E_USERNAME = E2E_USERNAME;
  process.env.CAMILA_E2E_PASSWORD = E2E_PASSWORD;
  process.env.MEDIA_ROOT = E2E_MEDIA_ROOT;
  process.env.DATABASE_URL = E2E_DATABASE_URL;
}
