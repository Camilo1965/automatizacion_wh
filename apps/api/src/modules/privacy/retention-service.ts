import { createHash, randomUUID } from 'node:crypto';

import type {
  DataSubjectPreview,
  DataSubjectResult,
  PrivacyDataClass,
  RetentionAction,
  RetentionClassPolicy,
  RetentionClassProgress,
  RetentionPolicy,
  RetentionReport,
  RetentionRun,
} from '@camila/contracts';

import type { AuditService } from '../audit/audit-service.js';
import { inventoryFor, PRIVACY_INVENTORY } from './retention-policy.js';
import {
  toPublicPolicy,
  toPublicRun,
  type RetentionPolicyRecord,
  type RetentionRepository,
  type RetentionRunRecord,
} from './retention-repository.js';

export { PRIVACY_INVENTORY } from './retention-policy.js';

export class RetentionPolicyNotApprovedError extends Error {
  readonly code = 'retention_policy_not_approved';
  constructor(message = 'No approved active retention policy') {
    super(message);
    this.name = 'RetentionPolicyNotApprovedError';
  }
}

export class RetentionExecutionDisabledError extends Error {
  readonly code = 'retention_execution_disabled';
  constructor(
    message = 'Retention execution disabled until RETENTION_EXECUTION_ENABLED=true',
  ) {
    super(message);
    this.name = 'RetentionExecutionDisabledError';
  }
}

export class RetentionValidationError extends Error {
  readonly code = 'retention_validation';
  constructor(message: string) {
    super(message);
    this.name = 'RetentionValidationError';
  }
}

export class RetentionConfirmationRequiredError extends Error {
  readonly code = 'retention_confirmation_required';
  constructor(message = 'confirmIrreversible must be true') {
    super(message);
    this.name = 'RetentionConfirmationRequiredError';
  }
}

export type RetentionRecordSnapshot = {
  id: string;
  dataClass: PrivacyDataClass;
  createdAt: Date;
  customerPhone?: string | null;
  customerName?: string | null;
  address?: string | null;
  textBody?: string | null;
  status?: string;
  processed: boolean;
  anonymized?: boolean;
  deleted?: boolean;
};

export type CustomerRelatedSnapshot = {
  customerOpaqueId: string;
  customerIds: string[];
  orders: Array<{
    id: string;
    status: string;
    createdAt: Date;
    customerName: string | null;
    customerPhone: string | null;
    address: string | null;
  }>;
  inboundIds: string[];
  conversationMessageIds: string[];
  outboundIds: string[];
  conversationIds: string[];
};

export type RetentionDataStore = {
  listCandidates(
    dataClass: PrivacyDataClass,
    cutoff: Date,
  ): Promise<Array<{ id: string; createdAt: Date }>>;
  applyAction(
    dataClass: PrivacyDataClass,
    action: RetentionAction,
    ids: string[],
  ): Promise<number>;
  findCustomerRelated(customerPhone: string): Promise<CustomerRelatedSnapshot>;
  anonymizeCustomer(customerPhone: string): Promise<{
    customerOpaqueId: string;
    relatedCounts: Record<string, number>;
  }>;
  dump?(): RetentionRecordSnapshot[];
};

export type RetentionActor = {
  id: string | null;
  username: string;
  role: 'owner' | 'operator';
};

export type RetentionServiceOptions = {
  executionEnabled: boolean;
  now: () => Date;
  confirmPassword: (actor: RetentionActor, password: string) => Promise<void>;
  batchSize?: number;
  onBatchApplied?: () => Promise<void>;
  reportSigningKey?: string;
};

function opaqueId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function signReport(
  payload: Omit<RetentionReport, 'signature'>,
  key: string,
): string {
  return createHash('sha256')
    .update(key)
    .update(JSON.stringify(payload))
    .digest('hex');
}

