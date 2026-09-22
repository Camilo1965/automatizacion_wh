#!/usr/bin/env node
/**
 * Non-flaky release/scheduled gate for load baselines.
 * Re-runs synthetic local load and compares p95/p99 to thresholds in
 * docs/release/load-baselines.json (3x baseline + cushion).
 *
 * Not part of every PR verify — invoke via:
 *   pnpm check:load-baselines
 */
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(root, 'docs/release/load-baselines.json');

function runLoad(script) {
  const result = spawnSync(
    process.execPath,
    ['--env-file-if-exists=.env', script],
    { cwd: root, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `${script} failed:\n${result.stderr || result.stdout || result.error}`,
    );
  }
  const jsonStart = result.stdout.indexOf('{');
  if (jsonStart < 0) throw new Error(`No JSON output from ${script}`);
  return JSON.parse(result.stdout.slice(jsonStart));
}

const baselines = JSON.parse(await readFile(baselinePath, 'utf8'));
const webhook = runLoad('tests/load/webhook-load.mjs');
const admin = runLoad('tests/load/admin-read-load.mjs');

const failures = [];

function check(name, measured, threshold) {
  if (measured.p95 > threshold.p95MaxMs) {
    failures.push(`${name} p95 ${measured.p95}ms > ${threshold.p95MaxMs}ms`);
  }
  if (measured.p99 > threshold.p99MaxMs) {
    failures.push(`${name} p99 ${measured.p99}ms > ${threshold.p99MaxMs}ms`);
  }
}

check('webhookIngestion', webhook, baselines.thresholds.webhookIngestion);
check('adminDashboardRead', admin, baselines.thresholds.adminDashboardRead);

if (failures.length > 0) {
  console.error('Load baseline gate FAILED:');
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        ok: true,
        webhook,
        admin,
        thresholds: baselines.thresholds,
      },
      null,
      2,
    ),
  );
}
