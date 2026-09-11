import { describe, expect, it } from 'vitest';

import {
  AdminUserPublicSchema,
  ApiErrorSchema,
  CreateReferenceBodySchema,
  dataEnvelopeSchema,
  decodeMovementCursor,
  encodeMovementCursor,
  InventoryMovementPublicSchema,
  ListMovementsQuerySchema,
  ListMovementsResponseSchema,
  ListMovementsResultSchema,
  ListReferencesQuerySchema,
  ListReferencesResponseSchema,
  ListReferencesResultSchema,
  LoginBodySchema,
  LoginResponseSchema,
  PatchReferenceBodySchema,
  PhotoPublicSchema,
  PhotoUploadResponseSchema,
  PhotoUploadWarningSchema,
  ReferenceDetailResponseSchema,
  ReferenceDetailSchema,
  ReferencePublicResponseSchema,
  ReferencePublicSchema,
  ReferenceSummarySchema,
  SessionResponseSchema,
  SetStockBodySchema,
  ShoeSizeStringSchema,
  StockAvailabilitySchema,
  StockResponseSchema,
  StockSetResultSchema,
  CatalogImportResponseSchema,
  CatalogReadinessResponseSchema,
  LocalitiesResponseSchema,
  CreateOrderBodySchema,
  PatchOrderBodySchema,
  OrderSummarySnapshotSchema,
  ConfirmOrderBodySchema,
  OrderPublicSchema,
  OrderSummaryPublicSchema,
  ShippingPolicySchema,
  ShippingRuleBodySchema,
  ShippingRulePublicSchema,
  ShippingPreferencesResponseSchema,
} from '../src/index.js';

const SAMPLE_UUID = '22222222-2222-4222-8222-222222222222';
const SAMPLE_ISO = '2026-09-06T12:00:00.000Z';

const SAMPLE_ETAG = `"${'a'.repeat(64)}"`;

const sampleOrderSnapshot = {
  schemaVersion: 1,
  version: 1,
  draftVersion: 1,
  orderNumber: 'PED-000001',
  reference: {
    id: SAMPLE_UUID,
    code: '01',
    modelName: 'Ballerina',
    color: 'Negro',
  },
  size: '37',
  quantity: 1,
  unitPriceCop: 120_000,
  productSubtotalCop: 120_000,
  shippingCostCop: null,
  shippingPending: true,
  totalCop: 120_000,
  customer: { name: 'Camila', phone: '+573001234567' },
  destination: {
    address: 'Calle 1 # 2-3',
    localityCarrierCode: '11001',
    department: 'Bogotá',
    locality: 'Bogotá',
    deliveryNotes: null,
  },
};

const samplePhoto = {
  url: '/api/admin/references/22222222-2222-4222-8222-222222222222/photo',
  mimeType: 'image/jpeg' as const,
  byteSize: 12345,
  etag: SAMPLE_ETAG,
};

const sampleReferencePublic = {
  id: SAMPLE_UUID,
  code: '01',
  modelName: 'Ballerina',
  color: 'Negro',
  priceCop: 120_000,
  active: true,
  photo: null as null | typeof samplePhoto,
  createdAt: '2026-09-01T12:00:00.000Z',
  updatedAt: SAMPLE_ISO,
};

const sampleStock = {
  size: '37',
  physicalQuantity: 3,
  reservedQuantity: 0,
  availableQuantity: 3,
  updatedAt: SAMPLE_ISO,
};

const sampleMovement = {
  id: '33333333-3333-4333-8333-333333333333',
  size: '37',
  previousQuantity: 3,
  newQuantity: 5,
  delta: 2,
  reason: 'manual_adjustment',
  note: 'Ajuste de conteo',
  createdAt: '2026-09-06T13:00:00.000Z',
};

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

describe('phase two completion contracts', () => {
  it('validates import, readiness, and locality envelopes', () => {
    expect(CatalogImportResponseSchema.safeParse({ data: {} }).success).toBe(
      false,
    );
    expect(CatalogReadinessResponseSchema.safeParse({ data: {} }).success).toBe(
      false,
    );
    expect(
      LocalitiesResponseSchema.safeParse({
        data: { items: [], nextAfterCode: null },
      }).success,
    ).toBe(true);
  });
});

