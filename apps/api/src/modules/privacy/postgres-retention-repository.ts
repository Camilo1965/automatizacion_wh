import { desc, eq, sql } from 'drizzle-orm';

import type {
  RetentionClassProgress,
  RetentionReport,
  RetentionRunStatus,
} from '@camila/contracts';

import type { PostgresDatabase } from '../../database/client.js';
import {
  retentionPolicies,
  retentionRuns,
} from '../../database/schema/privacy.js';
import type {
  RetentionPolicyRecord,
  RetentionRepository,
  RetentionRunCursor,
  RetentionRunRecord,
} from './retention-repository.js';

function mapPolicy(row: typeof retentionPolicies.$inferSelect): RetentionPolicyRecord {
  return {
    id: row.id,
    version: row.version,
    status: row.status as RetentionPolicyRecord['status'],
    classes: row.classes as RetentionPolicyRecord['classes'],
    createdAt: row.createdAt,
    activatedAt: row.activatedAt,
    createdByUserId: row.createdByUserId,
    activatedByUserId: row.activatedByUserId,
    note: row.note,
  };
}

function mapRun(row: typeof retentionRuns.$inferSelect): RetentionRunRecord {
  return {
    id: row.id,
    policyId: row.policyId,
    policyVersion: row.policyVersion,
    mode: row.mode as RetentionRunRecord['mode'],
    status: row.status as RetentionRunRecord['status'],
    progress: (row.progress ?? []) as RetentionClassProgress[],
    cursor: (row.cursor ?? { classIndex: 0, lastId: null }) as RetentionRunCursor,
    report: (row.report ?? null) as RetentionReport | null,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    actorUserId: row.actorUserId,
    correlationId: row.correlationId,
    batchSize: row.batchSize,
  };
}

export class PostgresRetentionRepository implements RetentionRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async nextPolicyVersion(): Promise<number> {
    const rows = await this.database.orm
      .select({
        max: sql<number>`COALESCE(MAX(${retentionPolicies.version}), 0)::int`,
      })
      .from(retentionPolicies);
    return (rows[0]?.max ?? 0) + 1;
  }

  async insertPolicy(
    input: Omit<RetentionPolicyRecord, 'version'> & { version?: number },
  ): Promise<RetentionPolicyRecord> {
    const version = input.version ?? (await this.nextPolicyVersion());
    const [row] = await this.database.orm
      .insert(retentionPolicies)
      .values({
        id: input.id,
        version,
        status: input.status,
        classes: input.classes,
        createdAt: input.createdAt,
        activatedAt: input.activatedAt,
        createdByUserId: input.createdByUserId,
        activatedByUserId: input.activatedByUserId,
        note: input.note,
      })
      .returning();
    return mapPolicy(row!);
  }

  async updatePolicyStatus(input: {
    id: string;
    status: RetentionPolicyRecord['status'];
    activatedAt?: Date | null;
    activatedByUserId?: string | null;
  }): Promise<RetentionPolicyRecord> {
    const [row] = await this.database.orm
      .update(retentionPolicies)
      .set({
        status: input.status,
        ...(input.activatedAt === undefined
          ? {}
          : { activatedAt: input.activatedAt }),
        ...(input.activatedByUserId === undefined
          ? {}
          : { activatedByUserId: input.activatedByUserId }),
      })
      .where(eq(retentionPolicies.id, input.id))
      .returning();
    if (row === undefined) {
      throw new Error('policy_not_found');
    }
    return mapPolicy(row);
  }

  async supersedeActiveExcept(activeId: string, at: Date): Promise<void> {
    void at;
    await this.database.orm
      .update(retentionPolicies)
      .set({ status: 'superseded' })
      .where(
        sql`${retentionPolicies.status} = 'active' AND ${retentionPolicies.id} <> ${activeId}`,
      );
  }

  async findPolicyById(id: string): Promise<RetentionPolicyRecord | null> {
    const rows = await this.database.orm
      .select()
      .from(retentionPolicies)
      .where(eq(retentionPolicies.id, id))
      .limit(1);
    return rows[0] === undefined ? null : mapPolicy(rows[0]);
  }

  async findActivePolicy(): Promise<RetentionPolicyRecord | null> {
    const rows = await this.database.orm
      .select()
      .from(retentionPolicies)
      .where(eq(retentionPolicies.status, 'active'))
      .limit(1);
    return rows[0] === undefined ? null : mapPolicy(rows[0]);
  }

  async listPolicies(): Promise<RetentionPolicyRecord[]> {
    const rows = await this.database.orm
      .select()
      .from(retentionPolicies)
      .orderBy(desc(retentionPolicies.version));
    return rows.map(mapPolicy);
  }

  async insertRun(
    input: Omit<RetentionRunRecord, 'progress' | 'cursor' | 'report'> & {
      progress?: RetentionClassProgress[];
      cursor?: RetentionRunCursor;
      report?: RetentionReport | null;
    },
  ): Promise<RetentionRunRecord> {
    const [row] = await this.database.orm
      .insert(retentionRuns)
      .values({
        id: input.id,
        policyId: input.policyId,
        policyVersion: input.policyVersion,
        mode: input.mode,
        status: input.status,
        progress: input.progress ?? [],
        cursor: input.cursor ?? { classIndex: 0, lastId: null },
        report: input.report ?? null,
        errorMessage: input.errorMessage,
        createdAt: input.createdAt,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        actorUserId: input.actorUserId,
        correlationId: input.correlationId,
        batchSize: input.batchSize,
      })
      .returning();
    return mapRun(row!);
  }

  async updateRun(input: {
    id: string;
    status?: RetentionRunStatus;
    progress?: RetentionClassProgress[];
    cursor?: RetentionRunCursor;
    report?: RetentionReport | null;
    errorMessage?: string | null;
    startedAt?: Date | null;
    finishedAt?: Date | null;
  }): Promise<RetentionRunRecord> {
    const [row] = await this.database.orm
      .update(retentionRuns)
      .set({
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.progress === undefined ? {} : { progress: input.progress }),
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        ...(input.report === undefined ? {} : { report: input.report }),
        ...(input.errorMessage === undefined
          ? {}
          : { errorMessage: input.errorMessage }),
        ...(input.startedAt === undefined ? {} : { startedAt: input.startedAt }),
        ...(input.finishedAt === undefined
          ? {}
          : { finishedAt: input.finishedAt }),
      })
      .where(eq(retentionRuns.id, input.id))
      .returning();
    if (row === undefined) {
      throw new Error('run_not_found');
    }
    return mapRun(row);
  }

  async findRunById(id: string): Promise<RetentionRunRecord | null> {
    const rows = await this.database.orm
      .select()
      .from(retentionRuns)
      .where(eq(retentionRuns.id, id))
      .limit(1);
    return rows[0] === undefined ? null : mapRun(rows[0]);
  }

  async listRuns(): Promise<RetentionRunRecord[]> {
    const rows = await this.database.orm
      .select()
      .from(retentionRuns)
      .orderBy(desc(retentionRuns.createdAt));
    return rows.map(mapRun);
  }
}
