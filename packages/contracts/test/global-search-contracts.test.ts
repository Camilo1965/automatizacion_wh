import { describe, expect, it } from 'vitest';

import {
  GlobalSearchQuerySchema,
  GlobalSearchResponseSchema,
} from '../src/index.js';

describe('global search contracts', () => {
  it('requires at least two characters and caps limit', () => {
    expect(GlobalSearchQuerySchema.parse({ q: '37' })).toEqual({
      q: '37',
      limit: 12,
    });
    expect(GlobalSearchQuerySchema.safeParse({ q: 'a' }).success).toBe(false);
    expect(
      GlobalSearchQuerySchema.parse({ q: 'ped', limit: '8' }),
    ).toMatchObject({ q: 'ped', limit: 8 });
  });

  it('accepts mixed search hits', () => {
    const parsed = GlobalSearchResponseSchema.parse({
      data: {
        items: [
          {
            kind: 'order',
            id: '11111111-1111-4111-8111-111111111111',
            label: '12 · Camila',
            href: '/orders/11111111-1111-4111-8111-111111111111',
          },
          {
            kind: 'conversation',
            id: '22222222-2222-4222-8222-222222222222',
            label: '+573001112233',
            href: '/conversations?conversation=22222222-2222-4222-8222-222222222222',
          },
          {
            kind: 'reference',
            id: '33333333-3333-4333-8333-333333333333',
            label: '01 · Tenis · Negro',
            href: '/references/33333333-3333-4333-8333-333333333333',
          },
        ],
      },
    });
    expect(parsed.data.items).toHaveLength(3);
  });
});
