#!/usr/bin/env node
/**
 * Restore drill into a scratch database (see scripts/restore-postgres-drill.sh).
 */
import { spawnSync } from 'node:child_process';
import console from 'node:console';
import fs from 'node:fs';
import process from 'node:process';

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const dump = process.env.DUMP;
const databaseUrl = process.env.DATABASE_URL;
const drillDb =
  process.env.DRILL_DB ??
  `camila_restore_drill_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

if (!dump || !fs.existsSync(dump)) {
  console.error('DUMP must point to an existing custom-format dump file');
  process.exit(1);
}
if (!databaseUrl?.trim()) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const base = databaseUrl.split('?')[0];
const adminUrl = `${base.replace(/\/[^/]*$/, '')}/postgres`;
const targetUrl = `${base.replace(/\/[^/]*$/, '')}/${drillDb}`;

const exists = spawnSync(
  'psql',
  [
    adminUrl,
    '-tAc',
    `SELECT 1 FROM pg_database WHERE datname = '${drillDb.replace(/'/g, "''")}'`,
  ],
  { encoding: 'utf8', shell: process.platform === 'win32' },
);
if (exists.stdout?.trim() !== '1') {
  run('psql', [
    adminUrl,
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    `CREATE DATABASE "${drillDb}"`,
  ]);
}

run('pg_restore', [
  '--clean',
  '--if-exists',
  '--no-owner',
  '--no-acl',
  `--dbname=${targetUrl}`,
  dump,
]);

console.log(
  `Drill complete (${drillDb}). Drop when done: psql "${adminUrl}" -c "DROP DATABASE \\"${drillDb}\\";"`,
);
