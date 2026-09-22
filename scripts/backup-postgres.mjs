#!/usr/bin/env node
/**
 * Encrypted Postgres backup → S3-compatible off-server store (separate credentials).
 *
 * Env:
 *   DATABASE_URL (password used via PGPASSWORD, never dumped argv)
 *   BACKUP_ENCRYPTION_KEY (32-byte base64)
 *   BACKUP_S3_ENDPOINT / BUCKET / REGION / ACCESS_KEY_ID / SECRET_ACCESS_KEY
 *   BACKUP_S3_PREFIX (default postgres)
 *   BACKUP_RETENTION_DAYS (default 14)
 *   BACKUP_METRICS_PATH (default ./backups/heartbeat.json)
 *   BACKUP_HEARTBEAT_URL (optional external ping)
 *   BACKUP_LOOP=1 + BACKUP_INTERVAL_SECONDS (scheduled container mode)
 */
import console from 'node:console';
import process from 'node:process';

import {
  BackupError,
  postHeartbeat,
  requireBackupUploadEnv,
  runEncryptedBackup,
  writeMetricsFile,
} from './lib/backup-core.mjs';
import { dumpPostgresCustom, readSchemaVersion } from './lib/backup-pg.mjs';
import { createBackupS3Client } from './lib/backup-s3.mjs';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function exitCodeFor(err) {
  if (!(err instanceof BackupError)) return 1;
  switch (err.code) {
    case 'missing_credentials':
    case 'invalid_config':
      return 2;
    case 'dump_failed':
      return 3;
    case 'upload_failed':
      return 4;
    case 'checksum_mismatch':
      return 5;
    case 'restore_validation_failed':
      return 6;
    default:
      return 1;
  }
}

async function once(env) {
  const metricsPath = env.BACKUP_METRICS_PATH || 'backups/heartbeat.json';
  const s3cfg = requireBackupUploadEnv(env);
  const s3 = createBackupS3Client(s3cfg);

  return runEncryptedBackup(
    {
      dumpPostgres: () => dumpPostgresCustom(env.DATABASE_URL, env),
      readSchemaVersion: () =>
        env.BACKUP_SCHEMA_VERSION?.trim()
          ? Promise.resolve(env.BACKUP_SCHEMA_VERSION.trim())
          : readSchemaVersion(env.DATABASE_URL, env),
      uploadObject: (key, bytes, contentType) => s3.putObject(key, bytes, contentType),
      listObjectKeys: (prefix) => s3.listObjectKeys(prefix),
      deleteObject: (key) => s3.deleteObject(key),
      writeMetrics: (m) => writeMetricsFile(metricsPath, m),
      sendHeartbeat: (event, payload) =>
        postHeartbeat(env.BACKUP_HEARTBEAT_URL, event, payload),
      log: (msg) => console.log(msg),
    },
    env,
  );
}

async function main() {
  const env = process.env;
  const loop =
    env.BACKUP_LOOP === '1' ||
    process.argv.includes('--loop');
  const intervalSec = Number(env.BACKUP_INTERVAL_SECONDS || 86400);

  if (!loop) {
    try {
      await once(env);
      process.exit(0);
    } catch (err) {
      console.error(err instanceof BackupError ? err.message : err);
      process.exit(exitCodeFor(err));
    }
  }

  console.log(`Backup loop every ${intervalSec}s`);
  for (;;) {
    try {
      await once(env);
    } catch (err) {
      console.error(err instanceof BackupError ? err.message : err);
      const metricsPath = env.BACKUP_METRICS_PATH || 'backups/heartbeat.json';
      await writeMetricsFile(metricsPath, {
        lastBackupErrorAt: new Date().toISOString(),
        lastBackupError: err instanceof BackupError ? err.code : 'unknown',
      }).catch(() => {});
      await postHeartbeat(env.BACKUP_HEARTBEAT_URL, 'backup_failure', {
        error: err instanceof BackupError ? err.code : 'unknown',
      }).catch(() => {});
      if (env.BACKUP_EXIT_ON_FAILURE === '1') {
        process.exit(exitCodeFor(err));
      }
    }
    await sleep(Math.max(60, intervalSec) * 1000);
  }
}

main();
