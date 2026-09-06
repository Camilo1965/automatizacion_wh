import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import { E2E_DATABASE_URL, E2E_MEDIA_ROOT } from './e2e/constants';

const adminDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(adminDir, '../..');

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
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
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
      url: 'http://127.0.0.1:3000/health/live',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        HOST: '127.0.0.1',
        PORT: '3000',
        DATABASE_URL: E2E_DATABASE_URL,
        ADMIN_ORIGIN: 'http://127.0.0.1:5173',
        LOG_LEVEL: 'error',
        MEDIA_ROOT: E2E_MEDIA_ROOT,
      },
    },
    {
      command:
        'pnpm --filter @camila/admin exec vite --host 127.0.0.1 --port 5173',
      cwd: repoRoot,
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
