import { fileTypeFromBuffer } from 'file-type';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import postgres from 'postgres';

import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import {
  createPostgresDatabase,
  type PostgresDatabase,
} from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { AuthService } from '../src/modules/auth/auth-service.js';
import { PostgresAdminAuthRepository } from '../src/modules/auth/postgres-admin-auth-repository.js';
import { DefaultCatalogService } from '../src/modules/catalog/catalog-service.js';
import { LocalPhotoStorage } from '../src/modules/catalog/local-photo-storage.js';
import { PostgresCatalogRepository } from '../src/modules/catalog/postgres-catalog-repository.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';
import {
  GIF_BYTES,
  JPEG_BYTES,
  PNG_BYTES,
  WEBP_BYTES,
  buildMultipart,
} from './helpers/image-fixtures.js';

const testDatabaseUrl = requireTestDatabaseUrl();
const adminOrigin = 'http://127.0.0.1:5173';

function cookieFromResponse(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  expect(raw).toBeDefined();
  return raw!.split(';')[0]!;
}

async function mediaFileCount(root: string): Promise<number> {
  try {
    const entries = await readdir(root, { recursive: true });
    return entries.length;
  } catch {
    return 0;
  }
}

describe('admin photo multipart HTTP', () => {
  let database: PostgresDatabase;
  let allowDatabaseClose = false;
  let mediaRoot: string;
  let authService: AuthService;
  let catalogService: DefaultCatalogService;
  let app: FastifyInstance;
  let referenceId: string;
  let cookie: string;

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
          catalog_references
        RESTART IDENTITY CASCADE
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  async function buildTestApp(): Promise<void> {
    if (app !== undefined) {
      await app.close();
    }

    const config: AppConfig = {
      nodeEnv: 'test',
      host: '127.0.0.1',
      port: 3000,
      databaseUrl: testDatabaseUrl,
      adminOrigin,
      logLevel: 'silent',
      mediaRoot,
    };

    const photoStorage = new LocalPhotoStorage(mediaRoot);
    catalogService = new DefaultCatalogService(
      new PostgresCatalogRepository(database),
      photoStorage,
    );
    app = await buildApp({
      config,
      database,
      authService,
      catalogService,
      photoStorage,
    });
  }

  beforeAll(async () => {
    await runMigrations(testDatabaseUrl);
    database = wrapDatabase(createPostgresDatabase(testDatabaseUrl));
    mediaRoot = await mkdtemp(path.join(tmpdir(), 'camila-multipart-'));
    authService = new AuthService(new PostgresAdminAuthRepository(database));
    await buildTestApp();

    expect((await fileTypeFromBuffer(JPEG_BYTES))?.mime).toBe('image/jpeg');
    expect((await fileTypeFromBuffer(PNG_BYTES))?.mime).toBe('image/png');
    expect((await fileTypeFromBuffer(GIF_BYTES))?.mime).toBe('image/gif');
    expect((await fileTypeFromBuffer(WEBP_BYTES))?.mime).toBe('image/webp');
  });

  afterAll(async () => {
    allowDatabaseClose = true;
    await app.close();
    await rm(mediaRoot, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await resetTables();
    await rm(mediaRoot, { recursive: true, force: true });
    mediaRoot = await mkdtemp(path.join(tmpdir(), 'camila-multipart-'));
    await buildTestApp();
    await authService.createUser('camila', 'password1234', 'password1234');
    const login = await app.inject({
      method: 'POST',
      url: '/api/admin/auth/login',
      headers: { origin: adminOrigin },
      payload: { username: 'camila', password: 'password1234' },
    });
    cookie = cookieFromResponse(login.headers['set-cookie']);
    const created = await catalogService.createReference({
      code: '01',
      modelName: 'Ballerina',
      color: 'Negro',
      priceCop: 120_000,
    });
    referenceId = created.id;
  });

  async function putPhoto(multipart: ReturnType<typeof buildMultipart>) {
    return app.inject({
      method: 'PUT',
      url: `/api/admin/references/${referenceId}/photo`,
      headers: {
        origin: adminOrigin,
        cookie,
        ...multipart.headers,
      },
      payload: multipart.payload,
    });
  }

  it('rejects non-multipart with multipart_required and leaves no files', async () => {
    const before = await mediaFileCount(mediaRoot);
    const response = await app.inject({
      method: 'PUT',
      url: `/api/admin/references/${referenceId}/photo`,
      headers: {
        origin: adminOrigin,
        cookie,
        'content-type': 'application/json',
      },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('multipart_required');
    expect(await mediaFileCount(mediaRoot)).toBe(before);
  });

  it('rejects empty multipart with missing_file', async () => {
    const before = await mediaFileCount(mediaRoot);
    const multipart = buildMultipart([]);
    const response = await putPhoto(multipart);
    expect(response.statusCode).toBe(400);
    expect(response.json().error?.code).toBe('missing_file');
    expect(await mediaFileCount(mediaRoot)).toBe(before);
  });

  it('rejects wrong field name with invalid_field', async () => {
    const before = await mediaFileCount(mediaRoot);
    const multipart = buildMultipart([
      {
        name: 'image',
        filename: 'a.png',
        contentType: 'image/png',
        body: PNG_BYTES,
      },
    ]);
    const response = await putPhoto(multipart);
    expect(response.statusCode).toBe(400);
    expect(response.json().error?.code).toBe('invalid_field');
    expect(await mediaFileCount(mediaRoot)).toBe(before);
  });

  it('rejects extra text field with unexpected_fields not too_large', async () => {
    const before = await mediaFileCount(mediaRoot);
    const multipart = buildMultipart([
      {
        name: 'photo',
        filename: 'a.png',
        contentType: 'image/png',
        body: PNG_BYTES,
      },
      { name: 'note', body: 'extra' },
    ]);
    const response = await putPhoto(multipart);
    expect(response.statusCode).toBe(400);
    expect(response.json().error?.code).toBe('unexpected_fields');
    expect(response.json().error?.code).not.toBe('too_large');
    expect(await mediaFileCount(mediaRoot)).toBe(before);
  });

  it('rejects two small PNG files with too_many_files not too_large', async () => {
    const before = await mediaFileCount(mediaRoot);
    const multipart = buildMultipart([
      {
        name: 'photo',
        filename: 'a.png',
        contentType: 'image/png',
        body: PNG_BYTES,
      },
      {
        name: 'photo',
        filename: 'b.png',
        contentType: 'image/png',
        body: PNG_BYTES,
      },
    ]);
    const response = await putPhoto(multipart);
    expect(response.statusCode).toBe(400);
    expect(response.json().error?.code).toBe('too_many_files');
    expect(response.json().error?.code).not.toBe('too_large');
    expect(await mediaFileCount(mediaRoot)).toBe(before);
  });

  it('rejects empty file with empty_file or invalid content code', async () => {
    const before = await mediaFileCount(mediaRoot);
    const multipart = buildMultipart([
      {
        name: 'photo',
        filename: 'empty.png',
        contentType: 'image/png',
        body: new Uint8Array(),
      },
    ]);
    const response = await putPhoto(multipart);
    expect(response.statusCode).toBe(400);
    expect([
      'empty',
      'empty_file',
      'invalid_image',
      'unsupported_type',
    ]).toContain(response.json().error?.code);
    expect(await mediaFileCount(mediaRoot)).toBe(before);
  });

  it('accepts real PNG named .txt by content', async () => {
    const multipart = buildMultipart([
      {
        name: 'photo',
        filename: 'not-an-image.txt',
        contentType: 'text/plain',
        body: PNG_BYTES,
      },
    ]);
    const response = await putPhoto(multipart);
    expect(response.statusCode).toBe(200);
    expect(response.json().data.photo.mimeType).toBe('image/png');
  });

  it('rejects text named .png', async () => {
    const before = await mediaFileCount(mediaRoot);
    const multipart = buildMultipart([
      {
        name: 'photo',
        filename: 'fake.png',
        contentType: 'image/png',
        body: Buffer.from('not-an-image'),
      },
    ]);
    const response = await putPhoto(multipart);
    expect(response.statusCode).toBe(400);
    expect(await mediaFileCount(mediaRoot)).toBe(before);
  });

  it('accepts real JPEG and PNG', async () => {
    const jpeg = await putPhoto(
      buildMultipart([
        {
          name: 'photo',
          filename: 'a.jpg',
          contentType: 'image/jpeg',
          body: JPEG_BYTES,
        },
      ]),
    );
    expect(jpeg.statusCode).toBe(200);
    expect(jpeg.json().data.photo.mimeType).toBe('image/jpeg');

    const png = await putPhoto(
      buildMultipart([
        {
          name: 'photo',
          filename: 'a.png',
          contentType: 'image/png',
          body: PNG_BYTES,
        },
      ]),
    );
    expect(png.statusCode).toBe(200);
    expect(png.json().data.photo.mimeType).toBe('image/png');
  });

  it('rejects authentic GIF and WebP', async () => {
    const before = await mediaFileCount(mediaRoot);
    const gif = await putPhoto(
      buildMultipart([
        {
          name: 'photo',
          filename: 'a.gif',
          contentType: 'image/gif',
          body: GIF_BYTES,
        },
      ]),
    );
    expect(gif.statusCode).toBe(400);
    expect(await mediaFileCount(mediaRoot)).toBe(before);

    const webp = await putPhoto(
      buildMultipart([
        {
          name: 'photo',
          filename: 'a.webp',
          contentType: 'image/webp',
          body: WEBP_BYTES,
        },
      ]),
    );
    expect(webp.statusCode).toBe(400);
    expect(await mediaFileCount(mediaRoot)).toBe(before);
  });

  it('rejects file larger than 5 MiB + 1 with too_large', async () => {
    const before = await mediaFileCount(mediaRoot);
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 0xff);
    oversized.set(JPEG_BYTES.subarray(0, Math.min(JPEG_BYTES.length, 64)), 0);
    const multipart = buildMultipart([
      {
        name: 'photo',
        filename: 'big.jpg',
        contentType: 'image/jpeg',
        body: oversized,
      },
    ]);
    const response = await putPhoto(multipart);
    expect(response.statusCode).toBe(413);
    expect(response.json().error?.code).toBe('too_large');
    expect(await mediaFileCount(mediaRoot)).toBe(before);
  });
});
