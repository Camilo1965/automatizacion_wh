import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import {
  E2E_ADMIN_ORIGIN,
  E2E_ADMIN_PORT,
  E2E_API_ORIGIN,
  E2E_API_PORT,
  E2E_DATABASE_URL,
  E2E_MEDIA_ROOT,
} from './e2e/constants';

const adminDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(adminDir, '../..');

// Playwright sets FORCE_COLOR; drop NO_COLOR so Node does not warn.
if (process.env.FORCE_COLOR !== undefined) {
  delete process.env.NO_COLOR;
}

function webServerEnv(
  overrides: Record<string, string>,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  Object.assign(env, overrides);
  if (env.FORCE_COLOR !== undefined) {
    delete env.NO_COLOR;
  } else if (env.NO_COLOR !== undefined) {
    delete env.FORCE_COLOR;
  }
  return env;
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  reporter: [['list']],
  use: {
    baseURL: E2E_ADMIN_ORIGIN,
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @camila/api exec tsx src/server.ts',
      cwd: repoRoot,
      url: `${E2E_API_ORIGIN}/health/live`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: webServerEnv({
        NODE_ENV: 'development',
        HOST: '127.0.0.1',
        PORT: E2E_API_PORT,
        DATABASE_URL: E2E_DATABASE_URL,
        ADMIN_ORIGIN: E2E_ADMIN_ORIGIN,
        LOG_LEVEL: 'error',
        MEDIA_ROOT: E2E_MEDIA_ROOT,
      }),
    },
    {
      command: `pnpm --filter @camila/admin exec vite --host 127.0.0.1 --port ${E2E_ADMIN_PORT}`,
      cwd: repoRoot,
      url: E2E_ADMIN_ORIGIN,
      reuseExistingServer: false,
      timeout: 120_000,
      env: webServerEnv({
        CAMILA_E2E_API_PORT: E2E_API_PORT,
      }),
    },
  ],
});
