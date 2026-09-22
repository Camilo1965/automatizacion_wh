#!/usr/bin/env node
/**
 * Windows-friendly Postgres backup (custom format) via pg_dump.
 * Requires PostgreSQL client tools on PATH (e.g. installer or `choco install postgresql`).
 *
 * [HUMANO] Schedule copies of ./backups/postgres to off-server storage.
 */
import { spawnSync } from 'node:child_process';
import console from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.trim()) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const outDir = process.env.BACKUP_DIR ?? path.join('backups', 'postgres');
const stamp = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\..+/, 'Z');
const outFile = path.join(outDir, `camila-${stamp}.dump`);

fs.mkdirSync(outDir, { recursive: true });

const result = spawnSync(
  'pg_dump',
  [
    '--format=custom',
    '--no-owner',
    '--no-acl',
    `--file=${outFile}`,
    databaseUrl,
  ],
  { stdio: 'inherit', shell: process.platform === 'win32' },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`Wrote ${outFile}`);
