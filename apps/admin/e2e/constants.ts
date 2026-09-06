import path from 'node:path';
import { tmpdir } from 'node:os';

export const E2E_MEDIA_ROOT = path.join(
  tmpdir(),
  'camila-playwright-e2e-media',
);
export const E2E_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://camila_test:camila_test@127.0.0.1:5433/camila_test';
export const E2E_USERNAME = 'e2e_admin';
export const E2E_PASSWORD = 'e2e-password-12';

export const E2E_API_PORT = process.env.CAMILA_E2E_API_PORT ?? '3100';
export const E2E_ADMIN_PORT = process.env.CAMILA_E2E_ADMIN_PORT ?? '5174';
export const E2E_API_ORIGIN = `http://127.0.0.1:${E2E_API_PORT}`;
export const E2E_ADMIN_ORIGIN = `http://127.0.0.1:${E2E_ADMIN_PORT}`;
