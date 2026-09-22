import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_HEARTBEAT_MAX_AGE_MS,
  WorkerHealthMonitor,
  evaluateWorkerReadiness,
  readWorkerHealthSnapshot,
  runWorkerHealthCheck,
} from '../src/modules/health/worker-health.js';

describe('evaluateWorkerReadiness', () => {
  it('is not ready when the database is unreachable', () => {
    const result = evaluateWorkerReadiness({
      databaseReachable: false,
      schedulerInitialized: true,
      lastHeartbeatAtMs: Date.now(),
      nowMs: Date.now(),
      heartbeatMaxAgeMs: DEFAULT_HEARTBEAT_MAX_AGE_MS,
    });

    expect(result.ready).toBe(false);
    expect(result.checks.database).toBe('down');
  });

  it('is not ready before the scheduler initializes', () => {
    const now = 1_000_000;
    const result = evaluateWorkerReadiness({
      databaseReachable: true,
      schedulerInitialized: false,
      lastHeartbeatAtMs: now,
      nowMs: now,
      heartbeatMaxAgeMs: DEFAULT_HEARTBEAT_MAX_AGE_MS,
    });

    expect(result.ready).toBe(false);
    expect(result.checks.scheduler).toBe('not_initialized');
  });

  it('is not ready when the heartbeat is stale', () => {
    const now = 1_000_000;
    const result = evaluateWorkerReadiness({
      databaseReachable: true,
      schedulerInitialized: true,
      lastHeartbeatAtMs: now - DEFAULT_HEARTBEAT_MAX_AGE_MS - 1,
      nowMs: now,
      heartbeatMaxAgeMs: DEFAULT_HEARTBEAT_MAX_AGE_MS,
    });

    expect(result.ready).toBe(false);
    expect(result.checks.heartbeat).toBe('stale');
  });

  it('is ready when DB, scheduler, and fresh heartbeat all pass', () => {
    const now = 1_000_000;
    const result = evaluateWorkerReadiness({
      databaseReachable: true,
      schedulerInitialized: true,
      lastHeartbeatAtMs: now - 1_000,
      nowMs: now,
      heartbeatMaxAgeMs: DEFAULT_HEARTBEAT_MAX_AGE_MS,
    });

    expect(result).toEqual({
      ready: true,
      checks: {
        database: 'up',
        scheduler: 'initialized',
        heartbeat: 'fresh',
      },
    });
  });
});

describe('WorkerHealthMonitor', () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory !== undefined) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('persists scheduler + heartbeat so a separate check process can read them', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'kairo-worker-health-'));
    const healthFilePath = path.join(directory, 'health.json');
    let now = 5_000;
    const monitor = new WorkerHealthMonitor({
      healthFilePath,
      now: () => now,
    });

    monitor.markSchedulerInitialized();
    now = 5_500;
    monitor.recordHeartbeat();
    await monitor.persist();

    const raw = JSON.parse(await readFile(healthFilePath, 'utf8')) as {
      schedulerInitialized: boolean;
      lastHeartbeatAt: string;
      pid: number;
    };
    expect(raw.schedulerInitialized).toBe(true);
    expect(raw.lastHeartbeatAt).toBe(new Date(5_500).toISOString());
    expect(raw.pid).toBe(process.pid);

    const snapshot = await readWorkerHealthSnapshot(healthFilePath);
    expect(snapshot).toEqual(raw);
  });
});

describe('runWorkerHealthCheck', () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory !== undefined) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('exits 0 only when snapshot, DB ping, and freshness all succeed', async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'kairo-worker-health-'));
    const healthFilePath = path.join(directory, 'health.json');
    const now = Date.now();
    await writeFile(
      healthFilePath,
      JSON.stringify({
        schedulerInitialized: true,
        lastHeartbeatAt: new Date(now).toISOString(),
        pid: 1,
      }),
      'utf8',
    );

    const ok = await runWorkerHealthCheck({
      healthFilePath,
      pingDatabase: async () => undefined,
      nowMs: now,
      heartbeatMaxAgeMs: DEFAULT_HEARTBEAT_MAX_AGE_MS,
    });
    expect(ok).toBe(0);

    const missing = await runWorkerHealthCheck({
      healthFilePath: path.join(directory, 'missing.json'),
      pingDatabase: async () => undefined,
      nowMs: now,
      heartbeatMaxAgeMs: DEFAULT_HEARTBEAT_MAX_AGE_MS,
    });
    expect(missing).toBe(1);

    const dbDown = await runWorkerHealthCheck({
      healthFilePath,
      pingDatabase: async () => {
        throw new Error('down');
      },
      nowMs: now,
      heartbeatMaxAgeMs: DEFAULT_HEARTBEAT_MAX_AGE_MS,
    });
    expect(dbDown).toBe(1);
  });
});
