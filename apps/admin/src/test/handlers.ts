import { http, HttpResponse } from 'msw';

import {
  adminUser,
  movementFixture,
  referenceDetail,
  referenceSummary,
} from './fixtures';

const base = '/api/admin';

type SessionState = {
  authenticated: boolean;
  references: (typeof referenceDetail)[];
  movements: (typeof movementFixture)[];
  forceUnauthorized: boolean;
  forceServerError: boolean;
  photoCleanupWarning: boolean;
  movementsPageSize: number;
};

export const state: SessionState = {
  authenticated: false,
  references: [],
  movements: [],
  forceUnauthorized: false,
  forceServerError: false,
  photoCleanupWarning: false,
  movementsPageSize: 25,
};

export function resetState(): void {
  state.authenticated = false;
  state.references = [];
  state.movements = [];
  state.forceUnauthorized = false;
  state.forceServerError = false;
  state.photoCleanupWarning = false;
  state.movementsPageSize = 25;
}

function unauthorized() {
  return HttpResponse.json(
    {
      error: {
        code: 'authentication_required',
        message: 'Authentication required',
      },
    },
    { status: 401 },
  );
}

function requireAuth() {
  if (state.forceUnauthorized || !state.authenticated) {
    return unauthorized();
  }
  if (state.forceServerError) {
    return HttpResponse.json(
      {
        error: {
          code: 'internal_error',
          message: 'An unexpected error occurred',
        },
      },
      { status: 500 },
    );
  }
  return null;
}

