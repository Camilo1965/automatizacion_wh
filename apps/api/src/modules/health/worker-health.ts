import { readFile, writeFile } from 'node:fs/promises';

export const DEFAULT_HEARTBEAT_MAX_AGE_MS = 90_000;

export const DEFAULT_WORKER_HEALTH_FILE =
  process.env.WORKER_HEALTH_FILE?.trim() || '/tmp/kairo-worker-health.json';

export type WorkerHealthSnapshot = Readonly<{
  schedulerInitialized: boolean;
  lastHeartbeatAt: string | null;
  pid: number;
}>;

export type WorkerReadinessChecks = Readonly<{
  database: 'up' | 'down';
  scheduler: 'initialized' | 'not_initialized';
  heartbeat: 'fresh' | 'stale' | 'missing';
}>;

export type WorkerReadiness = Readonly<{
  ready: boolean;
  checks: WorkerReadinessChecks;
}>;

export function evaluateWorkerReadiness(input: {
  databaseReachable: boolean;
  schedulerInitialized: boolean;
  lastHeartbeatAtMs: number | null;
  nowMs: number;
  heartbeatMaxAgeMs: number;
}): WorkerReadiness {
  const database: WorkerReadinessChecks['database'] = input.databaseReachable
    ? 'up'
    : 'down';
  const scheduler: WorkerReadinessChecks['scheduler'] =
    input.schedulerInitialized ? 'initialized' : 'not_initialized';

  let heartbeat: WorkerReadinessChecks['heartbeat'];
  if (input.lastHeartbeatAtMs === null) {
    heartbeat = 'missing';
  } else if (input.nowMs - input.lastHeartbeatAtMs > input.heartbeatMaxAgeMs) {
    heartbeat = 'stale';
  } else {
    heartbeat = 'fresh';
  }

  return {
    ready:
      database === 'up' && scheduler === 'initialized' && heartbeat === 'fresh',
    checks: { database, scheduler, heartbeat },
  };
}

export class WorkerHealthMonitor {
  private schedulerInitialized = false;
  private lastHeartbeatAtMs: number | null = null;
  private readonly healthFilePath: string;
  private readonly now: () => number;

  constructor(options?: { healthFilePath?: string; now?: () => number }) {
    this.healthFilePath = options?.healthFilePath ?? DEFAULT_WORKER_HEALTH_FILE;
    this.now = options?.now ?? Date.now;
  }

  markSchedulerInitialized(): void {
    this.schedulerInitialized = true;
  }

  recordHeartbeat(): void {
    this.lastHeartbeatAtMs = this.now();
  }

  snapshot(): WorkerHealthSnapshot {
    return {
      schedulerInitialized: this.schedulerInitialized,
      lastHeartbeatAt:
        this.lastHeartbeatAtMs === null
          ? null
          : new Date(this.lastHeartbeatAtMs).toISOString(),
      pid: process.pid,
    };
  }

  async persist(): Promise<void> {
    await writeFile(
      this.healthFilePath,
      `${JSON.stringify(this.snapshot())}\n`,
      'utf8',
    );
  }
}

export async function readWorkerHealthSnapshot(
  healthFilePath: string,
): Promise<WorkerHealthSnapshot | null> {
  try {
    const raw = await readFile(healthFilePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<WorkerHealthSnapshot>;
    if (
      typeof parsed.schedulerInitialized !== 'boolean' ||
      (parsed.lastHeartbeatAt !== null &&
        typeof parsed.lastHeartbeatAt !== 'string') ||
      typeof parsed.pid !== 'number'
    ) {
      return null;
    }
    return {
      schedulerInitialized: parsed.schedulerInitialized,
      lastHeartbeatAt: parsed.lastHeartbeatAt ?? null,
      pid: parsed.pid,
    };
  } catch {
    return null;
  }
}

export async function runWorkerHealthCheck(options: {
  healthFilePath: string;
  pingDatabase: () => Promise<void>;
  nowMs?: number;
  heartbeatMaxAgeMs?: number;
}): Promise<0 | 1> {
  const snapshot = await readWorkerHealthSnapshot(options.healthFilePath);
  if (snapshot === null) {
    return 1;
  }

  let databaseReachable: boolean;
  try {
    await options.pingDatabase();
    databaseReachable = true;
  } catch {
    databaseReachable = false;
  }

  const lastHeartbeatAtMs =
    snapshot.lastHeartbeatAt === null
      ? null
      : Date.parse(snapshot.lastHeartbeatAt);
  if (snapshot.lastHeartbeatAt !== null && Number.isNaN(lastHeartbeatAtMs)) {
    return 1;
  }

  const readiness = evaluateWorkerReadiness({
    databaseReachable,
    schedulerInitialized: snapshot.schedulerInitialized,
    lastHeartbeatAtMs,
    nowMs: options.nowMs ?? Date.now(),
    heartbeatMaxAgeMs:
      options.heartbeatMaxAgeMs ?? DEFAULT_HEARTBEAT_MAX_AGE_MS,
  });

  return readiness.ready ? 0 : 1;
}
