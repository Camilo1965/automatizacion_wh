import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import {
  createPostgresDatabase,
  type PostgresDatabase,
} from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { ADMIN_SESSION_COOKIE } from '../src/http/session-cookie.js';
import { AuthService } from '../src/modules/auth/auth-service.js';
import { PostgresAdminAuthRepository } from '../src/modules/auth/postgres-admin-auth-repository.js';
import { DefaultCatalogService } from '../src/modules/catalog/catalog-service.js';
import { CatalogImportService } from '../src/modules/catalog/catalog-import-service.js';
import { LocalPhotoStorage } from '../src/modules/catalog/local-photo-storage.js';
import { PostgresCatalogImportRepository } from '../src/modules/catalog/postgres-catalog-import-repository.js';
import { PostgresCatalogRepository } from '../src/modules/catalog/postgres-catalog-repository.js';
import type { PhotoStorage } from '../src/modules/catalog/photo-storage.js';
import { LocalityService } from '../src/modules/localities/locality-service.js';
import { PostgresLocalityRepository } from '../src/modules/localities/postgres-locality-repository.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';
import { WEBP_BYTES } from './helpers/image-fixtures.js';
import { fileTypeFromBuffer } from 'file-type';

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x03, 0x00,
  0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

const JPEG_BYTES = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08,
  0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a,
  0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d,
  0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20, 0x22,
  0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34,
  0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0,
  0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4,
  0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xff, 0xc4, 0x00, 0x14, 0x10, 0x01,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  0x7f, 0xff, 0xd9,
]);

const testDatabaseUrl = requireTestDatabaseUrl();
const adminOrigin = 'http://127.0.0.1:5173';

function buildMultipart(
  parts: ReadonlyArray<{
    name: string;
    filename?: string;
    contentType?: string;
    body: Uint8Array | string;
  }>,
): { headers: Record<string, string>; payload: Buffer } {
  const boundary = '----camila-test-boundary';
  const chunks: Buffer[] = [];

  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (part.filename !== undefined) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: ${part.contentType ?? 'application/octet-stream'}\r\n\r\n`,
        ),
      );
      chunks.push(
        typeof part.body === 'string'
          ? Buffer.from(part.body)
          : Buffer.from(part.body),
      );
      chunks.push(Buffer.from('\r\n'));
    } else {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"\r\n\r\n${String(part.body)}\r\n`,
        ),
      );
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: Buffer.concat(chunks),
  };
}

function cookieFromResponse(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  expect(raw).toBeDefined();
  return raw!.split(';')[0]!;
}

