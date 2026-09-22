import { readFile } from 'node:fs/promises';
import { sql } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import {
  applyBackupSnapshot,
  applyQueueSnapshots,
  type BackupMetricsSnapshot,
  type MetricsRegistry,
  type QueueSnapshot,
} from './metrics.js';
import {
  DEFAULT_WORKER_HEALTH_FILE,
  readWorkerHealthSnapshot,
} from '../health/worker-health.js';

type QueueRow = Readonly<{
  depth: number;
  oldest_age_seconds: number | null;
}>;

async function queueSnapshot(
  database: PostgresDatabase,
  queue: QueueSnapshot['queue'],
  query: ReturnType<typeof sql>,
): Promise<QueueSnapshot> {
  const rows = (await database.orm.execute(query)) as unknown as QueueRow[];
  const row = rows[0];
  return {
    queue,
    depth: Number(row?.depth ?? 0),
    oldestAgeSeconds: Number(row?.oldest_age_seconds ?? 0),
  };
}

export async function collectQueueSnapshots(
  database: PostgresDatabase,
): Promise<readonly QueueSnapshot[]> {
  const outbound = await queueSnapshot(
    database,
    'whatsapp_outbound',
    sql`
      SELECT
        count(*)::int AS depth,
        COALESCE(
          EXTRACT(EPOCH FROM (now() - min(created_at)))::float8,
          0
        ) AS oldest_age_seconds
      FROM whatsapp_outbound_messages
      WHERE status IN ('pending', 'processing')
    `,
  );
  const guides = await queueSnapshot(
    database,
    'shipping_guide',
    sql`
      SELECT
        count(*)::int AS depth,
        COALESCE(
          EXTRACT(EPOCH FROM (now() - min(created_at)))::float8,
          0
        ) AS oldest_age_seconds
      FROM shipping_guide_jobs
      WHERE status IN ('pending', 'processing', 'uncertain')
    `,
  );
  const alerts = await queueSnapshot(
    database,
    'owner_alert',
    sql`
      SELECT
        count(*)::int AS depth,
        COALESCE(
          EXTRACT(EPOCH FROM (now() - min(created_at)))::float8,
          0
        ) AS oldest_age_seconds
      FROM owner_alerts
      WHERE status <> 'resolved'
        AND created_at > now() - interval '1 day'
        AND NOT EXISTS (
          SELECT 1 FROM owner_alert_deliveries d WHERE d.alert_id = owner_alerts.id
        )
    `,
  );
  return [outbound, guides, alerts];
}

export async function readBackupMetricsFile(
  path: string,
): Promise<BackupMetricsSnapshot | null> {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<BackupMetricsSnapshot> & {
      lastBackupOk?: unknown;
    };
    const snapshot: BackupMetricsSnapshot = {
      lastSuccessfulBackupAt:
        typeof parsed.lastSuccessfulBackupAt === 'string'
          ? parsed.lastSuccessfulBackupAt
          : null,
      lastBackupAgeSeconds:
        typeof parsed.lastBackupAgeSeconds === 'number'
          ? parsed.lastBackupAgeSeconds
          : null,
      lastRestoreDrillOk:
        typeof parsed.lastRestoreDrillOk === 'boolean'
          ? parsed.lastRestoreDrillOk
          : null,
    };
    if (typeof parsed.lastBackupOk === 'boolean') {
      return { ...snapshot, lastBackupOk: parsed.lastBackupOk };
    }
    return snapshot;
  } catch {
    return null;
  }
}

export async function refreshOperationalGauges(input: {
  metrics: MetricsRegistry;
  database: PostgresDatabase;
  backupMetricsPath?: string;
  workerHealthFilePath?: string;
  nowMs?: number;
}): Promise<void> {
  const nowMs = input.nowMs ?? Date.now();

  try {
    await input.database.ping();
    input.metrics.setDbReady(true);
  } catch {
    input.metrics.setDbReady(false);
  }

  try {
    const queues = await collectQueueSnapshots(input.database);
    applyQueueSnapshots(input.metrics, queues);
  } catch {
    // Keep last known queue gauges if DB query fails mid-scrape.
  }

  if (input.backupMetricsPath !== undefined) {
    const backup = await readBackupMetricsFile(input.backupMetricsPath);
    if (backup !== null) {
      applyBackupSnapshot(input.metrics, backup, nowMs);
    }
  }

  const healthPath = input.workerHealthFilePath ?? DEFAULT_WORKER_HEALTH_FILE;
  const health = await readWorkerHealthSnapshot(healthPath);
  if (health?.lastHeartbeatAt) {
    const parsed = Date.parse(health.lastHeartbeatAt);
    if (!Number.isNaN(parsed)) {
      input.metrics.setWorkerHeartbeat(parsed / 1000);
      input.metrics.setWorkerHeartbeatAgeSeconds(
        Math.max(0, (nowMs - parsed) / 1000),
      );
    }
  }
}
