import { createHash } from 'node:crypto';

import { createPostgresDatabase } from '../database/client.js';
import { AuditService } from '../modules/audit/audit-service.js';
import { PostgresAuditRepository } from '../modules/audit/postgres-audit-repository.js';
import { PostgresRetentionDataStore } from '../modules/privacy/postgres-retention-data-store.js';
import { PostgresRetentionRepository } from '../modules/privacy/postgres-retention-repository.js';
import { RetentionService } from '../modules/privacy/retention-service.js';
import { requireDatabaseUrl } from './cli-args.js';

function readFlag(
  argv: readonly string[],
  name: string,
): string | undefined {
  const flagIndex = argv.findIndex((value) => value === `--${name}`);
  if (flagIndex >= 0) {
    return argv[flagIndex + 1];
  }
  const inline = argv.find((value) => value.startsWith(`--${name}=`));
  if (inline !== undefined) {
    return inline.slice(`--${name}=`.length);
  }
  return undefined;
}

function hasSwitch(argv: readonly string[], name: string): boolean {
  return argv.includes(`--${name}`) || argv.includes(`--${name}=true`);
}

export async function executeRetention(options: {
  databaseUrl: string;
  mode: 'dry_run' | 'execute';
  executionEnabled: boolean;
  policyId?: string;
  runId?: string;
  batchSize?: number;
}): Promise<unknown> {
  const database = createPostgresDatabase(options.databaseUrl);
  try {
    const audit = new AuditService(new PostgresAuditRepository(database));
    const service = new RetentionService(
      new PostgresRetentionRepository(database),
      new PostgresRetentionDataStore(database),
      audit,
      {
        executionEnabled: options.executionEnabled,
        now: () => new Date(),
        confirmPassword: async () => undefined,
        ...(options.batchSize === undefined
          ? {}
          : { batchSize: options.batchSize }),
      },
    );

    const actor = {
      id: null,
      username: 'cli',
      role: 'owner' as const,
    };

    if (options.runId !== undefined) {
      return service.resumeRun(actor, options.runId, {
        currentPassword: 'cli',
      });
    }

    return service.startRun(actor, {
      mode: options.mode,
      currentPassword: 'cli',
      ...(options.mode === 'execute'
        ? { confirmIrreversible: true as const }
        : {}),
      ...(options.policyId === undefined ? {} : { policyId: options.policyId }),
      ...(options.batchSize === undefined
        ? {}
        : { batchSize: options.batchSize }),
    });
  } finally {
    await database.close();
  }
}

/** Backward-compatible dry-run alias used by retention:simulate script. */
export async function simulateRetention(options: {
  databaseUrl: string;
  days?: number;
}): Promise<unknown> {
  const database = createPostgresDatabase(options.databaseUrl);
  try {
    const store = new PostgresRetentionDataStore(database);
    const cutoff = new Date(
      Date.now() - (options.days ?? 365) * 24 * 60 * 60 * 1000,
    );
    const classes = [
      'whatsapp_inbound_messages',
      'whatsapp_conversation_messages',
      'owner_alerts_resolved',
    ] as const;
    const counts: Record<string, number> = {};
    const samples: Record<string, string[]> = {};
    for (const dataClass of classes) {
      const candidates = await store.listCandidates(dataClass, cutoff);
      counts[dataClass] = candidates.length;
      samples[dataClass] = candidates
        .slice(0, 5)
        .map((c) => createHash('sha256').update(c.id).digest('hex').slice(0, 16));
    }
    return {
      mode: 'dry_run_compat',
      days: options.days ?? 365,
      cutoff: cutoff.toISOString(),
      counts,
      sampleOpaqueIds: samples,
      note: 'Use retention:execute --mode=dry_run with an approved policy for full class coverage. Legal durations remain [HUMANO].',
    };
  } finally {
    await database.close();
  }
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const databaseUrl = requireDatabaseUrl(environment);
  const modeRaw = readFlag(argv, 'mode') ?? 'dry_run';
  if (modeRaw !== 'dry_run' && modeRaw !== 'execute') {
    throw new Error('--mode must be dry_run or execute');
  }
  const batchRaw = readFlag(argv, 'batch-size');
  const batchSize =
    batchRaw === undefined ? undefined : Number.parseInt(batchRaw, 10);
  if (batchSize !== undefined && (!Number.isFinite(batchSize) || batchSize < 1)) {
    throw new Error('--batch-size must be a positive integer');
  }

  if (hasSwitch(argv, 'compat-simulate')) {
    const daysRaw = readFlag(argv, 'days');
    const days =
      daysRaw === undefined ? 365 : Number.parseInt(daysRaw, 10);
    const result = await simulateRetention({ databaseUrl, days });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const result = await executeRetention({
    databaseUrl,
    mode: modeRaw,
    executionEnabled: environment.RETENTION_EXECUTION_ENABLED === 'true',
    ...(readFlag(argv, 'policy-id')
      ? { policyId: readFlag(argv, 'policy-id')! }
      : {}),
    ...(readFlag(argv, 'run-id')
      ? { runId: readFlag(argv, 'run-id')! }
      : {}),
    ...(batchSize === undefined ? {} : { batchSize }),
  });
  console.log(JSON.stringify(result, null, 2));
}

const executedAsCli =
  process.argv[1]?.includes('retention-execute') === true ||
  process.argv[1]?.includes('retention-simulate') === true;

if (executedAsCli) {
  main().catch((error: unknown) => {
    console.error('Retention CLI failed');
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exitCode = 1;
  });
}
