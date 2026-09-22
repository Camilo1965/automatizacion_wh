#!/usr/bin/env node
/**
 * Synthetic local load baseline for principal admin dashboard reads.
 * Uses TEST_DATABASE_URL only.
 *
 * Usage:
 *   node --env-file-if-exists=.env tests/load/admin-read-load.mjs
 *   node --env-file-if-exists=.env tests/load/admin-read-load.mjs --write
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import postgres from '../../apps/api/node_modules/postgres/src/index.js';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const samples = Number(process.env.LOAD_SAMPLES ?? 120);
const concurrency = Number(process.env.LOAD_CONCURRENCY ?? 8);
const writeBaseline = process.argv.includes('--write');

function requireTestDatabaseUrl() {
  const url = process.env.TEST_DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL required. Start: docker compose --profile test up -d postgres-test',
    );
  }
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error('Refusing database whose name does not end with _test');
  }
  return url;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

const DASHBOARD_SQL = `
SELECT
  (SELECT count(*)::int FROM whatsapp_conversations WHERE mode = 'human') AS conversations,
  (SELECT count(*)::int FROM shipping_guide_jobs WHERE status IN ('uncertain', 'failed')) AS guide_incidents,
  (SELECT count(*)::int FROM sales_orders WHERE status = 'confirmed') AS ready_to_dispatch,
  (SELECT count(*)::int FROM sales_orders WHERE status = 'draft') AS awaiting_confirmation,
  EXISTS (
    SELECT 1 FROM inventory_closures
    WHERE status = 'generated' AND acknowledged_at IS NULL
  ) AS closure_pending,
  (SELECT count(*)::int FROM catalog_references WHERE active = true) AS active_references
`;

async function main() {
  const databaseUrl = requireTestDatabaseUrl();
  const sql = postgres(databaseUrl, { max: concurrency, prepare: false });
  const durations = [];

  try {
    // Warm schema presence; ignore missing empty tables by using safe counts.
    await sql.unsafe('SELECT 1');

    const work = Array.from({ length: samples }, (_, index) => index);
    let cursor = 0;
    async function worker() {
      while (cursor < work.length) {
        cursor += 1;
        const started = performance.now();
        await sql.unsafe(DASHBOARD_SQL);
        durations.push(performance.now() - started);
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    const sorted = [...durations].sort((a, b) => a - b);
    const result = {
      suite: 'admin-dashboard-read',
      samples,
      concurrency,
      unit: 'ms',
      p50: Number(percentile(sorted, 50).toFixed(3)),
      p95: Number(percentile(sorted, 95).toFixed(3)),
      p99: Number(percentile(sorted, 99).toFixed(3)),
      measuredAt: new Date().toISOString(),
    };
    console.log(JSON.stringify(result, null, 2));

    if (writeBaseline) {
      const outDir = path.join(root, 'docs/release');
      await mkdir(outDir, { recursive: true });
      const baselinePath = path.join(outDir, 'load-baselines.json');
      let existing = {};
      try {
        existing = JSON.parse(await readFile(baselinePath, 'utf8'));
      } catch {
        existing = {};
      }
      existing.adminDashboardRead = result;
      existing.thresholds = existing.thresholds ?? {};
      existing.thresholds.adminDashboardRead = {
        p95MaxMs: Math.ceil(result.p95 * 3 + 5),
        p99MaxMs: Math.ceil(result.p99 * 3 + 10),
        notes: '3x local baseline + cushion; release/scheduled gate only',
      };
      await writeFile(baselinePath, `${JSON.stringify(existing, null, 2)}\n`);
      console.error(`Wrote ${baselinePath}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
