import { randomUUID } from 'node:crypto';

import type {
  RetentionClassProgress,
  RetentionReport,
  RetentionRunStatus,
} from '@camila/contracts';

import type {
  RetentionPolicyRecord,
  RetentionRepository,
  RetentionRunCursor,
  RetentionRunRecord,
} from './retention-repository.js';

export class InMemoryRetentionRepository implements RetentionRepository {
  private readonly policies: RetentionPolicyRecord[] = [];
  private readonly runs: RetentionRunRecord[] = [];
  private versionSeq = 0;

  async nextPolicyVersion(): Promise<number> {
    this.versionSeq += 1;
    return this.versionSeq;
  }

  async insertPolicy(
    input: Omit<RetentionPolicyRecord, 'version'> & { version?: number },
  ): Promise<RetentionPolicyRecord> {
    const version = input.version ?? (await this.nextPolicyVersion());
    const row: RetentionPolicyRecord = { ...input, version };
    this.policies.push(row);
    return row;
  }

  async updatePolicyStatus(input: {
    id: string;
    status: RetentionPolicyRecord['status'];
    activatedAt?: Date | null;
    activatedByUserId?: string | null;
  }): Promise<RetentionPolicyRecord> {
    const row = this.policies.find((p) => p.id === input.id);
    if (row === undefined) {
      throw new Error('policy_not_found');
    }
    row.status = input.status;
    if (input.activatedAt !== undefined) {
      row.activatedAt = input.activatedAt;
    }
    if (input.activatedByUserId !== undefined) {
      row.activatedByUserId = input.activatedByUserId;
    }
    return row;
  }

  async supersedeActiveExcept(activeId: string, _at: Date): Promise<void> {
    for (const policy of this.policies) {
      if (policy.id !== activeId && policy.status === 'active') {
        policy.status = 'superseded';
      }
    }
  }

  async findPolicyById(id: string): Promise<RetentionPolicyRecord | null> {
    return this.policies.find((p) => p.id === id) ?? null;
  }

  async findActivePolicy(): Promise<RetentionPolicyRecord | null> {
    return this.policies.find((p) => p.status === 'active') ?? null;
  }

  async listPolicies(): Promise<RetentionPolicyRecord[]> {
    return [...this.policies].sort((a, b) => b.version - a.version);
  }

  async insertRun(
    input: Omit<RetentionRunRecord, 'progress' | 'cursor' | 'report'> & {
      progress?: RetentionClassProgress[];
      cursor?: RetentionRunCursor;
      report?: RetentionReport | null;
    },
  ): Promise<RetentionRunRecord> {
    const row: RetentionRunRecord = {
      ...input,
      progress: input.progress ?? [],
      cursor: input.cursor ?? { classIndex: 0, lastId: null },
      report: input.report ?? null,
    };
    this.runs.unshift(row);
    return row;
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
    const row = this.runs.find((r) => r.id === input.id);
    if (row === undefined) {
      throw new Error('run_not_found');
    }
    if (input.status !== undefined) {
      row.status = input.status;
    }
    if (input.progress !== undefined) {
      row.progress = input.progress;
    }
    if (input.cursor !== undefined) {
      row.cursor = input.cursor;
    }
    if (input.report !== undefined) {
      row.report = input.report;
    }
    if (input.errorMessage !== undefined) {
      row.errorMessage = input.errorMessage;
    }
    if (input.startedAt !== undefined) {
      row.startedAt = input.startedAt;
    }
    if (input.finishedAt !== undefined) {
      row.finishedAt = input.finishedAt;
    }
    return row;
  }

  async findRunById(id: string): Promise<RetentionRunRecord | null> {
    return this.runs.find((r) => r.id === id) ?? null;
  }

  async listRuns(): Promise<RetentionRunRecord[]> {
    return [...this.runs];
  }

  /** Test helper */
  createId(): string {
    return randomUUID();
  }
}
