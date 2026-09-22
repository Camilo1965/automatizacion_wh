#!/usr/bin/env node
/**
 * Bundle budget gate (Task 11). Delegates to the measured admin baseline
 * from Task 6 (`check-admin-bundle-budget.mjs`).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'scripts', 'check-admin-bundle-budget.mjs');

const result = spawnSync(process.execPath, [target], {
  cwd: root,
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 1);