function toReferencePublic(item: typeof referenceDetail) {
  return {
    id: item.id,
    code: item.code,
    modelName: item.modelName,
    color: item.color,
    priceCop: item.priceCop,
    active: item.active,
    photo: item.photo,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export const handlers = [
  http.get(`${base}/whatsapp/connection`, () =>
    HttpResponse.json({
      data: {
        mode: 'cloud_api_only',
        mobileAppAvailable: false,
        phoneNumberId: '1339849665872310',
        wabaId: '1099315002467423',
        webhookConfigured: true,
        serviceWindowHours: 24,
        evidenceSource: null,
        checkedAt: '2026-09-10T12:00:00.000Z',
      },
    }),
  ),
  http.get(`${base}/integrations/health`, () =>
    HttpResponse.json({
      data: Object.fromEntries(
        ['database', 'mediaStorage', 'whatsapp', 'shipping', 'scheduler'].map(
          (key) => [
            key,
            {
              status: 'up',
              checkedAt: '2026-09-10T19:00:00.000Z',
              detail: null,
            },
          ],
        ),
      ),
    }),
  ),
  http.get(`${base}/alerts`, () =>
    HttpResponse.json({ data: { items: [], nextCursor: null } }),
  ),
  http.get(`${base}/orders`, () => {
    const authError = requireAuth();
    return (
      authError ?? HttpResponse.json({ data: { items: [], nextCursor: null } })
    );
  }),
  http.get(`${base}/conversations`, () => {
    const authError = requireAuth();
    return authError ?? HttpResponse.json({ data: { items: [] } });
  }),
  http.get(`${base}/inventory/closures`, () =>
    HttpResponse.json({
      data: {
        items: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            businessDate: '2026-09-10',
            version: 1,
            profile: 'adjustments',
            status: 'generated',
            movementCount: 2,
            totalUnits: -2,
            checksum: 'a'.repeat(64),
            createdAt: '2026-09-10T19:00:00.000Z',
            acknowledgedAt: null,
          },
        ],
      },
    }),
  ),
  http.get(`${base}/dashboard`, () =>
    HttpResponse.json({
      data: {
        queues: {
          conversations: 2,
          guideIncidents: 1,
          readyToDispatch: 3,
          awaitingConfirmation: 4,
          closurePending: false,
          lowStockReferences: 5,
          integrationFailures: 0,
        },
        today: {
          newConversations: 7,
          confirmedOrders: 4,
          dispatchedOrders: 2,
          codValueCop: 480000,
          guidesCreated: 3,
          reservedUnits: 4,
          averageFirstResponseSeconds: null,
        },
        generatedAt: '2026-09-10T15:00:00.000Z',
      },
    }),
  ),
  http.get(`${base}/shipping/preferences`, () =>
    HttpResponse.json({
      data: {
        preferredCarrier: null,
        fallbackPolicy: 'allow',
        offerMode: 'customer_choice',
        protectedInsurance: 'standard',
      },
    }),
  ),
  http.get(`${base}/shipping/rules`, () =>
    HttpResponse.json({ data: { items: [] } }),
  ),
  http.get(`${base}/shipping/carriers`, () =>
    HttpResponse.json({ data: { items: ['envia', 'tcc'] } }),
  ),
  http.get(`${base}/catalog-readiness`, () => {
    const total = state.references.length;
    const active = state.references.filter((item) => item.active).length;
    const withoutPhoto = state.references.filter(
      (item) => item.photo === null,
    ).length;
    const withoutAvailableStock = state.references.filter(
      (item) => !item.stock.some((stock) => stock.availableQuantity > 0),
    ).length;
    const ready = state.references.filter(
      (item) =>
        item.active &&
        item.photo !== null &&
        item.stock.some((stock) => stock.availableQuantity > 0),
    ).length;
    return HttpResponse.json({
      data: { total, active, withoutPhoto, withoutAvailableStock, ready },
    });
  }),
  http.post(`${base}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };
    if (body.username === 'camila' && body.password === 'password1234') {
      state.authenticated = true;
      return HttpResponse.json({ data: { user: adminUser } });
    }
    return HttpResponse.json(
      {
        error: {
          code: 'invalid_credentials',
          message: 'Credenciales inválidas',
        },
      },
      { status: 401 },
    );
  }),

  http.get(`${base}/auth/session`, () => {
    if (!state.authenticated || state.forceUnauthorized) {
      return unauthorized();
    }
    return HttpResponse.json({ data: { user: adminUser } });
  }),

  http.post(`${base}/auth/logout`, () => {
    state.authenticated = false;
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${base}/references`, ({ request }) => {
    const authError = requireAuth();
    if (authError) {
      return authError;
    }

    const url = new URL(request.url);
    const query = url.searchParams.get('query')?.toLowerCase() ?? '';
    const status = url.searchParams.get('status') ?? 'active';
    const afterCode = url.searchParams.get('afterCode');
    const limit = Number.parseInt(url.searchParams.get('limit') ?? '25', 10);

    let items = state.references.map((item) => ({
      id: item.id,
      code: item.code,
      modelName: item.modelName,
      color: item.color,
      priceCop: item.priceCop,
      active: item.active,
      photo: item.photo,
      availableSizes: item.stock
        .filter((stock) => stock.availableQuantity > 0)
        .map((stock) => stock.size)
        .sort((left, right) => Number(left) - Number(right)),
      updatedAt: item.updatedAt,
    }));

    if (status === 'active') {
      items = items.filter((item) => item.active);
    } else if (status === 'inactive') {
      items = items.filter((item) => !item.active);
    }

    if (query !== '') {
      items = items.filter(
        (item) =>
          item.code.toLowerCase().includes(query) ||
          item.modelName.toLowerCase().includes(query) ||
          item.color.toLowerCase().includes(query),
      );
    }

    items.sort((a, b) => a.code.localeCompare(b.code));

    if (afterCode !== null && afterCode !== '') {
      items = items.filter((item) => item.code > afterCode);
    }

    const page = items.slice(0, limit);
    const nextAfterCode =
      items.length > limit ? (page.at(-1)?.code ?? null) : null;

    return HttpResponse.json({
      data: { items: page, nextAfterCode },
    });
  }),

  http.post(`${base}/references`, async ({ request }) => {
    const authError = requireAuth();
    if (authError) {
      return authError;
    }

    const body = (await request.json()) as {
      code: string;
      modelName: string;
      color: string;
      priceCop: number;
    };

    if (body.modelName.trim() === '') {
      return HttpResponse.json(
        {
          error: {
            code: 'validation_error',
            message: 'Invalid model name',
            field: 'modelName',
          },
        },
        { status: 400 },
      );
    }

    const created = {
      ...referenceDetail,
      id: crypto.randomUUID(),
      code: body.code.trim().toUpperCase(),
      modelName: body.modelName.trim(),
      color: body.color.trim(),
      priceCop: body.priceCop,
      active: true,
      photo: null,
      stock: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    state.references.push(created);
    return HttpResponse.json(
      { data: toReferencePublic(created) },
      { status: 201 },
    );
  }),

  http.get(`${base}/references/:referenceId`, ({ params }) => {
    const authError = requireAuth();
    if (authError) {
      return authError;
    }
    const found = state.references.find(
      (item) => item.id === params.referenceId,
    );
    if (found === undefined) {
      return HttpResponse.json(
        {
          error: { code: 'not_found', message: 'Reference was not found' },
        },
        { status: 404 },
      );
    }
    return HttpResponse.json({ data: found });
  }),

  http.patch(`${base}/references/:referenceId`, async ({ params, request }) => {
    const authError = requireAuth();
    if (authError) {
      return authError;
    }
    const found = state.references.find(
      (item) => item.id === params.referenceId,
    );
    if (found === undefined) {
      return HttpResponse.json(
        {
          error: { code: 'not_found', message: 'Reference was not found' },
        },
        { status: 404 },
      );
    }
    const body = (await request.json()) as {
      modelName?: string;
      color?: string;
      priceCop?: number;
    };
    if (body.modelName !== undefined) {
      found.modelName = body.modelName.trim();
    }
    if (body.color !== undefined) {
      found.color = body.color.trim();
    }
    if (body.priceCop !== undefined) {
      found.priceCop = body.priceCop;
    }
    found.updatedAt = new Date().toISOString();
    return HttpResponse.json({ data: toReferencePublic(found) });
  }),

  http.post(`${base}/references/:referenceId/activate`, ({ params }) => {
    const authError = requireAuth();
    if (authError) {
      return authError;
    }
    const found = state.references.find(
      (item) => item.id === params.referenceId,
    );
    if (found === undefined) {
      return HttpResponse.json(
        {
          error: { code: 'not_found', message: 'Reference was not found' },
        },
        { status: 404 },
      );
    }
    found.active = true;
    found.updatedAt = new Date().toISOString();
    return HttpResponse.json({ data: toReferencePublic(found) });
  }),

  http.post(`${base}/references/:referenceId/deactivate`, ({ params }) => {
    const authError = requireAuth();
    if (authError) {
      return authError;
    }
    const found = state.references.find(
      (item) => item.id === params.referenceId,
    );
    if (found === undefined) {
      return HttpResponse.json(
        {
          error: { code: 'not_found', message: 'Reference was not found' },
        },
        { status: 404 },
      );
    }
    found.active = false;
    found.updatedAt = new Date().toISOString();
    return HttpResponse.json({ data: toReferencePublic(found) });
  }),

  http.put(`${base}/references/:referenceId/photo`, async ({ params }) => {
    const authError = requireAuth();
    if (authError) {
      return authError;
    }
    const found = state.references.find(
      (item) => item.id === params.referenceId,
    );
    if (found === undefined) {
      return HttpResponse.json(
        {
          error: { code: 'not_found', message: 'Reference was not found' },
        },
        { status: 404 },
      );
    }
    found.photo = {
      url: `/api/admin/references/${found.id}/photo`,
      mimeType: 'image/png',
      byteSize: 68,
      etag: `"${'b'.repeat(64)}"`,
    };
    found.updatedAt = new Date().toISOString();
    return HttpResponse.json({
      data: toReferencePublic(found),
      ...(state.photoCleanupWarning
        ? { warnings: ['old_photo_cleanup_failed'] as const }
        : {}),
    });
  }),

  http.put(
    `${base}/references/:referenceId/stock/:size`,
    async ({ params, request }) => {
      const authError = requireAuth();
      if (authError) {
        return authError;
      }
      const found = state.references.find(
        (item) => item.id === params.referenceId,
      );
      if (found === undefined) {
        return HttpResponse.json(
          {
            error: { code: 'not_found', message: 'Reference was not found' },
          },
          { status: 404 },
        );
      }
      const body = (await request.json()) as {
        physicalQuantity: number;
        note: string;
      };
      const size = String(params.size);
      const existing = found.stock.find((item) => item.size === size);
      const previous = existing?.physicalQuantity ?? 0;
      const updated = {
        size,
        physicalQuantity: body.physicalQuantity,
        reservedQuantity: existing?.reservedQuantity ?? 0,
        availableQuantity:
          body.physicalQuantity - (existing?.reservedQuantity ?? 0),
        updatedAt: new Date().toISOString(),
      };
      if (existing === undefined) {
        found.stock.push(updated);
      } else {
        Object.assign(existing, updated);
      }
      state.movements.unshift({
        ...movementFixture,
        id: crypto.randomUUID(),
        size,
        previousQuantity: previous,
        newQuantity: body.physicalQuantity,
        delta: body.physicalQuantity - previous,
        note: body.note,
        createdAt: new Date().toISOString(),
      });
      return HttpResponse.json({
        data: { referenceId: found.id, ...updated },
      });
    },
  ),

  http.get(
    `${base}/references/:referenceId/movements`,
    ({ params, request }) => {
      const authError = requireAuth();
      if (authError) {
        return authError;
      }
      const url = new URL(request.url);
      const cursor = url.searchParams.get('cursor');
      const limit = Number.parseInt(
        url.searchParams.get('limit') ?? String(state.movementsPageSize),
        10,
      );

      let items = state.movements.filter(
        () => params.referenceId !== undefined,
      );

      if (cursor !== null && cursor !== '') {
        const index = items.findIndex((item) => item.id === cursor);
        items = index >= 0 ? items.slice(index + 1) : [];
      }

      const page = items.slice(0, limit);
      const nextCursor =
        items.length > limit ? (page.at(-1)?.id ?? null) : null;

      return HttpResponse.json({
        data: { items: page, nextCursor },
      });
    },
  ),
];

export function seedDefaultCatalog(): void {
  state.authenticated = true;
  state.references = [
    {
      ...referenceDetail,
      stock: [...referenceDetail.stock],
    },
  ];
  state.movements = [];
}

export { referenceSummary };
