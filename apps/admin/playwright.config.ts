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

import {
  clearProcessNoColor,
  sanitizeE2eEnv,
} from './src/lib/sanitize-e2e-env';

const adminDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(adminDir, '../..');

clearProcessNoColor();

function webServerEnv(
  overrides: Record<string, string>,
): Record<string, string> {
  return sanitizeE2eEnv({
    ...process.env,
    ...overrides,
  });
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
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: webServerEnv({
        NODE_ENV: 'test',
        INTEGRATION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
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
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: webServerEnv({
        CAMILA_E2E_API_PORT: E2E_API_PORT,
      }),
    },
  ],
});
