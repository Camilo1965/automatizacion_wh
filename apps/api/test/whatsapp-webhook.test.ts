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
  whatsappWebhookVerifyToken: 'local-webhook-token',
};

function app() {
  return buildApp({
    config,
    database: {
      ping: vi.fn(),
      close: vi.fn(),
      orm: {} as PostgresDatabase['orm'],
    },
    authService: {} as AuthService,
    catalogService: {} as CatalogService,
    photoStorage: {} as PhotoStorage,
  });
}

describe('WhatsApp webhook verification', () => {
  it('returns Meta challenge only for the configured verification token', async () => {
    const server = await app();
    const accepted = await server.inject({
      method: 'GET',
      url: '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=local-webhook-token&hub.challenge=challenge-value',
    });
    const rejected = await server.inject({
      method: 'GET',
      url: '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-value',
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.body).toBe('challenge-value');
    expect(rejected.statusCode).toBe(403);
    await server.close();
  });
});
