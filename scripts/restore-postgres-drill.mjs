#!/usr/bin/env node
/**
 * Encrypted restore drill into an isolated database.
 * Destructive DROP runs ONLY after validation success.
 *
 * Env: DATABASE_URL, BACKUP_ENCRYPTION_KEY, BACKUP_S3_*, BACKUP_ID,
 *      DRILL_DB (optional), BACKUP_METRICS_PATH, BACKUP_HEARTBEAT_URL
 */
import console from 'node:console';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  BackupError,
  postHeartbeat,
  requireBackupUploadEnv,
  runRestoreDrill,
  writeMetricsFile,
} from './lib/backup-core.mjs';
import {
  createDatabase,
  dropDatabase,
  restoreDumpFile,
  validateRestoredDatabase,
} from './lib/backup-pg.mjs';
import { createBackupS3Client } from './lib/backup-s3.mjs';

function exitCodeFor(err) {
  if (!(err instanceof BackupError)) return 1;
  switch (err.code) {
    case 'missing_credentials':
    case 'invalid_config':
      return 2;
    case 'checksum_mismatch':
      return 5;
    case 'restore_validation_failed':
      return 6;
    default:
      return 1;
  }
}

async function main() {
  const env = process.env;
  const metricsPath = env.BACKUP_METRICS_PATH || 'backups/heartbeat.json';
  const s3cfg = requireBackupUploadEnv(env);
  const s3 = createBackupS3Client(s3cfg);
  const tempDir = env.BACKUP_TMP_DIR || path.join('backups', 'tmp');

  try {
    const result = await runRestoreDrill(
      {
        downloadObject: (key) => s3.getObject(key),
        createDatabase: (name) => createDatabase(env.DATABASE_URL, name, env),
        restoreDump: (name, dumpPath) =>
          restoreDumpFile(env.DATABASE_URL, name, dumpPath, env),
        validateRestore: (name) =>
          validateRestoredDatabase(env.DATABASE_URL, name, {
            expectedSchemaVersion: env.BACKUP_EXPECTED_SCHEMA_VERSION,
          }, env),
        dropDatabase: (name) => dropDatabase(env.DATABASE_URL, name, env),
        ensureTempDir: async (dir) => {
          await mkdir(dir, { recursive: true });
        },
        writeTempFile: async (file, bytes) => {
          await mkdir(path.dirname(file), { recursive: true });
          await writeFile(file, bytes);
        },
        removeTempFile: async (file) => {
          await rm(file, { force: true });
        },
        writeMetrics: (m) => writeMetricsFile(metricsPath, m),
        sendHeartbeat: (event, payload) =>
          postHeartbeat(env.BACKUP_HEARTBEAT_URL, event, payload),
        log: (msg) => console.log(msg),
      },
      env,
      { tempDir },
    );
    console.log(
      JSON.stringify({
        ok: true,
        backupId: result.backupId,
        cleaned: result.cleaned,
        sampleCounts: result.validation.details.sampleCounts,
      }),
    );
    process.exit(0);
  } catch (err) {
    console.error(err instanceof BackupError ? err.message : err);
    if (err instanceof BackupError && err.code === 'restore_validation_failed') {
      console.error(
        'Drill database retained for inspection; destructive cleanup skipped.',
      );
    }
    process.exit(exitCodeFor(err));
  }
}

main();
