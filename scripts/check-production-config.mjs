#!/usr/bin/env node
/**
 * Static production-config gate (no secrets).
 * Validates .env.prod.example + compose.prod.yaml shape against known prod rules.
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const envExample = path.join(root, '.env.prod.example');
const composeProd = path.join(root, 'compose.prod.yaml');

const errors = [];

function fail(message) {
  errors.push(message);
}

if (!existsSync(envExample)) {
  fail('Missing .env.prod.example');
} else {
  const text = readFileSync(envExample, 'utf8');
  const requiredKeys = [
    'NODE_ENV=production',
    'STORAGE_DRIVER=s3',
    'ADMIN_ORIGIN=https://',
    'CAMILA_DOMAIN=',
    'BACKUP_ENCRYPTION_KEY=',
    'BACKUP_S3_BUCKET=',
    'RETENTION_EXECUTION_ENABLED=false',
  ];
  for (const key of requiredKeys) {
    if (!text.includes(key)) {
      fail(`.env.prod.example missing expected marker: ${key}`);
    }
  }
  if (/ADMIN_ORIGIN=http:\/\//.test(text)) {
    fail('.env.prod.example must not advertise HTTP ADMIN_ORIGIN');
  }
  if (/STORAGE_DRIVER=local/.test(text)) {
    fail('.env.prod.example must not default STORAGE_DRIVER=local');
  }
}

if (!existsSync(composeProd)) {
  fail('Missing compose.prod.yaml');
} else {
  const compose = readFileSync(composeProd, 'utf8');
  for (const marker of [
    'migrate:',
    'read_only: true',
    'no-new-privileges:true',
    'cap_drop:',
  ]) {
    if (!compose.includes(marker)) {
      fail(`compose.prod.yaml missing hardening marker: ${marker}`);
    }
  }
}

const configCheck = spawnSync(
  'docker',
  [
    'compose',
    '--env-file',
    '.env.prod.example',
    '-f',
    'compose.prod.yaml',
    'config',
    '--quiet',
  ],
  { cwd: root, encoding: 'utf8', shell: false },
);

if (configCheck.error) {
  fail(`docker compose unavailable: ${configCheck.error.message}`);
} else if (configCheck.status !== 0) {
  fail(
    `compose.prod.yaml config failed: ${configCheck.stderr || configCheck.stdout}`,
  );
}

if (errors.length > 0) {
  console.error('Production config gate failed:');
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
}

console.log('Production config gate OK.');
