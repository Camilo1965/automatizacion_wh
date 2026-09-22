#!/usr/bin/env node
/**
 * Synthetic local load baseline for WhatsApp inbound webhook ingestion.
 * Uses TEST_DATABASE_URL only. Does not call Meta.
 *
 * Usage:
 *   node --env-file-if-exists=.env tests/load/webhook-load.mjs
 *   node --env-file-if-exists=.env tests/load/webhook-load.mjs --write
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

async function main() {
  const databaseUrl = requireTestDatabaseUrl();
  const sql = postgres(databaseUrl, { max: concurrency, prepare: false });
  const runId = `load-${Date.now()}`;
  const durations = [];

  try {
    const work = Array.from({ length: samples }, (_, index) => index);
    let cursor = 0;
    async function worker() {
      while (cursor < work.length) {
        const index = cursor;
        cursor += 1;
        const messageId = `${runId}-${index}`;
        const started = performance.now();
        await sql`
          INSERT INTO whatsapp_inbound_messages
            (whatsapp_message_id, business_phone_number_id, customer_phone,
             message_type, text_body, received_at, payload)
          VALUES (
            ${messageId},
            '100',
            ${`+57300${String(index).padStart(7, '0')}`},
            'text',
            'hola',
            clock_timestamp(),
            ${sql.json({ synthetic: true, index })}
          )
          ON CONFLICT (whatsapp_message_id) DO NOTHING
        `;
        durations.push(performance.now() - started);
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    const sorted = [...durations].sort((a, b) => a - b);
    const result = {
      suite: 'webhook-ingestion',
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
      existing.webhookIngestion = result;
      existing.thresholds = existing.thresholds ?? {};
      existing.thresholds.webhookIngestion = {
        p95MaxMs: Math.ceil(result.p95 * 3 + 5),
        p99MaxMs: Math.ceil(result.p99 * 3 + 10),
        notes: '3x local baseline + cushion; release/scheduled gate only',
      };
      await writeFile(baselinePath, `${JSON.stringify(existing, null, 2)}\n`);
      console.error(`Wrote ${baselinePath}`);
    }
  } finally {
    await sql`
      DELETE FROM whatsapp_inbound_messages
      WHERE whatsapp_message_id LIKE ${`${runId}-%`}
    `;
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