function assertClassPolicies(classes: RetentionClassPolicy[]): void {
  const seen = new Set<string>();
  for (const entry of classes) {
    if (seen.has(entry.dataClass)) {
      throw new RetentionValidationError(
        `Duplicate data class: ${entry.dataClass}`,
      );
    }
    seen.add(entry.dataClass);
    const inventory = inventoryFor(entry.dataClass);
    if (!inventory.allowedActions.includes(entry.action)) {
      throw new RetentionValidationError(
        `Action ${entry.action} not allowed for ${entry.dataClass}; allowed: ${inventory.allowedActions.join(', ')}`,
      );
    }
  }
}

function policyIsFullyApproved(policy: RetentionPolicyRecord): boolean {
  return policy.classes.every(
    (c) =>
      c.legalStatus === 'approved' &&
      c.retentionDays !== null &&
      Number.isFinite(c.retentionDays),
  );
}

export class RetentionService {
  constructor(
    private readonly repository: RetentionRepository,
    private readonly store: RetentionDataStore,
    private readonly audit: AuditService,
    private readonly options: RetentionServiceOptions,
  ) {}

  getInventory() {
    return {
      items: PRIVACY_INVENTORY.map((item) => ({
        dataClass: item.dataClass,
        tables: [...item.tables],
        piiFields: [...item.piiFields],
        relationshipStrategy: item.relationshipStrategy,
        allowedActions: [...item.allowedActions],
      })),
      capabilityNote:
        'security:manage for activate/execute; audit:read for reports' as const,
      legalDurationsStatus: '[HUMANO]' as const,
    };
  }

  async listPolicies(): Promise<RetentionPolicy[]> {
    const rows = await this.repository.listPolicies();
    return rows.map(toPublicPolicy);
  }

  async listRuns(): Promise<RetentionRun[]> {
    const rows = await this.repository.listRuns();
    return rows.map(toPublicRun);
  }

  async getRun(runId: string): Promise<RetentionRun | null> {
    const row = await this.repository.findRunById(runId);
    return row === null ? null : toPublicRun(row);
  }

  async createDraftPolicy(
    actor: RetentionActor,
    input: {
      classes: RetentionClassPolicy[];
      note?: string;
      currentPassword: string;
    },
  ): Promise<RetentionPolicy> {
    await this.options.confirmPassword(actor, input.currentPassword);
    assertClassPolicies(input.classes);
    const version = await this.repository.nextPolicyVersion();
    const row = await this.repository.insertPolicy({
      id: randomUUID(),
      version,
      status: 'draft',
      classes: input.classes,
      createdAt: this.options.now(),
      activatedAt: null,
      createdByUserId: actor.id,
      activatedByUserId: null,
      note: input.note ?? null,
    });
    await this.audit.record({
      action: 'retention.policy_drafted',
      result: 'success',
      actorUserId: actor.id,
      actorUsername: actor.username,
      targetType: 'retention_policy',
      targetId: row.id,
      metadata: { version: row.version, classCount: row.classes.length },
    });
    return toPublicPolicy(row);
  }

  async activatePolicy(
    actor: RetentionActor,
    policyId: string,
    input: { currentPassword: string; confirmIrreversible: true },
  ): Promise<RetentionPolicy> {
    await this.options.confirmPassword(actor, input.currentPassword);
    if (input.confirmIrreversible !== true) {
      throw new RetentionConfirmationRequiredError();
    }
    const policy = await this.repository.findPolicyById(policyId);
    if (policy === null) {
      throw new RetentionValidationError('Policy not found');
    }
    if (!policyIsFullyApproved(policy)) {
      throw new RetentionPolicyNotApprovedError(
        'Cannot activate: every class needs approved legalStatus, retentionDays and action ([HUMANO] until Colombia approval)',
      );
    }
    assertClassPolicies(policy.classes);
    const at = this.options.now();
    await this.repository.supersedeActiveExcept(policy.id, at);
    const activated = await this.repository.updatePolicyStatus({
      id: policy.id,
      status: 'active',
      activatedAt: at,
      activatedByUserId: actor.id,
    });
    await this.audit.record({
      action: 'retention.policy_activated',
      result: 'success',
      actorUserId: actor.id,
      actorUsername: actor.username,
      targetType: 'retention_policy',
      targetId: activated.id,
      metadata: { version: activated.version },
    });
    return toPublicPolicy(activated);
  }

