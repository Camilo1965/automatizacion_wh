import type {
  RetentionClassPolicy,
  RetentionClassProgress,
  RetentionPolicy,
  RetentionPolicyStatus,
  RetentionReport,
  RetentionRun,
  RetentionRunMode,
  RetentionRunStatus,
} from '@camila/contracts';

export type RetentionPolicyRecord = {
  id: string;
  version: number;
  status: RetentionPolicyStatus;
  classes: RetentionClassPolicy[];
  createdAt: Date;
  activatedAt: Date | null;
  createdByUserId: string | null;
  activatedByUserId: string | null;
  note: string | null;
};

export type RetentionRunCursor = {
  classIndex: number;
  lastId: string | null;
};

export type RetentionRunRecord = {
  id: string;
  policyId: string;
  policyVersion: number;
  mode: RetentionRunMode;
  status: RetentionRunStatus;
  progress: RetentionClassProgress[];
  cursor: RetentionRunCursor;
  report: RetentionReport | null;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  actorUserId: string | null;
  correlationId: string | null;
  batchSize: number;
};

export type RetentionRepository = {
  nextPolicyVersion(): Promise<number>;
  insertPolicy(
    input: Omit<RetentionPolicyRecord, 'version'> & { version?: number },
  ): Promise<RetentionPolicyRecord>;
  updatePolicyStatus(input: {
    id: string;
    status: RetentionPolicyStatus;
    activatedAt?: Date | null;
    activatedByUserId?: string | null;
  }): Promise<RetentionPolicyRecord>;
  supersedeActiveExcept(activeId: string, at: Date): Promise<void>;
  findPolicyById(id: string): Promise<RetentionPolicyRecord | null>;
  findActivePolicy(): Promise<RetentionPolicyRecord | null>;
  listPolicies(): Promise<RetentionPolicyRecord[]>;
  insertRun(
    input: Omit<RetentionRunRecord, 'progress' | 'cursor' | 'report'> & {
      progress?: RetentionClassProgress[];
      cursor?: RetentionRunCursor;
      report?: RetentionReport | null;
    },
  ): Promise<RetentionRunRecord>;
  updateRun(input: {
    id: string;
    status?: RetentionRunStatus;
    progress?: RetentionClassProgress[];
    cursor?: RetentionRunCursor;
    report?: RetentionReport | null;
    errorMessage?: string | null;
    startedAt?: Date | null;
    finishedAt?: Date | null;
  }): Promise<RetentionRunRecord>;
  findRunById(id: string): Promise<RetentionRunRecord | null>;
  listRuns(): Promise<RetentionRunRecord[]>;
};

export function toPublicPolicy(row: RetentionPolicyRecord): RetentionPolicy {
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    classes: row.classes,
    createdAt: row.createdAt.toISOString(),
    activatedAt: row.activatedAt?.toISOString() ?? null,
    note: row.note,
  };
}

export function toPublicRun(row: RetentionRunRecord): RetentionRun {
  return {
    id: row.id,
    policyId: row.policyId,
    policyVersion: row.policyVersion,
    mode: row.mode,
    status: row.status,
    progress: row.progress,
    report: row.report,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}