describe('admin HTTP API', () => {
  let database: PostgresDatabase;
  let allowDatabaseClose = false;
  let mediaRoot: string;
  let photoStorage: LocalPhotoStorage;
  let authService: AuthService;
  let catalogService: DefaultCatalogService;
  let catalogImportService: CatalogImportService;
  let localityService: LocalityService;
  let app: FastifyInstance;
  let config: AppConfig;

  function wrapDatabase(inner: PostgresDatabase): PostgresDatabase {
    return {
      get orm() {
        return inner.orm;
      },
      ping: () => inner.ping(),
      close: async () => {
        if (allowDatabaseClose) {
          await inner.close();
        }
      },
    };
  }

  async function resetTables(): Promise<void> {
    const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });
    try {
      await sql`
        TRUNCATE TABLE
          admin_sessions,
          admin_users,
          inventory_movements,
          catalog_stock,
          catalog_references,
          catalog_imports,
          shipping_localities
        RESTART IDENTITY CASCADE
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  async function buildTestApp(
    overrides: {
      nodeEnv?: AppConfig['nodeEnv'];
      photoStorage?: PhotoStorage;
    } = {},
  ): Promise<FastifyInstance> {
    if (app !== undefined) {
      await app.close();
    }

    config = {
      nodeEnv: overrides.nodeEnv ?? 'test',
      host: '127.0.0.1',
      port: 3000,
      databaseUrl: testDatabaseUrl,
      adminOrigin,
      logLevel: 'silent',
      mediaRoot,
    };

    const storage = overrides.photoStorage ?? photoStorage;
    catalogService = new DefaultCatalogService(
      new PostgresCatalogRepository(database),
      storage,
    );
    catalogImportService = new CatalogImportService(
      new PostgresCatalogImportRepository(database),
    );
    localityService = new LocalityService(
      new PostgresLocalityRepository(database),
    );

    app = await buildApp({
      config,
      database,
      authService,
      catalogService,
      catalogImportService,
      localityService,
      photoStorage: storage,
    });
    return app;
  }

  async function seedAdmin(): Promise<void> {
    await authService.createUser('camila', 'password1234', 'password1234');
  }

  async function login(
    username = 'camila',
    password = 'password1234',
  ): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      headers: { origin: adminOrigin },
      payload: { username, password },
    });
    expect(response.statusCode).toBe(200);
    return cookieFromResponse(response.headers['set-cookie']);
  }

  beforeAll(async () => {
    await runMigrations(testDatabaseUrl);
    database = wrapDatabase(createPostgresDatabase(testDatabaseUrl));
    mediaRoot = await mkdtemp(path.join(tmpdir(), 'camila-admin-http-'));
    photoStorage = new LocalPhotoStorage(mediaRoot);
    authService = new AuthService(new PostgresAdminAuthRepository(database));
    await buildTestApp();
  });

  afterAll(async () => {
    allowDatabaseClose = true;
    await app.close();
    await rm(mediaRoot, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await resetTables();
    await buildTestApp();
    await seedAdmin();
  });

  it('logs in with Set-Cookie attributes and rejects invalid credentials the same way', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      headers: { origin: adminOrigin },
      payload: { username: 'camila', password: 'password1234' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({
      data: { user: { username: 'camila' } },
    });

    const setCookie = String(ok.headers['set-cookie']);
    expect(setCookie).toContain(`${ADMIN_SESSION_COOKIE}=`);
    expect(setCookie.toLowerCase()).toContain('httponly');
    expect(setCookie.toLowerCase()).toContain('samesite=strict');
    expect(setCookie.toLowerCase()).toContain('path=/');
    expect(setCookie.toLowerCase()).toContain('max-age=43200');
    expect(setCookie.toLowerCase()).not.toContain('secure');

    const missing = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      headers: { origin: adminOrigin },
      payload: { username: 'missing', password: 'password1234' },
    });
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      headers: { origin: adminOrigin },
      payload: { username: 'camila', password: 'wrong-password' },
    });
    expect(missing.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(missing.json()).toEqual(wrong.json());
    expect(missing.json()).toEqual({
      error: {
        code: 'invalid_credentials',
        message: 'Credenciales inválidas',
      },
    });

    const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });
    try {
      const sessions = await sql<{ token_hash: string }[]>`
        SELECT token_hash FROM admin_sessions
      `;
      expect(sessions[0]?.token_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(setCookie).not.toContain(sessions[0]!.token_hash);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('sets Secure cookie in production', async () => {
    await resetTables();
    await buildTestApp({ nodeEnv: 'production' });
    await seedAdmin();
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      headers: { origin: adminOrigin },
      payload: { username: 'camila', password: 'password1234' },
    });
    expect(String(response.headers['set-cookie']).toLowerCase()).toContain(
      'secure',
    );
  });

  it('returns session, logout revokes cookie, and anonymous admin routes get 401', async () => {
    const cookie = await login();
    const session = await app.inject({
      method: 'GET',
      url: '/api/admin/auth/session',
      headers: { cookie },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      data: { user: { username: 'camila' } },
    });

    const logout = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/logout',
      headers: { origin: adminOrigin, cookie },
    });
    expect(logout.statusCode).toBe(204);
    expect(logout.body).toBe('');

    const after = await app.inject({
      method: 'GET',
      url: '/api/admin/auth/session',
      headers: { cookie },
    });
    expect(after.statusCode).toBe(401);
    expect(after.json().error.code).toBe('authentication_required');

    const anonymous = await app.inject({
      method: 'GET',
      url: '/api/admin/references',
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it('rate limits login to 5 attempts then 429', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/auth/login',
        headers: { origin: adminOrigin },
        payload: { username: 'camila', password: 'wrong-password' },
      });
      expect(response.statusCode).toBe(401);
    }

    const blocked = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      headers: { origin: adminOrigin },
      payload: { username: 'camila', password: 'wrong-password' },
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe('rate_limited');
  });

  it('requires exact Origin on admin mutations and allows GET without Origin', async () => {
    const cookie = await login();

    const missing = await app.inject({
      method: 'POST',
      url: '/api/admin/references',
      headers: { cookie },
      payload: {
        code: '01',
        modelName: 'Modelo',
        color: 'Negro',
        priceCop: 100000,
      },
    });
    expect(missing.statusCode).toBe(403);
    expect(missing.json().error.code).toBe('invalid_origin');

    const wrong = await app.inject({
      method: 'POST',
      url: '/api/admin/references',
      headers: { cookie, origin: 'http://evil.example' },
      payload: {
        code: '01',
        modelName: 'Modelo',
        color: 'Negro',
        priceCop: 100000,
      },
    });
    expect(wrong.statusCode).toBe(403);

    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/references',
      headers: { cookie },
    });
    expect(list.statusCode).toBe(200);
  });

  it('supports catalog CRUD, search escaping, stock, movements cursor, and photos', async () => {
    const cookie = await login();

    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/references',
      headers: { origin: adminOrigin, cookie },
      payload: {
        code: '01',
        modelName: 'Clasico',
        color: 'Negro',
        priceCop: 150000,
      },
    });
    expect(created.statusCode).toBe(201);
    const referenceId = created.json().data.id as string;
    expect(created.json().data.code).toBe('01');
    expect(created.json().data.photo).toBeNull();

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/admin/references',
      headers: { origin: adminOrigin, cookie },
      payload: {
        code: '01',
        modelName: 'Otro',
        color: 'Rojo',
        priceCop: 100000,
      },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('reference_code_conflict');

    await app.inject({
      method: 'POST',
      url: '/api/admin/references',
      headers: { origin: adminOrigin, cookie },
      payload: {
        code: '02',
        modelName: '100%_cotton',
        color: 'Azul',
        priceCop: 120000,
      },
    });

    const search = await app.inject({
      method: 'GET',
      url: '/api/admin/references?query=%25_&status=all',
      headers: { cookie },
    });
    expect(search.statusCode).toBe(200);
    expect(
      search.json().data.items.map((item: { code: string }) => item.code),
    ).toEqual(['02']);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/admin/references/${referenceId}`,
      headers: { origin: adminOrigin, cookie },
      payload: { modelName: 'Clasico Plus', priceCop: 160000 },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().data.modelName).toBe('Clasico Plus');
    expect(patched.json().data.code).toBe('01');

    const deactivated = await app.inject({
      method: 'POST',
      url: `/api/admin/references/${referenceId}/deactivate`,
      headers: { origin: adminOrigin, cookie },
    });
    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json().data.active).toBe(false);

    const inactiveList = await app.inject({
      method: 'GET',
      url: '/api/admin/references?status=inactive',
      headers: { cookie },
    });
    expect(
      inactiveList
        .json()
        .data.items.some((item: { id: string }) => item.id === referenceId),
    ).toBe(true);

    const activated = await app.inject({
      method: 'POST',
      url: `/api/admin/references/${referenceId}/activate`,
      headers: { origin: adminOrigin, cookie },
    });
    expect(activated.json().data.active).toBe(true);

    const stock = await app.inject({
      method: 'PUT',
      url: `/api/admin/references/${referenceId}/stock/37`,
      headers: { origin: adminOrigin, cookie },
      payload: { physicalQuantity: 3, note: 'Conteo inicial' },
    });
    expect(stock.statusCode).toBe(200);
    expect(stock.json().data).toMatchObject({
      physicalQuantity: 3,
      reservedQuantity: 0,
      availableQuantity: 3,
    });

    const sameStock = await app.inject({
      method: 'PUT',
      url: `/api/admin/references/${referenceId}/stock/37`,
      headers: { origin: adminOrigin, cookie },
      payload: { physicalQuantity: 3, note: 'Sin cambio' },
    });
    expect(sameStock.statusCode).toBe(200);

    const adjusted = await app.inject({
      method: 'PUT',
      url: `/api/admin/references/${referenceId}/stock/37`,
      headers: { origin: adminOrigin, cookie },
      payload: { physicalQuantity: 5, note: 'Ajuste cierre' },
    });
    expect(adjusted.json().data.physicalQuantity).toBe(5);

    const belowReservedSetup = await app.inject({
      method: 'PUT',
      url: `/api/admin/references/${referenceId}/stock/38`,
      headers: { origin: adminOrigin, cookie },
      payload: { physicalQuantity: 2, note: 'Reserva setup' },
    });
    expect(belowReservedSetup.statusCode).toBe(200);
    const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });
    try {
      await sql`
        UPDATE catalog_stock
        SET reserved_quantity = 2
        WHERE reference_id = ${referenceId} AND size = 38
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
    const belowReserved = await app.inject({
      method: 'PUT',
      url: `/api/admin/references/${referenceId}/stock/38`,
      headers: { origin: adminOrigin, cookie },
      payload: { physicalQuantity: 1, note: 'Bajar de mas' },
    });
    expect(belowReserved.statusCode).toBe(400);
    expect(belowReserved.json().error.code).toBe('below_reserved');

    const movements = await app.inject({
      method: 'GET',
      url: `/api/admin/references/${referenceId}/movements?limit=1`,
      headers: { cookie },
    });
    expect(movements.statusCode).toBe(200);
    expect(movements.json().data.items).toHaveLength(1);
    expect(movements.json().data.nextCursor).toBeTypeOf('string');

    const nextPage = await app.inject({
      method: 'GET',
      url: `/api/admin/references/${referenceId}/movements?limit=10&cursor=${encodeURIComponent(movements.json().data.nextCursor)}`,
      headers: { cookie },
    });
    expect(nextPage.statusCode).toBe(200);
    expect(nextPage.json().data.items.length).toBeGreaterThan(0);
    expect(
      nextPage
        .json()
        .data.items.some(
          (item: { id: string }) =>
            item.id === movements.json().data.items[0].id,
        ),
    ).toBe(false);

    const badCursor = await app.inject({
      method: 'GET',
      url: `/api/admin/references/${referenceId}/movements?cursor=%%%`,
      headers: { cookie },
    });
    expect(badCursor.statusCode).toBe(400);
    expect(badCursor.json().error.code).toBe('invalid_cursor');

    const detail = await app.inject({
      method: 'GET',
      url: `/api/admin/references/${referenceId}`,
      headers: { cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().data.stock[0]).toMatchObject({
      size: '37',
      availableQuantity: 5,
    });

    const pngUpload = buildMultipart([
      {
        name: 'photo',
        filename: 'shoe.png',
        contentType: 'image/png',
        body: PNG_BYTES,
      },
    ]);
    const png = await app.inject({
      method: 'PUT',
      url: `/api/admin/references/${referenceId}/photo`,
      headers: {
        origin: adminOrigin,
        cookie,
        ...pngUpload.headers,
      },
      payload: pngUpload.payload,
    });
    expect(png.statusCode).toBe(200);
    expect(png.json().data.photo.mimeType).toBe('image/png');
    expect(png.json().data.photo.url).toBe(
      `/api/admin/references/${referenceId}/photo`,
    );
    expect(png.json().data.photo.storageKey).toBeUndefined();

    const jpegUpload = buildMultipart([
      {
        name: 'photo',
        filename: 'shoe.jpg',
        contentType: 'image/jpeg',
        body: JPEG_BYTES,
      },
    ]);
    const jpeg = await app.inject({
      method: 'PUT',
      url: `/api/admin/references/${referenceId}/photo`,
      headers: {
        origin: adminOrigin,
        cookie,
        ...jpegUpload.headers,
      },
      payload: jpegUpload.payload,
    });
    expect(jpeg.statusCode).toBe(200);
    expect(jpeg.json().data.photo.mimeType).toBe('image/jpeg');

    const readPhoto = await app.inject({
      method: 'GET',
      url: `/api/admin/references/${referenceId}/photo`,
      headers: { cookie },
    });
    expect(readPhoto.statusCode).toBe(200);
    expect(readPhoto.headers['content-type']).toContain('image/jpeg');
    expect(readPhoto.headers['cache-control']).toBe('private, max-age=3600');
    expect(readPhoto.headers.etag).toBe(
      `"${createHash('sha256').update(JPEG_BYTES).digest('hex')}"`,
    );
    expect(Buffer.from(readPhoto.rawPayload)).toEqual(Buffer.from(JPEG_BYTES));

    const notModified = await app.inject({
      method: 'GET',
      url: `/api/admin/references/${referenceId}/photo`,
      headers: {
        cookie,
        'if-none-match': readPhoto.headers.etag as string,
      },
    });
    expect(notModified.statusCode).toBe(304);

    const gifUpload = buildMultipart([
      {
        name: 'photo',
        filename: 'x.gif',
        contentType: 'image/gif',
        body: Buffer.from('GIF89a'),
      },
    ]);
    const gif = await app.inject({
      method: 'PUT',
      url: `/api/admin/references/${referenceId}/photo`,
      headers: { origin: adminOrigin, cookie, ...gifUpload.headers },
      payload: gifUpload.payload,
    });
    expect(gif.statusCode).toBe(400);

    expect((await fileTypeFromBuffer(WEBP_BYTES))?.mime).toBe('image/webp');
    const webpUpload = buildMultipart([
      {
        name: 'photo',
        filename: 'x.webp',
        contentType: 'image/webp',
        body: WEBP_BYTES,
      },
    ]);
    const webp = await app.inject({
      method: 'PUT',
      url: `/api/admin/references/${referenceId}/photo`,
      headers: { origin: adminOrigin, cookie, ...webpUpload.headers },
      payload: webpUpload.payload,
    });
    expect(webp.statusCode).toBe(400);

    const emptyUpload = buildMultipart([
      {
        name: 'photo',
        filename: 'empty.png',
        contentType: 'image/png',
        body: new Uint8Array(),
      },
    ]);
    const empty = await app.inject({
      method: 'PUT',
      url: `/api/admin/references/${referenceId}/photo`,
      headers: { origin: adminOrigin, cookie, ...emptyUpload.headers },
      payload: emptyUpload.payload,
    });
    expect(empty.statusCode).toBe(400);

    const oversized = new Uint8Array(5 * 1024 * 1024 + 1);
    oversized.set(JPEG_BYTES, 0);
    const oversizedUpload = buildMultipart([
      {
        name: 'photo',
        filename: 'big.jpg',
        contentType: 'image/jpeg',
        body: oversized,
      },
    ]);
    const tooLarge = await app.inject({
      method: 'PUT',
      url: `/api/admin/references/${referenceId}/photo`,
      headers: { origin: adminOrigin, cookie, ...oversizedUpload.headers },
      payload: oversizedUpload.payload,
    });
    expect(tooLarge.statusCode).toBe(413);
  });

  it('handles concurrent stock updates and photo cleanup warning', async () => {
    const cookie = await login();
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/references',
      headers: { origin: adminOrigin, cookie },
      payload: {
        code: '99',
        modelName: 'Concurrente',
        color: 'Verde',
        priceCop: 90000,
      },
    });
    const referenceId = created.json().data.id as string;

    await app.inject({
      method: 'PUT',
      url: `/api/admin/references/${referenceId}/stock/37`,
      headers: { origin: adminOrigin, cookie },
      payload: { physicalQuantity: 1, note: 'Base' },
    });

    const results = await Promise.all([
      app.inject({
        method: 'PUT',
        url: `/api/admin/references/${referenceId}/stock/37`,
        headers: { origin: adminOrigin, cookie },
        payload: { physicalQuantity: 4, note: 'Ajuste A' },
      }),
      app.inject({
        method: 'PUT',
        url: `/api/admin/references/${referenceId}/stock/37`,
        headers: { origin: adminOrigin, cookie },
        payload: { physicalQuantity: 7, note: 'Ajuste B' },
      }),
    ]);

    expect(results.every((result) => result.statusCode === 200)).toBe(true);
    const finalStock = await app.inject({
      method: 'GET',
      url: `/api/admin/references/${referenceId}`,
      headers: { cookie },
    });
    const physical = finalStock.json().data.stock[0].physicalQuantity as number;
    expect([4, 7]).toContain(physical);

    const firstUpload = buildMultipart([
      {
        name: 'photo',
        filename: 'one.png',
        contentType: 'image/png',
        body: PNG_BYTES,
      },
    ]);
    const firstPhoto = await app.inject({
      method: 'PUT',
      url: `/api/admin/references/${referenceId}/photo`,
      headers: { origin: adminOrigin, cookie, ...firstUpload.headers },
      payload: firstUpload.payload,
    });
    expect(firstPhoto.statusCode).toBe(200);
    const previousKey = (
      await new PostgresCatalogRepository(database).findReferenceById(
        referenceId,
      )
    )?.photo?.storageKey;
    expect(previousKey).toBeTruthy();

    const failingStorage: PhotoStorage = {
      save: (bytes) => photoStorage.save(bytes),
      read: (key) => photoStorage.read(key),
      delete: async (key) => {
        if (key === previousKey) {
          throw new Error('cannot delete previous');
        }
        await photoStorage.delete(key);
      },
    };

    await buildTestApp({ photoStorage: failingStorage });
    const cookie2 = await login();
    const secondUpload = buildMultipart([
      {
        name: 'photo',
        filename: 'two.png',
        contentType: 'image/png',
        body: PNG_BYTES,
      },
    ]);
    const warned = await app.inject({
      method: 'PUT',
      url: `/api/admin/references/${referenceId}/photo`,
      headers: {
        origin: adminOrigin,
        cookie: cookie2,
        ...secondUpload.headers,
      },
      payload: secondUpload.payload,
    });
    expect(warned.statusCode).toBe(200);
    expect(warned.json().warnings).toEqual(['old_photo_cleanup_failed']);
    expect(warned.json().data.photo.url).toContain(referenceId);

    const after = await new PostgresCatalogRepository(
      database,
    ).findReferenceById(referenceId);
    expect(after?.photo?.storageKey).not.toBe(previousKey);
  });

  it('previews and commits a CSV import through authenticated HTTP routes', async () => {
    const cookie = await login();
    const upload = buildMultipart([
      {
        name: 'file',
        filename: 'catalogo.csv',
        contentType: 'text/csv',
        body: [
          'reference_code,model_name,color,price_cop,size,physical_quantity',
          'PILOT-01,Tenis piloto,Negro,120000,37,2',
          'PILOT-01,Tenis piloto,Negro,120000,37.5,1',
        ].join('\n'),
      },
    ]);
    const preview = await app.inject({
      method: 'POST',
      url: '/api/admin/catalog-imports/preview',
      headers: { origin: adminOrigin, cookie, ...upload.headers },
      payload: upload.payload,
    });
    expect(preview.statusCode).toBe(201);
    expect(preview.json().data).toMatchObject({
      status: 'previewed',
      errors: [],
      references: [{ code: 'PILOT-01' }],
    });

    const committed = await app.inject({
      method: 'POST',
      url: `/api/admin/catalog-imports/${preview.json().data.id}/commit`,
      headers: { origin: adminOrigin, cookie },
    });
    expect(committed.statusCode).toBe(200);
    expect(committed.json().data.status).toBe('committed');

    const readiness = await app.inject({
      method: 'GET',
      url: '/api/admin/catalog-readiness',
      headers: { cookie },
    });
    expect(readiness.statusCode).toBe(200);
    expect(readiness.json()).toEqual({
      data: {
        total: 1,
        active: 0,
        withoutPhoto: 1,
        withoutAvailableStock: 0,
        ready: 0,
      },
    });
  });

  it('keeps an invalid CSV from changing stock and reports existing references in preview', async () => {
    const cookie = await login();
    await catalogService.createReference({
      code: '01',
      modelName: 'Existente',
      color: 'Negro',
      priceCop: 100000,
    });
    const upload = buildMultipart([
      {
        name: 'file',
        filename: 'catalogo.csv',
        contentType: 'text/csv',
        body: [
          'reference_code,model_name,color,price_cop,size,physical_quantity',
          '01,Duplicado,Azul,120000,37,2',
        ].join('\n'),
      },
    ]);
    const preview = await app.inject({
      method: 'POST',
      url: '/api/admin/catalog-imports/preview',
      headers: { origin: adminOrigin, cookie, ...upload.headers },
      payload: upload.payload,
    });
    expect(preview.statusCode).toBe(201);
    expect(preview.json().data).toMatchObject({
      status: 'invalid',
      errors: [{ row: 2, field: 'reference_code', code: 'reference_exists' }],
    });
    const denied = await app.inject({
      method: 'POST',
      url: `/api/admin/catalog-imports/${preview.json().data.id}/commit`,
      headers: { origin: adminOrigin, cookie },
    });
    expect(denied.statusCode).toBe(409);
  });

  it('serves the CSV template and searchable Colombian localities only to the owner', async () => {
    const anonymous = await app.inject({
      method: 'GET',
      url: '/api/admin/catalog-import-template',
    });
    expect(anonymous.statusCode).toBe(401);

    const cookie = await login();
    const template = await app.inject({
      method: 'GET',
      url: '/api/admin/catalog-import-template',
      headers: { cookie },
    });
    expect(template.statusCode).toBe(200);
    expect(template.headers['content-type']).toContain('text/csv');
    expect(template.body).toContain('reference_code,model_name,color');

    await localityService.importCsv(
      new TextEncoder().encode(
        'carrier_code,department,locality,country\n05001,Antioquia,Medellín,CO',
      ),
    );
    const localities = await app.inject({
      method: 'GET',
      url: '/api/admin/localities?query=medellin',
      headers: { cookie },
    });
    expect(localities.statusCode).toBe(200);
    expect(localities.json()).toEqual({
      data: {
        items: [
          {
            carrierCode: '05001',
            department: 'Antioquia',
            locality: 'Medellín',
            normalizedName: 'medellin',
            country: 'CO',
          },
        ],
        nextAfterCode: null,
      },
    });

    const departments = await app.inject({
      method: 'GET',
      url: '/api/admin/localities/departments',
      headers: { cookie },
    });
    expect(departments.statusCode).toBe(200);
    expect(departments.json()).toEqual({
      data: { items: [{ name: 'Antioquia', localityCount: 1 }] },
    });
  });
});
