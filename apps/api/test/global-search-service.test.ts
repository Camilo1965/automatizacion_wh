import { describe, expect, it } from 'vitest';

import type { PostgresDatabase } from '../src/database/client.js';
import { GlobalSearchService } from '../src/modules/search/global-search-service.js';

function fakeDatabase(resultSets: unknown[][], limits: number[]) {
  let queryIndex = 0;
  const orm = {
    select() {
      const rows = resultSets[queryIndex++] ?? [];
      const chain = {
        from() {
          return chain;
        },
        where() {
          return chain;
        },
        orderBy() {
          return chain;
        },
        limit(limit: number) {
          limits.push(limit);
          return Promise.resolve(rows);
        },
      };
      return chain;
    },
  };
  return { orm } as unknown as PostgresDatabase;
}

describe('GlobalSearchService', () => {
  it('returns no results for a trimmed query shorter than two characters', async () => {
    const service = new GlobalSearchService(fakeDatabase([], []));

    await expect(service.search({ q: ' a ', limit: 10 })).resolves.toEqual([]);
  });

  it('maps every result kind, applies per-kind limits, and uses safe order labels', async () => {
    const limits: number[] = [];
    const service = new GlobalSearchService(
      fakeDatabase(
        [
          [
            {
              id: 'order-name',
              orderNumber: 1,
              customerName: 'Ana',
              customerPhone: '+573001111111',
            },
            {
              id: 'order-phone',
              orderNumber: 2,
              customerName: null,
              customerPhone: '+573002222222',
            },
            {
              id: 'order-fallback',
              orderNumber: 3,
              customerName: null,
              customerPhone: null,
            },
          ],
          [{ id: 'conversation-1', customerPhone: '+573003333333' }],
          [
            {
              id: 'reference-1',
              code: '01',
              modelName: 'Modelo',
              color: 'Negro',
            },
          ],
        ],
        limits,
      ),
    );

    const hits = await service.search({ q: String.raw`a%_\b`, limit: 7 });

    expect(limits).toEqual([3, 3, 3]);
    expect(hits).toEqual([
      {
        kind: 'order',
        id: 'order-name',
        label: '1 · Ana',
        href: '/orders/order-name',
      },
      {
        kind: 'order',
        id: 'order-phone',
        label: '2 · +573002222222',
        href: '/orders/order-phone',
      },
      {
        kind: 'order',
        id: 'order-fallback',
        label: '3 · Cliente',
        href: '/orders/order-fallback',
      },
      {
        kind: 'conversation',
        id: 'conversation-1',
        label: '+573003333333',
        href: '/conversations?conversation=conversation-1',
      },
      {
        kind: 'reference',
        id: 'reference-1',
        label: '01 · Modelo · Negro',
        href: '/references/reference-1',
      },
    ]);
  });

  it('keeps the per-kind query limit positive when the total limit is zero', async () => {
    const limits: number[] = [];
    const service = new GlobalSearchService(fakeDatabase([[], [], []], limits));

    await expect(service.search({ q: 'valid', limit: 0 })).resolves.toEqual([]);
    expect(limits).toEqual([1, 1, 1]);
  });
});