describe('order contracts', () => {
  const orderDraft = {
    referenceId: SAMPLE_UUID,
    size: '37.5',
    quantity: 2,
  };

  it('accepts a one-variant draft and rejects invalid quantities', () => {
    expect(CreateOrderBodySchema.safeParse(orderDraft).success).toBe(true);
    expect(
      CreateOrderBodySchema.safeParse({ ...orderDraft, quantity: 0 }).success,
    ).toBe(false);
    expect(
      CreateOrderBodySchema.safeParse({ ...orderDraft, quantity: 10.5 })
        .success,
    ).toBe(false);
  });

  it('allows partial draft edits but rejects an empty patch', () => {
    expect(
      PatchOrderBodySchema.safeParse({ customerPhone: '3001234567' }).success,
    ).toBe(true);
    expect(PatchOrderBodySchema.safeParse({ quantity: 2 }).success).toBe(false);
    expect(PatchOrderBodySchema.safeParse({}).success).toBe(false);
  });

  it('requires a stable confirmation key and consistent summary totals', () => {
    expect(
      ConfirmOrderBodySchema.safeParse({
        summaryVersion: 1,
        idempotencyKey: 'confirm-0001',
      }).success,
    ).toBe(true);
    expect(
      ConfirmOrderBodySchema.safeParse({
        summaryVersion: 1,
        idempotencyKey: 'short',
      }).success,
    ).toBe(false);
    expect(
      OrderSummarySnapshotSchema.safeParse({
        schemaVersion: 1,
        version: 1,
        draftVersion: 1,
        orderNumber: 'PED-000001',
        reference: {
          id: SAMPLE_UUID,
          code: '01',
          modelName: 'Roma',
          color: 'Negro',
        },
        size: '37',
        quantity: 2,
        unitPriceCop: 120000,
        productSubtotalCop: 240000,
        shippingCostCop: null,
        shippingPending: true,
        totalCop: 240000,
        customer: { name: 'Cliente Prueba', phone: '+573001234567' },
        destination: {
          address: 'Calle 10 # 20-30',
          localityCarrierCode: '05001',
          department: 'Antioquia',
          locality: 'Medellín',
          deliveryNotes: null,
        },
      }).success,
    ).toBe(true);
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
        etag: SAMPLE_ETAG,
      }),
    ).toEqual({
      url: '/api/admin/references/11111111-1111-4111-8111-111111111111/photo',
      mimeType: 'image/jpeg',
      byteSize: 12345,
      etag: SAMPLE_ETAG,
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

describe('dataEnvelopeSchema', () => {
  it('wraps an inner schema as { data } and rejects unknown fields', () => {
    const schema = dataEnvelopeSchema(AdminUserPublicSchema);
    const user = {
      id: '11111111-1111-4111-8111-111111111111',
      username: 'camila',
    };
    expect(schema.parse({ data: user })).toEqual({ data: user });
    expect(schema.safeParse({ data: user, extra: true }).success).toBe(false);
  });
});

describe('SessionResponseSchema and LoginResponseSchema', () => {
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    username: 'camila',
  };
  const valid = { data: { user } };

  it('accepts session and login envelopes', () => {
    expect(SessionResponseSchema.parse(valid)).toEqual(valid);
    expect(LoginResponseSchema.parse(valid)).toEqual(valid);
  });

  it('rejects unknown fields and invalid nested uuid', () => {
    expect(
      SessionResponseSchema.safeParse({
        data: { user },
        meta: true,
      }).success,
    ).toBe(false);
    expect(
      LoginResponseSchema.safeParse({
        data: { user: { id: 'nope', username: 'camila' } },
      }).success,
    ).toBe(false);
  });
});

describe('ReferencePublicSchema', () => {
  it('accepts a public reference with null or photo', () => {
    expect(ReferencePublicSchema.parse(sampleReferencePublic)).toEqual(
      sampleReferencePublic,
    );
    expect(
      ReferencePublicSchema.parse({
        ...sampleReferencePublic,
        photo: samplePhoto,
      }),
    ).toMatchObject({ photo: samplePhoto });
  });

  it('rejects unknown fields, invalid uuid, and invalid ISO dates', () => {
    expect(
      ReferencePublicSchema.safeParse({
        ...sampleReferencePublic,
        stock: [],
      }).success,
    ).toBe(false);
    expect(
      ReferencePublicSchema.safeParse({
        ...sampleReferencePublic,
        id: 'not-a-uuid',
      }).success,
    ).toBe(false);
    expect(
      ReferencePublicSchema.safeParse({
        ...sampleReferencePublic,
        createdAt: '2026-09-01',
      }).success,
    ).toBe(false);
    expect(
      ReferencePublicSchema.safeParse({
        ...sampleReferencePublic,
        updatedAt: 'yesterday',
      }).success,
    ).toBe(false);
  });
});

describe('ReferenceSummarySchema', () => {
  const summary = {
    id: SAMPLE_UUID,
    code: '01',
    modelName: 'Ballerina',
    color: 'Negro',
    priceCop: 120_000,
    active: true,
    photo: null,
    availableSizes: ['37', '38'],
    updatedAt: SAMPLE_ISO,
  };

  it('accepts a list summary row', () => {
    expect(ReferenceSummarySchema.parse(summary)).toEqual(summary);
    expect(
      ReferenceSummarySchema.parse({ ...summary, photo: samplePhoto }),
    ).toMatchObject({ photo: samplePhoto });
  });

  it('rejects unknown fields and invalid dates', () => {
    expect(
      ReferenceSummarySchema.safeParse({
        ...summary,
        createdAt: SAMPLE_ISO,
      }).success,
    ).toBe(false);
    expect(
      ReferenceSummarySchema.safeParse({
        ...summary,
        updatedAt: 'not-iso',
      }).success,
    ).toBe(false);
  });
});

describe('StockAvailabilitySchema and StockSetResultSchema', () => {
  it('accepts stock rows and set-stock results', () => {
    expect(StockAvailabilitySchema.parse(sampleStock)).toEqual(sampleStock);
    expect(
      StockSetResultSchema.parse({
        ...sampleStock,
        referenceId: SAMPLE_UUID,
      }),
    ).toEqual({ ...sampleStock, referenceId: SAMPLE_UUID });
  });

  it('rejects unknown fields, NaN/infinity quantities, and invalid dates', () => {
    expect(
      StockAvailabilitySchema.safeParse({
        ...sampleStock,
        extra: 1,
      }).success,
    ).toBe(false);
    expect(
      StockAvailabilitySchema.safeParse({
        ...sampleStock,
        physicalQuantity: Number.NaN,
      }).success,
    ).toBe(false);
    expect(
      StockAvailabilitySchema.safeParse({
        ...sampleStock,
        reservedQuantity: Number.POSITIVE_INFINITY,
      }).success,
    ).toBe(false);
    expect(
      StockAvailabilitySchema.safeParse({
        ...sampleStock,
        availableQuantity: Number.NaN,
      }).success,
    ).toBe(false);
    expect(
      StockAvailabilitySchema.safeParse({
        ...sampleStock,
        updatedAt: '2026-09-06',
      }).success,
    ).toBe(false);
    expect(
      StockSetResultSchema.safeParse({
        ...sampleStock,
        referenceId: 'bad',
      }).success,
    ).toBe(false);
  });
});

describe('ReferenceDetailSchema', () => {
  const detail = {
    ...sampleReferencePublic,
    stock: [sampleStock],
  };

  it('accepts reference public fields plus stock array', () => {
    expect(ReferenceDetailSchema.parse(detail)).toEqual(detail);
  });

  it('rejects unknown fields on detail and nested stock', () => {
    expect(
      ReferenceDetailSchema.safeParse({
        ...detail,
        availableSizes: ['37'],
      }).success,
    ).toBe(false);
    expect(
      ReferenceDetailSchema.safeParse({
        ...detail,
        stock: [{ ...sampleStock, ghost: true }],
      }).success,
    ).toBe(false);
  });
});

describe('InventoryMovementPublicSchema', () => {
  it('accepts a public movement', () => {
    expect(InventoryMovementPublicSchema.parse(sampleMovement)).toEqual(
      sampleMovement,
    );
    expect(
      InventoryMovementPublicSchema.parse({
        ...sampleMovement,
        note: null,
      }).note,
    ).toBeNull();
  });

  it('rejects unknown fields, invalid uuid/date, and NaN quantities', () => {
    expect(
      InventoryMovementPublicSchema.safeParse({
        ...sampleMovement,
        actor: 'admin',
      }).success,
    ).toBe(false);
    expect(
      InventoryMovementPublicSchema.safeParse({
        ...sampleMovement,
        id: 'bad-id',
      }).success,
    ).toBe(false);
    expect(
      InventoryMovementPublicSchema.safeParse({
        ...sampleMovement,
        createdAt: '06/09/2026',
      }).success,
    ).toBe(false);
    expect(
      InventoryMovementPublicSchema.safeParse({
        ...sampleMovement,
        delta: Number.NaN,
      }).success,
    ).toBe(false);
    expect(
      InventoryMovementPublicSchema.safeParse({
        ...sampleMovement,
        previousQuantity: Number.POSITIVE_INFINITY,
      }).success,
    ).toBe(false);
  });
});

describe('list result schemas', () => {
  it('accepts list references and movements results', () => {
    const refs = {
      items: [
        {
          id: SAMPLE_UUID,
          code: '01',
          modelName: 'Ballerina',
          color: 'Negro',
          priceCop: 120_000,
          active: true,
          photo: null,
          availableSizes: ['37'],
          updatedAt: SAMPLE_ISO,
        },
      ],
      nextAfterCode: '01',
    };
    expect(ListReferencesResultSchema.parse(refs)).toEqual(refs);
    expect(
      ListReferencesResultSchema.parse({ ...refs, nextAfterCode: null }),
    ).toEqual({ ...refs, nextAfterCode: null });

    const movements = {
      items: [sampleMovement],
      nextCursor: 'cursor-token',
    };
    expect(ListMovementsResultSchema.parse(movements)).toEqual(movements);
    expect(
      ListMovementsResultSchema.parse({ ...movements, nextCursor: null }),
    ).toEqual({ ...movements, nextCursor: null });
  });

  it('rejects unknown fields on list results', () => {
    expect(
      ListReferencesResultSchema.safeParse({
        items: [],
        nextAfterCode: null,
        total: 0,
      }).success,
    ).toBe(false);
    expect(
      ListMovementsResultSchema.safeParse({
        items: [],
        nextCursor: null,
        hasMore: false,
      }).success,
    ).toBe(false);
  });
});

describe('PhotoUploadWarningSchema and PhotoUploadResponseSchema', () => {
  it('accepts photo upload response with optional cleanup warning', () => {
    expect(PhotoUploadWarningSchema.parse('old_photo_cleanup_failed')).toBe(
      'old_photo_cleanup_failed',
    );
    expect(
      PhotoUploadResponseSchema.parse({ data: sampleReferencePublic }),
    ).toEqual({ data: sampleReferencePublic });
    expect(
      PhotoUploadResponseSchema.parse({
        data: sampleReferencePublic,
        warnings: ['old_photo_cleanup_failed'],
      }),
    ).toEqual({
      data: sampleReferencePublic,
      warnings: ['old_photo_cleanup_failed'],
    });
  });

  it('rejects invalid warnings, invalid mime in photo, and unknown fields', () => {
    expect(PhotoUploadWarningSchema.safeParse('other_warning').success).toBe(
      false,
    );
    expect(
      PhotoUploadResponseSchema.safeParse({
        data: sampleReferencePublic,
        warnings: ['other_warning'],
      }).success,
    ).toBe(false);
    expect(
      PhotoUploadResponseSchema.safeParse({
        data: {
          ...sampleReferencePublic,
          photo: { ...samplePhoto, mimeType: 'image/gif' },
        },
      }).success,
    ).toBe(false);
    expect(
      PhotoUploadResponseSchema.safeParse({
        data: sampleReferencePublic,
        ok: true,
      }).success,
    ).toBe(false);
  });
});

describe('response envelope schemas', () => {
  it('accepts typed data envelopes', () => {
    expect(
      ReferencePublicResponseSchema.parse({ data: sampleReferencePublic }),
    ).toEqual({ data: sampleReferencePublic });
    expect(
      ReferenceDetailResponseSchema.parse({
        data: { ...sampleReferencePublic, stock: [sampleStock] },
      }),
    ).toMatchObject({ data: { stock: [sampleStock] } });
    expect(
      ListReferencesResponseSchema.parse({
        data: { items: [], nextAfterCode: null },
      }),
    ).toEqual({ data: { items: [], nextAfterCode: null } });
    expect(
      ListMovementsResponseSchema.parse({
        data: { items: [], nextCursor: null },
      }),
    ).toEqual({ data: { items: [], nextCursor: null } });
    expect(
      StockResponseSchema.parse({
        data: { ...sampleStock, referenceId: SAMPLE_UUID },
      }),
    ).toEqual({
      data: { ...sampleStock, referenceId: SAMPLE_UUID },
    });
  });

  it('rejects unknown top-level fields on envelopes', () => {
    expect(
      ReferencePublicResponseSchema.safeParse({
        data: sampleReferencePublic,
        warnings: [],
      }).success,
    ).toBe(false);
    expect(
      ListReferencesResponseSchema.safeParse({
        data: { items: [], nextAfterCode: null },
        page: 1,
      }).success,
    ).toBe(false);
  });
});

describe('strict public response contracts', () => {
  it('rejects non-canonical shoe sizes', () => {
    for (const size of [
      'banana',
      '0',
      '0.5',
      '37.0',
      '37.2',
      '01',
      '100',
      '',
      ' 37',
      '37 ',
    ]) {
      expect(
        ShoeSizeStringSchema.safeParse(size).success,
        `size ${JSON.stringify(size)}`,
      ).toBe(false);
    }

    for (const size of ['1', '36', '37', '37.5', '99.5']) {
      expect(ShoeSizeStringSchema.parse(size)).toBe(size);
    }
  });

  it('rejects unordered or duplicate availableSizes', () => {
    const base = {
      id: SAMPLE_UUID,
      code: '01',
      modelName: 'Ballerina',
      color: 'Negro',
      priceCop: 120_000,
      active: true,
      photo: null,
      updatedAt: SAMPLE_ISO,
    };

    expect(
      ReferenceSummarySchema.safeParse({
        ...base,
        availableSizes: ['38', '37'],
      }).success,
    ).toBe(false);
    expect(
      ReferenceSummarySchema.safeParse({
        ...base,
        availableSizes: ['37', '37'],
      }).success,
    ).toBe(false);
    expect(
      ReferenceSummarySchema.parse({
        ...base,
        availableSizes: [],
      }).availableSizes,
    ).toEqual([]);
    expect(
      ReferenceSummarySchema.parse({
        ...base,
        availableSizes: ['36', '37', '37.5'],
      }).availableSizes,
    ).toEqual(['36', '37', '37.5']);
  });

  it('rejects stock quantity invariants and out-of-range values', () => {
    expect(
      StockAvailabilitySchema.safeParse({
        ...sampleStock,
        availableQuantity: -1,
      }).success,
    ).toBe(false);
    expect(
      StockAvailabilitySchema.safeParse({
        ...sampleStock,
        physicalQuantity: 3,
        reservedQuantity: 4,
        availableQuantity: -1,
      }).success,
    ).toBe(false);
    expect(
      StockAvailabilitySchema.safeParse({
        ...sampleStock,
        physicalQuantity: 5,
        reservedQuantity: 1,
        availableQuantity: 3,
      }).success,
    ).toBe(false);
    expect(
      StockAvailabilitySchema.safeParse({
        ...sampleStock,
        physicalQuantity: 2_000_000_001,
        availableQuantity: 2_000_000_001,
      }).success,
    ).toBe(false);
    expect(
      StockAvailabilitySchema.safeParse({
        size: 'banana',
        physicalQuantity: 1,
        reservedQuantity: 0,
        availableQuantity: 1,
        updatedAt: SAMPLE_ISO,
      }).success,
    ).toBe(false);
  });

  it('rejects movement reason/delta/quantity violations', () => {
    expect(
      InventoryMovementPublicSchema.safeParse({
        ...sampleMovement,
        previousQuantity: -1,
        delta: 6,
      }).success,
    ).toBe(false);
    expect(
      InventoryMovementPublicSchema.safeParse({
        ...sampleMovement,
        reason: 'anything',
      }).success,
    ).toBe(false);
    expect(
      InventoryMovementPublicSchema.safeParse({
        ...sampleMovement,
        delta: 99,
      }).success,
    ).toBe(false);
  });

  it('rejects invalid public username, code, etag, and oversized photo', () => {
    expect(
      AdminUserPublicSchema.safeParse({
        id: '11111111-1111-4111-8111-111111111111',
        username: 'AB',
      }).success,
    ).toBe(false);
    expect(
      AdminUserPublicSchema.safeParse({
        id: '11111111-1111-4111-8111-111111111111',
        username: 'Camila',
      }).success,
    ).toBe(false);

    expect(
      ReferencePublicSchema.safeParse({
        ...sampleReferencePublic,
        code: 'ab',
      }).success,
    ).toBe(false);
    expect(
      ReferencePublicSchema.safeParse({
        ...sampleReferencePublic,
        code: 'A'.repeat(33),
      }).success,
    ).toBe(false);

    expect(
      PhotoPublicSchema.safeParse({
        ...samplePhoto,
        etag: '"not-a-sha256-digest"',
      }).success,
    ).toBe(false);
    expect(
      PhotoPublicSchema.safeParse({
        ...samplePhoto,
        byteSize: 5 * 1024 * 1024 + 1,
      }).success,
    ).toBe(false);
  });

  it('rejects envelopes carrying any of the invalid payloads', () => {
    expect(
      StockResponseSchema.safeParse({
        data: {
          ...sampleStock,
          referenceId: SAMPLE_UUID,
          availableQuantity: -1,
        },
      }).success,
    ).toBe(false);
    expect(
      ListMovementsResponseSchema.safeParse({
        data: {
          items: [{ ...sampleMovement, reason: 'anything' }],
          nextCursor: null,
        },
      }).success,
    ).toBe(false);
    expect(
      ListReferencesResponseSchema.safeParse({
        data: {
          items: [
            {
              id: SAMPLE_UUID,
              code: '01',
              modelName: 'Ballerina',
              color: 'Negro',
              priceCop: 120_000,
              active: true,
              photo: null,
              availableSizes: ['38', '37'],
              updatedAt: SAMPLE_ISO,
            },
          ],
          nextAfterCode: null,
        },
      }).success,
    ).toBe(false);
    expect(
      SessionResponseSchema.safeParse({
        data: {
          user: {
            id: '11111111-1111-4111-8111-111111111111',
            username: 'X',
          },
        },
      }).success,
    ).toBe(false);
  });

  it('accepts a public draft order and rejects extra response fields', () => {
    const order = {
      id: SAMPLE_UUID,
      orderNumber: 'PED-000001',
      status: 'draft',
      reference: {
        id: SAMPLE_UUID,
        code: '01',
        modelName: 'Ballerina',
        color: 'Negro',
      },
      size: '37',
      quantity: 1,
      customer: { name: null, phone: null },
      destination: {
        address: null,
        localityCarrierCode: null,
        localityDepartment: null,
        localityName: null,
        deliveryNotes: null,
      },
      draftVersion: 1,
      latestSummaryVersion: 0,
      confirmedSummaryVersion: null,
      createdAt: SAMPLE_ISO,
      updatedAt: SAMPLE_ISO,
    };
    expect(OrderPublicSchema.safeParse(order).success).toBe(true);
    expect(
      OrderPublicSchema.safeParse({ ...order, unsafe: true }).success,
    ).toBe(false);
  });

  it('requires a consistent, immutable public order summary snapshot', () => {
    expect(
      OrderSummaryPublicSchema.safeParse({
        version: 1,
        draftVersion: 1,
        createdAt: SAMPLE_ISO,
        snapshot: sampleOrderSnapshot,
      }).success,
    ).toBe(true);
  });

  it('validates shipping policy combinations', () => {
    expect(
      ShippingPolicySchema.safeParse({
        preferredCarrier: null,
        fallbackPolicy: 'allow',
        offerMode: 'customer_choice',
        protectedInsurance: 'standard',
      }).success,
    ).toBe(true);
    expect(
      ShippingPolicySchema.safeParse({
        preferredCarrier: null,
        fallbackPolicy: 'block',
        offerMode: 'protected_only',
        protectedInsurance: 'plus',
      }).success,
    ).toBe(false);
  });

  it('validates municipality shipping rules and preference responses', () => {
    const policy = {
      preferredCarrier: 'tcc',
      fallbackPolicy: 'block',
      offerMode: 'protected_only',
      protectedInsurance: 'plus',
    } as const;
    expect(
      ShippingRuleBodySchema.safeParse({
        localityCarrierCode: '05001000',
        ...policy,
      }).success,
    ).toBe(true);
    expect(
      ShippingRulePublicSchema.safeParse({
        localityCarrierCode: '05001000',
        locality: 'Medellín',
        department: 'Antioquia',
        ...policy,
        active: true,
        updatedAt: SAMPLE_ISO,
      }).success,
    ).toBe(true);
    expect(
      ShippingPreferencesResponseSchema.safeParse({ data: policy }).success,
    ).toBe(true);
  });
});