  async startRun(
    actor: RetentionActor,
    input: {
      mode: 'dry_run' | 'execute';
      currentPassword: string;
      confirmIrreversible?: true;
      policyId?: string;
      batchSize?: number;
    },
  ): Promise<RetentionRun> {
    await this.options.confirmPassword(actor, input.currentPassword);
    const policy = await this.resolvePolicyForRun(input.mode, input.policyId);
    if (input.mode === 'execute') {
      if (input.confirmIrreversible !== true) {
        throw new RetentionConfirmationRequiredError();
      }
      if (!this.options.executionEnabled) {
        throw new RetentionExecutionDisabledError();
      }
      if (policy.status !== 'active' || !policyIsFullyApproved(policy)) {
        throw new RetentionPolicyNotApprovedError();
      }
    }

    const batchSize = input.batchSize ?? this.options.batchSize ?? 100;
    const run = await this.repository.insertRun({
      id: randomUUID(),
      policyId: policy.id,
      policyVersion: policy.version,
      mode: input.mode,
      status: 'pending',
      errorMessage: null,
      createdAt: this.options.now(),
      startedAt: null,
      finishedAt: null,
      actorUserId: actor.id,
      correlationId: randomUUID(),
      batchSize,
    });

    try {
      const completed = await this.processRun(run, policy);
      await this.audit.record({
        action:
          input.mode === 'dry_run'
            ? 'retention.simulated'
            : 'retention.executed',
        result: 'success',
        actorUserId: actor.id,
        actorUsername: actor.username,
        targetType: 'retention_run',
        targetId: completed.id,
        correlationId: completed.correlationId,
        metadata: {
          mode: input.mode,
          policyVersion: policy.version,
        },
      });
      return toPublicRun(completed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      await this.repository.updateRun({
        id: run.id,
        status: 'failed',
        errorMessage: message,
        finishedAt: this.options.now(),
      });
      await this.audit.record({
        action:
          input.mode === 'dry_run'
            ? 'retention.simulated'
            : 'retention.executed',
        result: 'failure',
        actorUserId: actor.id,
        actorUsername: actor.username,
        targetType: 'retention_run',
        targetId: run.id,
        metadata: { mode: input.mode, error: message.slice(0, 200) },
      });
      throw error;
    }
  }

  async resumeRun(
    actor: RetentionActor,
    runId: string,
    input: { currentPassword: string },
  ): Promise<RetentionRun> {
    await this.options.confirmPassword(actor, input.currentPassword);
    const run = await this.repository.findRunById(runId);
    if (run === null) {
      throw new RetentionValidationError('Run not found');
    }
    if (run.mode === 'execute' && !this.options.executionEnabled) {
      throw new RetentionExecutionDisabledError();
    }
    const policy = await this.repository.findPolicyById(run.policyId);
    if (policy === null) {
      throw new RetentionValidationError('Policy not found');
    }
    if (
      run.mode === 'execute' &&
      (policy.status !== 'active' || !policyIsFullyApproved(policy))
    ) {
      throw new RetentionPolicyNotApprovedError();
    }
    try {
      const completed = await this.processRun(run, policy);
      await this.audit.record({
        action: 'retention.executed',
        result: 'success',
        actorUserId: actor.id,
        actorUsername: actor.username,
        targetType: 'retention_run',
        targetId: completed.id,
        correlationId: completed.correlationId,
        metadata: { resumed: true, policyVersion: policy.version },
      });
      return toPublicRun(completed);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      await this.repository.updateRun({
        id: run.id,
        status: 'failed',
        errorMessage: message,
        finishedAt: this.options.now(),
      });
      throw error;
    }
  }

  async previewDataSubject(
    actor: RetentionActor,
    input: {
      kind: 'export' | 'anonymize';
      customerPhone: string;
      currentPassword: string;
    },
  ): Promise<DataSubjectPreview> {
    await this.options.confirmPassword(actor, input.currentPassword);
    const related = await this.store.findCustomerRelated(input.customerPhone);
    const preview: DataSubjectPreview = {
      kind: input.kind,
      customerOpaqueId: related.customerOpaqueId,
      relatedCounts: {
        customers: related.customerIds.length,
        orders: related.orders.length,
        inbound: related.inboundIds.length,
        conversationMessages: related.conversationMessageIds.length,
        outbound: related.outboundIds.length,
        conversations: related.conversationIds.length,
      },
      sampleOpaqueIds: [
        ...related.orders.map((o) => opaqueId(o.id)),
        ...related.inboundIds.slice(0, 5).map(opaqueId),
      ].slice(0, 20),
    };
    await this.audit.record({
      action: 'data_subject.previewed',
      result: 'success',
      actorUserId: actor.id,
      actorUsername: actor.username,
      targetType: 'customer',
      targetId: related.customerOpaqueId,
      metadata: { kind: input.kind },
    });
    return preview;
  }

  async executeDataSubject(
    actor: RetentionActor,
    input: {
      kind: 'export' | 'anonymize';
      customerPhone: string;
      currentPassword: string;
      confirmIrreversible: true | false;
    },
  ): Promise<DataSubjectResult> {
    await this.options.confirmPassword(actor, input.currentPassword);
    if (input.confirmIrreversible !== true) {
      throw new RetentionConfirmationRequiredError(
        'confirmIrreversible must be true',
      );
    }
    const related = await this.store.findCustomerRelated(input.customerPhone);

    if (input.kind === 'export') {
      const result: DataSubjectResult = {
        kind: 'export',
        customerOpaqueId: related.customerOpaqueId,
        relatedCounts: {
          customers: related.customerIds.length,
          orders: related.orders.length,
          inbound: related.inboundIds.length,
          conversationMessages: related.conversationMessageIds.length,
          outbound: related.outboundIds.length,
          conversations: related.conversationIds.length,
        },
        exportPayload: {
          orders: related.orders.map((o) => ({
            opaqueId: opaqueId(o.id),
            status: o.status,
            createdAt: o.createdAt.toISOString(),
          })),
          messageCounts: {
            inbound: related.inboundIds.length,
            conversation: related.conversationMessageIds.length,
            outbound: related.outboundIds.length,
          },
        },
      };
      await this.audit.record({
        action: 'data.exported',
        result: 'success',
        actorUserId: actor.id,
        actorUsername: actor.username,
        targetType: 'customer',
        targetId: related.customerOpaqueId,
        metadata: { orderCount: related.orders.length },
      });
      return result;
    }

    const anonymized = await this.store.anonymizeCustomer(input.customerPhone);
    const result: DataSubjectResult = {
      kind: 'anonymize',
      customerOpaqueId: anonymized.customerOpaqueId,
      relatedCounts: anonymized.relatedCounts,
    };
    await this.audit.record({
      action: 'data_subject.anonymized',
      result: 'success',
      actorUserId: actor.id,
      actorUsername: actor.username,
      targetType: 'customer',
      targetId: anonymized.customerOpaqueId,
      metadata: anonymized.relatedCounts,
    });
    return result;
  }

  private async resolvePolicyForRun(
    mode: 'dry_run' | 'execute',
    policyId?: string,
  ): Promise<RetentionPolicyRecord> {
    if (policyId !== undefined) {
      const policy = await this.repository.findPolicyById(policyId);
      if (policy === null) {
        throw new RetentionValidationError('Policy not found');
      }
      if (mode === 'execute' && policy.status !== 'active') {
        throw new RetentionPolicyNotApprovedError();
      }
      return policy;
    }
    const active = await this.repository.findActivePolicy();
    if (active !== null) {
      return active;
    }
    if (mode === 'dry_run') {
      throw new RetentionValidationError(
        'No policy available for dry-run; create a draft first',
      );
    }
    throw new RetentionPolicyNotApprovedError();
  }

  private async processRun(
    run: RetentionRunRecord,
    policy: RetentionPolicyRecord,
  ): Promise<RetentionRunRecord> {
    const startedAt = run.startedAt ?? this.options.now();
    let current = await this.repository.updateRun({
      id: run.id,
      status: 'running',
      startedAt,
      errorMessage: null,
      finishedAt: null,
    });

    const progress: RetentionClassProgress[] =
      current.progress.length > 0
        ? structuredClone(current.progress)
        : policy.classes.map((c) => ({
            dataClass: c.dataClass,
            action: c.action,
            candidateCount: 0,
            processedCount: 0,
            sampleOpaqueIds: [],
          }));

    let classIndex = current.cursor.classIndex;
    let lastId = current.cursor.lastId;

    while (classIndex < policy.classes.length) {
      const classPolicy = policy.classes[classIndex]!;
      const progressRow = progress[classIndex]!;
      const retentionDays = classPolicy.retentionDays ?? 0;
      const cutoff = new Date(
        this.options.now().getTime() - retentionDays * 24 * 60 * 60 * 1000,
      );

      if (classPolicy.action === 'retain') {
        progressRow.candidateCount = 0;
        progressRow.processedCount = 0;
        classIndex += 1;
        lastId = null;
        current = await this.repository.updateRun({
          id: run.id,
          progress,
          cursor: { classIndex, lastId },
        });
        continue;
      }

      const candidates = await this.store.listCandidates(
        classPolicy.dataClass,
        cutoff,
      );
      progressRow.candidateCount = candidates.length;
      if (progressRow.sampleOpaqueIds.length === 0) {
        progressRow.sampleOpaqueIds = candidates
          .slice(0, 10)
          .map((c) => opaqueId(c.id));
      }

      const remaining = candidates.filter((c) => {
        if (lastId === null) {
          return true;
        }
        return c.id > lastId;
      });

      if (current.mode === 'dry_run') {
        progressRow.processedCount = 0;
        classIndex += 1;
        lastId = null;
        current = await this.repository.updateRun({
          id: run.id,
          progress,
          cursor: { classIndex, lastId },
        });
        continue;
      }

      for (let i = 0; i < remaining.length; i += current.batchSize) {
        const batch = remaining.slice(i, i + current.batchSize);
        const ids = batch.map((b) => b.id);
        const applied = await this.store.applyAction(
          classPolicy.dataClass,
          classPolicy.action,
          ids,
        );
        progressRow.processedCount += applied;
        lastId = ids[ids.length - 1] ?? lastId;
        current = await this.repository.updateRun({
          id: run.id,
          progress,
          cursor: { classIndex, lastId },
        });
        if (this.options.onBatchApplied !== undefined) {
          await this.options.onBatchApplied();
        }
      }

      classIndex += 1;
      lastId = null;
      current = await this.repository.updateRun({
        id: run.id,
        progress,
        cursor: { classIndex, lastId },
      });
    }

    const finishedAt = this.options.now();
    const reportBody: Omit<RetentionReport, 'signature'> = {
      runId: run.id,
      policyId: policy.id,
      policyVersion: policy.version,
      mode: current.mode,
      finishedAt: finishedAt.toISOString(),
      classes: progress,
    };
    const signature = signReport(
      reportBody,
      this.options.reportSigningKey ?? 'kairo-retention-report',
    );
    const report: RetentionReport = { ...reportBody, signature };

    return this.repository.updateRun({
      id: run.id,
      status: 'completed',
      progress,
      cursor: { classIndex, lastId },
      report,
      finishedAt,
      errorMessage: null,
    });
  }
}
