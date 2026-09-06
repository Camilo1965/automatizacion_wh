import { describe, expect, it } from 'vitest';

import {
  AdminUserPublicSchema,
  ApiErrorSchema,
  CreateReferenceBodySchema,
  decodeMovementCursor,
  encodeMovementCursor,
  ListMovementsQuerySchema,
  ListReferencesQuerySchema,
  LoginBodySchema,
  PatchReferenceBodySchema,
  PhotoPublicSchema,
  SetStockBodySchema,
} from '../src/index.js';

describe('ApiErrorSchema', () => {
  it('accepts code, message, and optional field', () => {
    expect(
      ApiErrorSchema.parse({
        error: {
          code: 'invalid_credentials',
          message: 'Credenciales inválidas',
        },
      }),
    ).toEqual({
      error: { code: 'invalid_credentials', message: 'Credenciales inválidas' },
    });

    expect(
      ApiErrorSchema.parse({
        error: {
          code: 'invalid_field',
          message: 'Campo inválido',
          field: 'priceCop',
        },
      }),
    ).toEqual({
      error: {
        code: 'invalid_field',
        message: 'Campo inválido',
        field: 'priceCop',
      },
    });
  });

  it('rejects missing error payload', () => {
    expect(ApiErrorSchema.safeParse({}).success).toBe(false);
  });
});

describe('AdminUserPublicSchema', () => {
  it('accepts public admin user shape', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(AdminUserPublicSchema.parse({ id, username: 'camila' })).toEqual({
      id,
      username: 'camila',
    });
  });

  it('rejects invalid uuid', () => {
    expect(
      AdminUserPublicSchema.safeParse({ id: 'nope', username: 'camila' })
        .success,
    ).toBe(false);
  });
});

describe('LoginBodySchema', () => {
  it('accepts username and password', () => {
    expect(
      LoginBodySchema.parse({ username: 'camila', password: 'secret-secret' }),
    ).toEqual({ username: 'camila', password: 'secret-secret' });
  });

  it('rejects unknown fields', () => {
    expect(
      LoginBodySchema.safeParse({
        username: 'camila',
        password: 'secret-secret',
        extra: true,
      }).success,
    ).toBe(false);
  });
});

describe('CreateReferenceBodySchema', () => {
  it('accepts valid create body', () => {
    expect(
      CreateReferenceBodySchema.parse({
        code: '01',
        modelName: 'Modelo',
        color: 'Negro',
        priceCop: 150000,
      }),
    ).toEqual({
      code: '01',
      modelName: 'Modelo',
      color: 'Negro',
      priceCop: 150000,
    });
  });

  it('rejects NaN, infinity, zero price, and unknown fields', () => {
    expect(
      CreateReferenceBodySchema.safeParse({
        code: '01',
        modelName: 'Modelo',
        color: 'Negro',
        priceCop: Number.NaN,
      }).success,
    ).toBe(false);
    expect(
      CreateReferenceBodySchema.safeParse({
        code: '01',
        modelName: 'Modelo',
        color: 'Negro',
        priceCop: Number.POSITIVE_INFINITY,
      }).success,
    ).toBe(false);
    expect(
      CreateReferenceBodySchema.safeParse({
        code: '01',
        modelName: 'Modelo',
        color: 'Negro',
        priceCop: 0,
      }).success,
    ).toBe(false);
    expect(
      CreateReferenceBodySchema.safeParse({
        code: '01',
        modelName: 'Modelo',
        color: 'Negro',
        priceCop: 150000,
        active: true,
      }).success,
    ).toBe(false);
  });

  it('trims modelName and color and enforces inclusive length bounds', () => {
    expect(
      CreateReferenceBodySchema.parse({
        code: '01',
        modelName: ' A ',
        color: ' B ',
        priceCop: 1,
      }),
    ).toEqual({
      code: '01',
      modelName: 'A',
      color: 'B',
      priceCop: 1,
    });

    expect(
      CreateReferenceBodySchema.safeParse({
        code: '01',
        modelName: ' ',
        color: 'Negro',
        priceCop: 1,
      }).success,
    ).toBe(false);

    expect(
      CreateReferenceBodySchema.safeParse({
        code: '01',
        modelName: 'x'.repeat(121),
        color: 'Negro',
        priceCop: 1,
      }).success,
    ).toBe(false);

    expect(
      CreateReferenceBodySchema.safeParse({
        code: '01',
        modelName: 'Modelo',
        color: 'x'.repeat(81),
        priceCop: 1,
      }).success,
    ).toBe(false);

    expect(
      CreateReferenceBodySchema.parse({
        code: '01',
        modelName: 'x'.repeat(120),
        color: 'x'.repeat(80),
        priceCop: 2_000_000_000,
      }).priceCop,
    ).toBe(2_000_000_000);
  });
});

