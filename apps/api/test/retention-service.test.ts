import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { RetentionClassPolicy } from '@camila/contracts';

import { InMemoryAuditRepository } from '../src/modules/audit/in-memory-audit-repository.js';
import { AuditService } from '../src/modules/audit/audit-service.js';
import {
  PRIVACY_INVENTORY,
  RetentionExecutionDisabledError,
  RetentionPolicyNotApprovedError,
  RetentionService,
  type RetentionDataStore,
  type RetentionRecordSnapshot,
} from '../src/modules/privacy/retention-service.js';
import { InMemoryRetentionRepository } from '../src/modules/privacy/in-memory-retention-repository.js';

const ANON_PHONE = '0000000000';
const ANON_NAME = 'ANONIMIZADO';

function opaqueId(id: string): string {
  return createHash('sha256').update(id).digest('hex').slice(0, 16);
}

function approvedClasses(): RetentionClassPolicy[] {
  return PRIVACY_INVENTORY.map((item) => {
    const action = item.allowedActions.includes('anonymize')
      ? 'anonymize'
      : item.allowedActions.includes('delete')
        ? 'delete'
        : 'retain';
    return {
      dataClass: item.dataClass,
      action: item.dataClass === 'admin_audit_events' ? 'retain' : action,
      retentionDays: 30,
      legalBasis: 'staging-test-basis',
      legalStatus: 'approved' as const,
    };
  });
}

function pendingClasses(): RetentionClassPolicy[] {
  return approvedClasses().map((c) => ({
    ...c,
    retentionDays: null,
    legalStatus: 'pending_human_approval' as const,
    legalBasis: '[HUMANO] Colombia approval pending',
  }));
}

function createStore(seed: RetentionRecordSnapshot[]): RetentionDataStore & {
  dump(): RetentionRecordSnapshot[];
} {
  const records = structuredClone(seed);
  return {
    async listCandidates(dataClass, cutoff) {
      return records.filter(
        (row) =>
          row.dataClass === dataClass &&
          row.createdAt < cutoff &&
          !row.processed,
      );
    },
    async applyAction(dataClass, action, ids) {
      let count = 0;
      for (const row of records) {
        if (row.dataClass !== dataClass || !ids.includes(row.id)) {
          continue;
        }
        if (action === 'retain') {
          continue;
        }
        if (action === 'delete') {
          row.processed = true;
          row.deleted = true;
          count += 1;
          continue;
        }
        row.processed = true;
        row.anonymized = true;
        if (row.customerPhone !== undefined) {
          row.customerPhone = ANON_PHONE;
        }
        if (row.customerName !== undefined) {
          row.customerName = ANON_NAME;
        }
        if (row.textBody !== undefined) {
          row.textBody = null;
        }
        if (row.address !== undefined) {
          row.address = null;
        }
        count += 1;
      }
      return count;
    },
    async findCustomerRelated(customerPhone) {
      const related = records.filter(
        (row) => row.customerPhone === customerPhone && !row.deleted,
      );
      return {
        customerOpaqueId: opaqueId(customerPhone),
        orders: related
          .filter((row) => row.dataClass === 'sales_orders_customer_pii')
          .map((row) => ({
            id: row.id,
            status: row.status ?? 'confirmed',
            createdAt: row.createdAt,
            customerName: row.customerName ?? null,
            customerPhone: row.customerPhone ?? null,
            address: row.address ?? null,
          })),
        inboundIds: related
          .filter((row) => row.dataClass === 'whatsapp_inbound_messages')
          .map((row) => row.id),
        conversationMessageIds: related
          .filter((row) => row.dataClass === 'whatsapp_conversation_messages')
          .map((row) => row.id),
        outboundIds: related
          .filter((row) => row.dataClass === 'whatsapp_outbound_messages')
          .map((row) => row.id),
        conversationIds: related
          .filter((row) => row.dataClass === 'whatsapp_conversations')
          .map((row) => row.id),
      };
    },
    async anonymizeCustomer(customerPhone) {
      const related = await this.findCustomerRelated(customerPhone);
      const orderIds = related.orders.map((o) => o.id);
      await this.applyAction(
        'sales_orders_customer_pii',
        'anonymize',
        orderIds,
      );
      await this.applyAction(
        'whatsapp_inbound_messages',
        'anonymize',
        related.inboundIds,
      );
      await this.applyAction(
        'whatsapp_conversation_messages',
        'anonymize',
        related.conversationMessageIds,
      );
      await this.applyAction(
        'whatsapp_outbound_messages',
        'anonymize',
        related.outboundIds,
      );
      await this.applyAction(
        'whatsapp_conversations',
        'anonymize',
        related.conversationIds,
      );
      return {
        customerOpaqueId: related.customerOpaqueId,
        relatedCounts: {
          orders: orderIds.length,
          inbound: related.inboundIds.length,
          conversationMessages: related.conversationMessageIds.length,
          outbound: related.outboundIds.length,
          conversations: related.conversationIds.length,
        },
      };
    },
    dump() {
      return records;
    },
  };
}

