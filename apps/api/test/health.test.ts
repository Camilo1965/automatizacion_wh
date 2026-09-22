import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import type { PostgresDatabase } from '../src/database/client.js';
import type { AuthService } from '../src/modules/auth/auth-service.js';
import type { CatalogService } from '../src/modules/catalog/catalog-service.js';
import type { PhotoStorage } from '../src/modules/catalog/photo-storage.js';

const config: AppConfig = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  databaseUrl: 'postgresql://camila:secret@127.0.0.1:5432/camila',
  adminOrigin: 'http://127.0.0.1:5173',
  logLevel: 'silent',
  mediaRoot: './var/media',
  storageDriver: 'local',
};

function createDatabaseMock(
  overrides: Partial<PostgresDatabase> = {},
): PostgresDatabase {
  return {
    ping: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    orm: {} as PostgresDatabase['orm'],
    ...overrides,
  };
}

function createAuthServiceMock(): AuthService {
  return {
    createUser: vi.fn(),
    resetPassword: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    getSession: vi.fn(),
  } as unknown as AuthService;
}

function createCatalogServiceMock(): CatalogService {
  return {
    createReference: vi.fn(),
    getAdminReference: vi.fn(),
    listAdminReferences: vi.fn(),
    updateReference: vi.fn(),
    activateReference: vi.fn(),
    setPhysicalStock: vi.fn(),
    listAdminMovements: vi.fn(),
    replacePhoto: vi.fn(),
    deactivateReference: vi.fn(),
    listAvailableForConfirmedSize: vi.fn(),
  } as unknown as CatalogService;
}

function createPhotoStorageMock(): PhotoStorage {
  return {
    save: vi.fn(),
    read: vi.fn(),
    delete: vi.fn(),
  };
}

async function buildTestApp(databaseOverrides: Partial<PostgresDatabase> = {}) {
  return buildApp({
    config,
    database: createDatabaseMock(databaseOverrides),
    authService: createAuthServiceMock(),
    catalogService: createCatalogServiceMock(),
    photoStorage: createPhotoStorageMock(),
  });
}

describe('health endpoints', () => {
  it('responds 200 for liveness', async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });

    await app.close();
  });

  it('does not invoke database.ping for liveness', async () => {
    const database = createDatabaseMock();
    const app = await buildApp({
      config,
      database,
      authService: createAuthServiceMock(),
      catalogService: createCatalogServiceMock(),
      photoStorage: createPhotoStorageMock(),
    });

    await app.inject({
      method: 'GET',
      url: '/health/live',
    });

    expect(database.ping).not.toHaveBeenCalled();

    await app.close();
  });

  it('responds 200 for readiness when ping succeeds', async () => {
    const database = createDatabaseMock();
    const app = await buildApp({
      config,
      database,
      authService: createAuthServiceMock(),
      catalogService: createCatalogServiceMock(),
      photoStorage: createPhotoStorageMock(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ready',
      checks: {
        database: 'up',
      },
    });
    expect(database.ping).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('responds 503 for readiness when ping fails', async () => {
    const database = createDatabaseMock({
      ping: vi.fn(async () => {
        throw new Error('simulated-db-failure-token');
      }),
    });
    const app = await buildApp({
      config,
      database,
      authService: createAuthServiceMock(),
      catalogService: createCatalogServiceMock(),
      photoStorage: createPhotoStorageMock(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'not_ready',
      checks: {
        database: 'down',
      },
    });

    await app.close();
  });

  it('does not leak the simulated failure text in readiness errors', async () => {
    const failureText = 'simulated-db-failure-token';
    const database = createDatabaseMock({
      ping: vi.fn(async () => {
        throw new Error(failureText);
      }),
    });
    const app = await buildApp({
      config,
      database,
      authService: createAuthServiceMock(),
      catalogService: createCatalogServiceMock(),
      photoStorage: createPhotoStorageMock(),
    });

    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(response.body).not.toContain(failureText);
    expect(JSON.stringify(response.json())).not.toContain(failureText);

    await app.close();
  });

  it('includes CORS header for the allowed admin origin', async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: {
        origin: config.adminOrigin,
      },
    });

    expect(response.headers['access-control-allow-origin']).toBe(
      config.adminOrigin,
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');

    await app.close();
  });

  it('does not include CORS allow-origin for a different origin', async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: {
        origin: 'http://evil.example',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();

    await app.close();
  });

  it('includes security headers from Helmet', async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
    });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();

    await app.close();
  });

  it('closes the database exactly once when Fastify closes', async () => {
    const database = createDatabaseMock();
    const app = await buildApp({
      config,
      database,
      authService: createAuthServiceMock(),
      catalogService: createCatalogServiceMock(),
      photoStorage: createPhotoStorageMock(),
    });

    await app.close();
    await app.close();

    expect(database.close).toHaveBeenCalledTimes(1);
  });
});
