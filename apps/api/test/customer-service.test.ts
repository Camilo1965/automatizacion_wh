import { describe, expect, it, vi } from 'vitest';

import { CustomerService } from '../src/modules/customers/customer-service.js';
import type { CustomerRepository } from '../src/modules/customers/postgres-customer-repository.js';

const customerId = '11111111-1111-4111-8111-111111111111';

describe('customer service', () => {
  it('round trips a microsecond cursor without losing its ordering precision', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          {
            id: customerId,
            displayName: 'Ana',
            normalizedPhone: '+573001111111',
            segment: 'buyer',
            marketingConsent: 'unknown',
            lastActivityAt: new Date('2026-09-22T12:00:00Z'),
            createdAt: new Date('2026-09-20T10:00:00Z'),
          },
        ],
        nextCursor: {
          createdAt: '2026-09-20T10:00:00.123456Z',
          id: customerId,
        },
      })
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    const service = new CustomerService({
      list,
      get: vi.fn(),
      reconciliation: vi.fn(),
    } as unknown as CustomerRepository);
    const first = await service.list({ limit: 1 });
    expect(first.nextCursor).toEqual(expect.any(String));
    await service.list({ limit: 1, cursor: first.nextCursor! });
    expect(list).toHaveBeenLastCalledWith({
      limit: 1,
      after: { createdAt: '2026-09-20T10:00:00.123456Z', id: customerId },
    });
  });

  it('rejects a malformed cursor before querying records', async () => {
    const list = vi.fn();
    const service = new CustomerService({
      list,
      get: vi.fn(),
      reconciliation: vi.fn(),
    } as unknown as CustomerRepository);
    await expect(
      service.list({ limit: 10, cursor: 'not-a-cursor' }),
    ).rejects.toThrow();
    expect(list).not.toHaveBeenCalled();
  });
});