describe('RetentionService', () => {
  const actor = {
    id: '11111111-1111-4111-8111-111111111111',
    username: 'owner',
    role: 'owner' as const,
  };

  it('dry-run returns counts and opaque sample IDs without side effects', async () => {
    const now = new Date('2026-09-22T00:00:00.000Z');
    const old = new Date('2026-01-01T00:00:00.000Z');
    const store = createStore([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        dataClass: 'whatsapp_inbound_messages',
        createdAt: old,
        customerPhone: '573001112233',
        textBody: 'SECRET MESSAGE BODY',
        processed: false,
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        dataClass: 'sales_orders_customer_pii',
        createdAt: old,
        customerPhone: '573001112233',
        customerName: 'Ana Pérez',
        address: 'Calle 1 #2-3',
        status: 'confirmed',
        processed: false,
      },
    ]);
    const repo = new InMemoryRetentionRepository();
    const audit = new AuditService(new InMemoryAuditRepository());
    const service = new RetentionService(repo, store, audit, {
      executionEnabled: false,
      now: () => now,
      confirmPassword: async () => undefined,
    });

    const draft = await service.createDraftPolicy(actor, {
      classes: pendingClasses(),
      currentPassword: 'password1234',
    });

    const run = await service.startRun(actor, {
      mode: 'dry_run',
      currentPassword: 'password1234',
      policyId: draft.id,
    });

    expect(run.status).toBe('completed');
    expect(run.mode).toBe('dry_run');
    const progress = run.progress.find(
      (p) => p.dataClass === 'whatsapp_inbound_messages',
    );
    expect(progress?.candidateCount).toBe(1);
    expect(progress?.sampleOpaqueIds).toHaveLength(1);
    expect(progress?.sampleOpaqueIds[0]).not.toContain('57300');
    const serialized = JSON.stringify(run);
    expect(serialized).not.toContain('SECRET MESSAGE BODY');
    expect(serialized).not.toContain('Ana Pérez');
    expect(serialized).not.toContain('Calle 1');
    expect(serialized).not.toContain('573001112233');

    const dump = store.dump();
    expect(dump.every((row) => row.processed === false)).toBe(true);
    expect(dump[0]?.textBody).toBe('SECRET MESSAGE BODY');
    expect(dump[1]?.customerName).toBe('Ana Pérez');
  });

  it('execution refuses without approved active policy', async () => {
    const store = createStore([]);
    const repo = new InMemoryRetentionRepository();
    const audit = new AuditService(new InMemoryAuditRepository());
    const service = new RetentionService(repo, store, audit, {
      executionEnabled: true,
      now: () => new Date('2026-09-22T00:00:00.000Z'),
      confirmPassword: async () => undefined,
    });

    const draft = await service.createDraftPolicy(actor, {
      classes: pendingClasses(),
      currentPassword: 'password1234',
    });

    await expect(
      service.startRun(actor, {
        mode: 'execute',
        currentPassword: 'password1234',
        confirmIrreversible: true,
        policyId: draft.id,
      }),
    ).rejects.toBeInstanceOf(RetentionPolicyNotApprovedError);
  });

  it('execution refuses when RETENTION_EXECUTION_ENABLED is false', async () => {
    const store = createStore([]);
    const repo = new InMemoryRetentionRepository();
    const audit = new AuditService(new InMemoryAuditRepository());
    const service = new RetentionService(repo, store, audit, {
      executionEnabled: false,
      now: () => new Date('2026-09-22T00:00:00.000Z'),
      confirmPassword: async () => undefined,
    });

    const draft = await service.createDraftPolicy(actor, {
      classes: approvedClasses(),
      currentPassword: 'password1234',
    });
    await service.activatePolicy(actor, draft.id, {
      currentPassword: 'password1234',
      confirmIrreversible: true,
    });

    await expect(
      service.startRun(actor, {
        mode: 'execute',
        currentPassword: 'password1234',
        confirmIrreversible: true,
      }),
    ).rejects.toBeInstanceOf(RetentionExecutionDisabledError);
  });

  it('activates versioned policy with audit and supports resumable execute after crash', async () => {
    const now = new Date('2026-09-22T00:00:00.000Z');
    const old = new Date('2026-01-01T00:00:00.000Z');
    const ids = Array.from(
      { length: 5 },
      (_, i) =>
        `cccccccc-cccc-4ccc-8ccc-cccccccccc${String(i).padStart(2, '0')}`,
    );
    const store = createStore(
      ids.map((id) => ({
        id,
        dataClass: 'owner_alerts_resolved' as const,
        createdAt: old,
        processed: false,
      })),
    );
    const repo = new InMemoryRetentionRepository();
    const auditRepo = new InMemoryAuditRepository();
    const audit = new AuditService(auditRepo);
    let crashAfter = 1;
    const service = new RetentionService(repo, store, audit, {
      executionEnabled: true,
      now: () => now,
      confirmPassword: async () => undefined,
      batchSize: 2,
      onBatchApplied: async () => {
        if (crashAfter <= 0) {
          throw new Error('simulated crash');
        }
        crashAfter -= 1;
      },
    });

    const draft = await service.createDraftPolicy(actor, {
      classes: approvedClasses().map((c) =>
        c.dataClass === 'owner_alerts_resolved'
          ? { ...c, action: 'delete' as const }
          : c,
      ),
      currentPassword: 'password1234',
    });
    const active = await service.activatePolicy(actor, draft.id, {
      currentPassword: 'password1234',
      confirmIrreversible: true,
    });
    expect(active.status).toBe('active');
    expect(active.version).toBe(1);

    const auditEvents = auditRepo.events();
    expect(
      auditEvents.some((e) => e.action === 'retention.policy_activated'),
    ).toBe(true);

    await expect(
      service.startRun(actor, {
        mode: 'execute',
        currentPassword: 'password1234',
        confirmIrreversible: true,
      }),
    ).rejects.toThrow(/simulated crash/);

    const failed = (await service.listRuns())[0]!;
    expect(failed.status).toBe('failed');
    expect(
      failed.progress.find((p) => p.dataClass === 'owner_alerts_resolved')
        ?.processedCount,
    ).toBeGreaterThan(0);

    crashAfter = 100;
    const resumed = await service.resumeRun(actor, failed.id, {
      currentPassword: 'password1234',
    });
    expect(resumed.status).toBe('completed');
    expect(resumed.report?.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(
      store.dump().filter((r) => r.dataClass === 'owner_alerts_resolved'),
    ).toEqual(
      expect.arrayContaining(
        ids.map((id) =>
          expect.objectContaining({ id, deleted: true, processed: true }),
        ),
      ),
    );
  });

  it('anonymizes retained orders without deleting related integrity rows', async () => {
    const old = new Date('2026-01-01T00:00:00.000Z');
    const store = createStore([
      {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        dataClass: 'sales_orders_customer_pii',
        createdAt: old,
        customerPhone: '573009998877',
        customerName: 'Cliente',
        address: 'Dirección',
        status: 'delivered',
        processed: false,
      },
    ]);
    const repo = new InMemoryRetentionRepository();
    const audit = new AuditService(new InMemoryAuditRepository());
    const service = new RetentionService(repo, store, audit, {
      executionEnabled: true,
      now: () => new Date('2026-09-22T00:00:00.000Z'),
      confirmPassword: async () => undefined,
    });

    const draft = await service.createDraftPolicy(actor, {
      classes: approvedClasses().map((c) =>
        c.dataClass === 'sales_orders_customer_pii'
          ? { ...c, action: 'anonymize' as const }
          : c,
      ),
      currentPassword: 'x',
    });
    await service.activatePolicy(actor, draft.id, {
      currentPassword: 'x',
      confirmIrreversible: true,
    });
    const run = await service.startRun(actor, {
      mode: 'execute',
      currentPassword: 'x',
      confirmIrreversible: true,
    });
    expect(run.status).toBe('completed');
    const order = store.dump()[0]!;
    expect(order.deleted).toBeUndefined();
    expect(order.anonymized).toBe(true);
    expect(order.customerName).toBe(ANON_NAME);
    expect(order.customerPhone).toBe(ANON_PHONE);
    expect(order.address).toBeNull();
  });

  it('customer export/anonymize stays scoped and requires irreversible confirm', async () => {
    const store = createStore([
      {
        id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        dataClass: 'sales_orders_customer_pii',
        createdAt: new Date(),
        customerPhone: '573001111111',
        customerName: 'Target',
        status: 'confirmed',
        processed: false,
      },
      {
        id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        dataClass: 'sales_orders_customer_pii',
        createdAt: new Date(),
        customerPhone: '573002222222',
        customerName: 'Other',
        status: 'confirmed',
        processed: false,
      },
    ]);
    const repo = new InMemoryRetentionRepository();
    const auditRepo = new InMemoryAuditRepository();
    const service = new RetentionService(
      repo,
      store,
      new AuditService(auditRepo),
      {
        executionEnabled: false,
        now: () => new Date(),
        confirmPassword: async () => undefined,
      },
    );

    const preview = await service.previewDataSubject(actor, {
      kind: 'anonymize',
      customerPhone: '573001111111',
      currentPassword: 'x',
    });
    expect(preview.relatedCounts.orders).toBe(1);
    expect(JSON.stringify(preview)).not.toContain('573001111111');
    expect(JSON.stringify(preview)).not.toContain('Target');

    await expect(
      service.executeDataSubject(actor, {
        kind: 'anonymize',
        customerPhone: '573001111111',
        currentPassword: 'x',
        confirmIrreversible: false as unknown as true,
      }),
    ).rejects.toThrow(/confirmIrreversible/);

    const result = await service.executeDataSubject(actor, {
      kind: 'anonymize',
      customerPhone: '573001111111',
      currentPassword: 'x',
      confirmIrreversible: true,
    });
    expect(result.relatedCounts.orders).toBe(1);
    const dump = store.dump();
    expect(dump.find((r) => r.id.startsWith('eeee'))?.customerName).toBe(
      ANON_NAME,
    );
    expect(dump.find((r) => r.id.startsWith('ffff'))?.customerName).toBe(
      'Other',
    );
    expect(
      auditRepo
        .events()
        .some(
          (e) =>
            e.action === 'data.exported' ||
            e.action === 'data_subject.anonymized',
        ),
    ).toBe(true);
  });

  it('rejects delete action on sales_orders_customer_pii (must anonymize)', async () => {
    const repo = new InMemoryRetentionRepository();
    const store = createStore([]);
    const service = new RetentionService(
      repo,
      store,
      new AuditService(new InMemoryAuditRepository()),
      {
        executionEnabled: false,
        now: () => new Date(),
        confirmPassword: async () => undefined,
      },
    );

    await expect(
      service.createDraftPolicy(actor, {
        classes: approvedClasses().map((c) =>
          c.dataClass === 'sales_orders_customer_pii'
            ? { ...c, action: 'delete' as const }
            : c,
        ),
        currentPassword: 'x',
      }),
    ).rejects.toThrow(/anonymize|retain|allowed/i);
  });
});
