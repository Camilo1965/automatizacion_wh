import { writeFileSync } from 'node:fs';
import path from 'node:path';

import postgres from 'postgres';

import { createAdminUser } from './admin-create.js';
import { runMigrations } from '../database/migrate.js';

const username = process.env.CAMILA_E2E_USERNAME ?? 'e2e_admin';
const password = process.env.CAMILA_E2E_PASSWORD ?? 'e2e-password-12';
const databaseUrl = process.env.DATABASE_URL;
const statePath = process.env.CAMILA_E2E_STATE_PATH;
const mediaRoot = process.env.MEDIA_ROOT;

if (databaseUrl === undefined || databaseUrl.trim() === '') {
  throw new Error('DATABASE_URL is required for E2E seed');
}

if (statePath === undefined || statePath.trim() === '') {
  throw new Error('CAMILA_E2E_STATE_PATH is required for E2E seed');
}

if (mediaRoot === undefined || mediaRoot.trim() === '') {
  throw new Error('MEDIA_ROOT is required for E2E seed');
}

const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
if (!databaseName.endsWith('_test')) {
  throw new Error('E2E refuses databases whose name does not end with _test');
}

await runMigrations(databaseUrl);

const sql = postgres(databaseUrl, { max: 1, prepare: false });
try {
  await sql`
    TRUNCATE TABLE
      admin_sessions,
      admin_users,
      inventory_movements,
      catalog_stock,
      catalog_references
    RESTART IDENTITY CASCADE
  `;
} finally {
  await sql.end({ timeout: 5 });
}

await createAdminUser({
  databaseUrl,
  username,
  password,
  passwordConfirmation: password,
});

writeFileSync(
  statePath,
  JSON.stringify({
    databaseUrl,
    mediaRoot,
    adminOrigin: process.env.ADMIN_ORIGIN ?? 'http://127.0.0.1:5173',
    apiBaseUrl: process.env.CAMILA_API_BASE_URL ?? 'http://127.0.0.1:3000',
    username,
    password,
  }),
  'utf8',
);

console.log(`E2E admin ready at ${path.relative(process.cwd(), statePath)}`);
