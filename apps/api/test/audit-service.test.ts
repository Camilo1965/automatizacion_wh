import { describe, expect, it } from 'vitest';

import {
  sanitizeAuditMetadata,
  type AuditAction,
} from '../src/modules/audit/audit-event.js';
import { AuditService } from '../src/modules/audit/audit-service.js';
import { InMemoryAuditRepository } from '../src/modules/audit/in-memory-audit-repository.js';
import type { AuditRepository } from '../src/modules/audit/audit-repository.js';

const SENSITIVE_ACTIONS: AuditAction[] = [
  'login.succeeded',
  'login.failed',
  'mfa.verify_succeeded',
  'mfa.verify_failed',
  'mfa.enabled',
  'mfa.disabled',
  'session.revoked',
  'session.revoked_others',
  'role.changed',
  'user.created',
  'user.deactivated',
  'integration.activated',
  'integration.updated',
  'bot_flow.published',
  'locality_catalog.published',
  'shipping_policy.updated',
  'inventory.adjusted',
  'inventory.closure_generated',
  'inventory.closure_acknowledged',
  'order.transitioned',
  'data.exported',
  'retention.executed',
  'retention.simulated',
];

describe('sanitizeAuditMetadata', () => {
  it('strips passwords tokens totp secrets addresses and message bodies', () => {
    const cleaned = sanitizeAuditMetadata({
      reason: 'bad_password',
      password: 'super-secret',
      currentPassword: 'also-secret',
      accessToken: 'tok',
      totpSecret: 'BASE32',
      recoveryCode: 'abc',
      code: '123456',
      address: 'Calle 1',
      message: 'hola',
      body: 'full body',
      document: 'pdf-bytes',
      provider: 'whatsapp',
      revision: 3,
    });
    expect(cleaned).toEqual({
      reason: 'bad_password',
      provider: 'whatsapp',
      revision: 3,
    });
  });
});

describe('AuditService', () => {
  it('records every sensitive action type without leaking secrets', async () => {
    const repo = new InMemoryAuditRepository();
    const service = new AuditService(repo);

    for (const action of SENSITIVE_ACTIONS) {
      await service.record({
        action,
        result: action.endsWith('.failed') ? 'failure' : 'success',
        actorUserId: '00000000-0000-4000-8000-000000000001',
        actorUsername: 'owner',
        targetType: 'test',
        targetId: 't-1',
        correlationId: 'corr-1',
        metadata: {
          password: 'leak-me',
          note: 'ok',
        },
      });
    }

    const listed = await service.list({ limit: 100 });
    expect(listed.total).toBe(SENSITIVE_ACTIONS.length);
    for (const item of listed.items) {
      expect(item.metadata).not.toHaveProperty('password');
      expect(item.metadata.note).toBe('ok');
      expect(item.createdAt).toBeInstanceOf(Date);
    }
  });

  it('filters and paginates append-only history', async () => {
    const repo = new InMemoryAuditRepository();
    const service = new AuditService(repo);
    await service.record({
      action: 'login.succeeded',
      result: 'success',
      actorUserId: 'u1',
      actorUsername: 'a',
    });
    await service.record({
      action: 'login.failed',
      result: 'failure',
      actorUsername: 'b',
    });
    await service.record({
      action: 'order.transitioned',
      result: 'success',
      actorUserId: 'u1',
      actorUsername: 'a',
      targetType: 'order',
      targetId: 'o1',
      metadata: { transition: 'dispatch' },
    });

    const failed = await service.list({ action: 'login.failed' });
    expect(failed.total).toBe(1);
    expect(failed.items[0]?.result).toBe('failure');

    const page = await service.list({ limit: 1, offset: 0 });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(3);

    const byTarget = await service.list({
      targetType: 'order',
      targetId: 'o1',
    });
    expect(byTarget.total).toBe(1);
    expect(byTarget.items[0]?.action).toBe('order.transitioned');
  });

  it('exposes AuthAuditSink that persists auth events', async () => {
    const repo = new InMemoryAuditRepository();
    const service = new AuditService(repo);
    const sink = service.asAuthAuditSink();
    await sink.record({
      action: 'mfa.verify_failed',
      result: 'failure',
      actorUsername: 'owner',
      metadata: { reason: 'invalid_code', code: '999999' },
      at: new Date('2026-09-22T00:00:00.000Z'),
    });
    const listed = await service.list({ action: 'mfa.verify_failed' });
    expect(listed.total).toBe(1);
    expect(listed.items[0]?.metadata).toEqual({ reason: 'invalid_code' });
  });

  it('repository interface has no update or delete methods', () => {
    const keys = Object.getOwnPropertyNames(
      InMemoryAuditRepository.prototype,
    ).filter((name) => name !== 'constructor');
    expect(keys).not.toContain('update');
    expect(keys).not.toContain('delete');
    expect(keys).not.toContain('remove');
    const sample: AuditRepository = new InMemoryAuditRepository();
    expect(typeof sample.append).toBe('function');
    expect(typeof sample.list).toBe('function');
    expect(
      'update' in sample || 'delete' in sample || 'remove' in sample,
    ).toBe(false);
  });
});