describe('PatchReferenceBodySchema', () => {
  it('accepts partial updates', () => {
    expect(PatchReferenceBodySchema.parse({ modelName: 'Nuevo' })).toEqual({
      modelName: 'Nuevo',
    });
    expect(PatchReferenceBodySchema.parse({ color: 'Rojo' })).toEqual({
      color: 'Rojo',
    });
    expect(PatchReferenceBodySchema.parse({ priceCop: 200000 })).toEqual({
      priceCop: 200000,
    });
  });

  it('rejects empty patch and unknown fields', () => {
    expect(PatchReferenceBodySchema.safeParse({}).success).toBe(false);
    expect(PatchReferenceBodySchema.safeParse({ code: '01' }).success).toBe(
      false,
    );
  });
});

describe('SetStockBodySchema', () => {
  it('accepts physicalQuantity and required note', () => {
    expect(
      SetStockBodySchema.parse({
        physicalQuantity: 8,
        note: 'Conteo físico de cierre',
      }),
    ).toEqual({
      physicalQuantity: 8,
      note: 'Conteo físico de cierre',
    });
  });

  it('trims note and rejects short, long, and unknown fields', () => {
    expect(
      SetStockBodySchema.parse({
        physicalQuantity: 0,
        note: '  abc  ',
      }),
    ).toEqual({ physicalQuantity: 0, note: 'abc' });

    expect(
      SetStockBodySchema.safeParse({
        physicalQuantity: 1,
        note: 'ab',
      }).success,
    ).toBe(false);

    expect(
      SetStockBodySchema.safeParse({
        physicalQuantity: 1,
        note: 'x'.repeat(251),
      }).success,
    ).toBe(false);

    expect(
      SetStockBodySchema.safeParse({
        physicalQuantity: 1,
        note: 'motivo válido',
        reason: 'manual_adjustment',
      }).success,
    ).toBe(false);

    expect(
      SetStockBodySchema.safeParse({
        physicalQuantity: Number.NaN,
        note: 'motivo válido',
      }).success,
    ).toBe(false);
  });
});

describe('ListReferencesQuerySchema', () => {
  it('applies defaults and inclusive limits', () => {
    expect(ListReferencesQuerySchema.parse({})).toEqual({
      status: 'active',
      limit: 25,
    });

    expect(
      ListReferencesQuerySchema.parse({
        query: '  modelo  ',
        status: 'all',
        afterCode: '01',
        limit: '100',
      }),
    ).toEqual({
      query: 'modelo',
      status: 'all',
      afterCode: '01',
      limit: 100,
    });
  });

  it('rejects exclusive bounds', () => {
    expect(
      ListReferencesQuerySchema.safeParse({ query: 'x'.repeat(101) }).success,
    ).toBe(false);
    expect(ListReferencesQuerySchema.safeParse({ limit: 101 }).success).toBe(
      false,
    );
    expect(ListReferencesQuerySchema.safeParse({ limit: 0 }).success).toBe(
      false,
    );
    expect(
      ListReferencesQuerySchema.safeParse({ status: 'maybe' }).success,
    ).toBe(false);
  });
});

describe('ListMovementsQuerySchema', () => {
  it('applies defaults', () => {
    expect(ListMovementsQuerySchema.parse({})).toEqual({ limit: 50 });
  });

  it('accepts size, cursor, and max limit', () => {
    expect(
      ListMovementsQuerySchema.parse({
        size: '37.5',
        cursor: 'abc',
        limit: '100',
      }),
    ).toEqual({
      size: '37.5',
      cursor: 'abc',
      limit: 100,
    });
  });
});

describe('movement cursor encode/decode', () => {
  it('round-trips createdAt and id', () => {
    const createdAt = new Date('2026-09-06T15:00:00.000Z');
    const id = '22222222-2222-4222-8222-222222222222';
    const cursor = encodeMovementCursor({ createdAt, id });
    expect(decodeMovementCursor(cursor)).toEqual({ createdAt, id });
  });

  it('rejects malformed cursors', () => {
    expect(() => decodeMovementCursor('')).toThrow();
    expect(() => decodeMovementCursor('%%%')).toThrow();
    expect(() => decodeMovementCursor('not-a-cursor')).toThrow();
  });
});

describe('PhotoPublicSchema', () => {
  it('accepts public photo DTO without storageKey', () => {
    expect(
      PhotoPublicSchema.parse({
        url: '/api/admin/references/11111111-1111-4111-8111-111111111111/photo',
        mimeType: 'image/jpeg',
        byteSize: 12345,
        etag: '"sha256abc"',
      }),
    ).toEqual({
      url: '/api/admin/references/11111111-1111-4111-8111-111111111111/photo',
      mimeType: 'image/jpeg',
      byteSize: 12345,
      etag: '"sha256abc"',
    });
  });

  it('rejects storageKey and invalid mime', () => {
    expect(
      PhotoPublicSchema.safeParse({
        url: '/photo',
        mimeType: 'image/gif',
        byteSize: 1,
        etag: '"x"',
        storageKey: 'secret',
      }).success,
    ).toBe(false);
  });
});
