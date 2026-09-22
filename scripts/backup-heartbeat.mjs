#!/usr/bin/env node
/**
 * Emit backup heartbeat metrics (last success, age, size, last restore drill).
 *
 * Reads BACKUP_METRICS_PATH (default backups/heartbeat.json).
 * Optional: POST snapshot to BACKUP_HEARTBEAT_URL.
 */
import console from 'node:console';
import process from 'node:process';

import {
  ageSeconds,
  postHeartbeat,
  readMetricsFile,
  writeMetricsFile,
} from './lib/backup-core.mjs';

async function main() {
  const env = process.env;
  const metricsPath = env.BACKUP_METRICS_PATH || 'backups/heartbeat.json';
  const now = new Date();
  let metrics = await readMetricsFile(metricsPath);

  if (metrics.lastSuccessfulBackupAt) {
    metrics = await writeMetricsFile(
      metricsPath,
      {
        lastBackupAgeSeconds: ageSeconds(metrics.lastSuccessfulBackupAt, now),
      },
      now,
    );
  }

  const snapshot = {
    lastSuccessfulBackupAt: metrics.lastSuccessfulBackupAt ?? null,
    lastBackupAgeSeconds: metrics.lastBackupAgeSeconds ?? null,
    lastBackupSizeBytes: metrics.lastBackupSizeBytes ?? null,
    lastBackupId: metrics.lastBackupId ?? null,
    lastRestoreDrillAt: metrics.lastRestoreDrillAt ?? null,
    lastRestoreDrillOk: metrics.lastRestoreDrillOk ?? null,
    schemaVersion: metrics.schemaVersion ?? null,
    updatedAt: metrics.updatedAt ?? null,
  };

  console.log(JSON.stringify(snapshot, null, 2));

  if (env.BACKUP_HEARTBEAT_URL?.trim()) {
    await postHeartbeat(env.BACKUP_HEARTBEAT_URL, 'backup_metrics', snapshot);
  }

  const maxAge = Number(env.BACKUP_MAX_AGE_SECONDS || 0);
  if (
    maxAge > 0 &&
    (snapshot.lastBackupAgeSeconds == null ||
      snapshot.lastBackupAgeSeconds > maxAge)
  ) {
    console.error(
      `Backup age ${snapshot.lastBackupAgeSeconds}s exceeds max ${maxAge}s`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
