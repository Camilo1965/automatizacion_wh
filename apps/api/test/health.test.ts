import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import type { DatabaseHealth } from '../src/contracts/database-health.js';

const config: AppConfig = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  databaseUrl: 'postgresql://camila:secret@127.0.0.1:5432/camila',
  adminOrigin: 'http://127.0.0.1:5173',
  logLevel: 'silent',
};

function createDatabaseMock(
  overrides: Partial<DatabaseHealth> = {},
): DatabaseHealth {
  return {
    ping: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('health endpoints', () => {
  it('responds 200 for liveness', async () => {
    const database = createDatabaseMock();
    const app = await buildApp({ config, database });

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
    const app = await buildApp({ config, database });

    await app.inject({
      method: 'GET',
      url: '/health/live',
    });

    expect(database.ping).not.toHaveBeenCalled();

    await app.close();
  });

  it('responds 200 for readiness when ping succeeds', async () => {
    const database = createDatabaseMock();
    const app = await buildApp({ config, database });

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
    const app = await buildApp({ config, database });

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
    const app = await buildApp({ config, database });

    const response = await app.inject({
      method: 'GET',
      url: '/health/ready',
    });

    expect(response.body).not.toContain(failureText);
    expect(JSON.stringify(response.json())).not.toContain(failureText);

    await app.close();
  });

  it('includes CORS header for the allowed admin origin', async () => {
    const database = createDatabaseMock();
    const app = await buildApp({ config, database });

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

    await app.close();
  });

  it('does not include CORS allow-origin for a different origin', async () => {
    const database = createDatabaseMock();
    const app = await buildApp({ config, database });

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
    const database = createDatabaseMock();
    const app = await buildApp({ config, database });

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
    const app = await buildApp({ config, database });

    await app.close();
    await app.close();

    expect(database.close).toHaveBeenCalledTimes(1);
  });
});
