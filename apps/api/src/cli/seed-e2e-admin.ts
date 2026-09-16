import postgres from 'postgres';

import { createAdminUser } from './admin-create.js';
import { runMigrations } from '../database/migrate.js';

const username = process.env.CAMILA_E2E_USERNAME ?? 'e2e_admin';
const password = process.env.CAMILA_E2E_PASSWORD ?? 'e2e-password-12';
const databaseUrl = process.env.DATABASE_URL;
const mediaRoot = process.env.MEDIA_ROOT;

if (databaseUrl === undefined || databaseUrl.trim() === '') {
  throw new Error('DATABASE_URL is required for E2E seed');
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
      catalog_references,
      catalog_imports,
      shipping_localities
      ,locality_catalog_versions, integration_settings, integration_drafts, integration_versions, bot_flow_versions, bot_flow_drafts,
      owner_alert_deliveries, owner_alerts, inventory_closures, shipping_preferences, shipping_carrier_rules, shipping_incidents, configuration_audits
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

console.log(`E2E admin ready (${username})`);
