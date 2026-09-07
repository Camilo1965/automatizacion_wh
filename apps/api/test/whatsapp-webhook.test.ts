import { createHmac } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import type { PostgresDatabase } from '../src/database/client.js';
import type { AuthService } from '../src/modules/auth/auth-service.js';
import type { CatalogService } from '../src/modules/catalog/catalog-service.js';
import type { PhotoStorage } from '../src/modules/catalog/photo-storage.js';
import type { WhatsAppInboundRepository } from '../src/modules/whatsapp/whatsapp-inbound-repository.js';

const config: AppConfig = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  databaseUrl: 'postgresql://camila:secret@127.0.0.1:5432/camila',
  adminOrigin: 'http://127.0.0.1:5173',
  logLevel: 'silent',
  mediaRoot: './var/media',
  whatsappWebhookVerifyToken: 'local-webhook-token',
  whatsappAppSecret: 'test-meta-app-secret',
};

function app(
  inboundRepository?: WhatsAppInboundRepository,
  inboundProcessor?: {
    process(input: {
      whatsappMessageId: string;
      customerPhone: string;
      text: string;
    }): Promise<void>;
  },
) {
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
    ...(inboundRepository === undefined ? {} : { inboundRepository }),
    ...(inboundProcessor === undefined ? {} : { inboundProcessor }),
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

  it('accepts Meta verification requests with normalized duplicate query keys', async () => {
    const server = await app();
    const response = await server.inject({
      method: 'GET',
      url: '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=local-webhook-token&hub.challenge=challenge-value&hub_mode=subscribe&hub_verify_token=local-webhook-token&hub_challenge=challenge-value',
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('challenge-value');
    await server.close();
  });

  it('rejects unsigned inbound posts before persistence', async () => {
    const storeMany = vi.fn();
    const server = await app({ storeMany });
    const response = await server.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      payload: { object: 'whatsapp_business_account', entry: [] },
    });
    expect(response.statusCode).toBe(401);
    expect(storeMany).not.toHaveBeenCalled();
    await server.close();
  });

  it('persists a signed inbound text message', async () => {
    const storeMany = vi.fn().mockResolvedValue(undefined);
    const server = await app({ storeMany });
    const rawBody = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: '123' },
                messages: [
                  {
                    from: '573001234567',
                    id: 'wamid.http-1',
                    timestamp: '1760000000',
                    type: 'text',
                    text: { body: '37' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const signature = `sha256=${createHmac('sha256', config.whatsappAppSecret!).update(rawBody).digest('hex')}`;
    const response = await server.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'x-hub-signature-256': signature,
        'content-type': 'application/json',
      },
      payload: rawBody,
    });
    expect(response.statusCode).toBe(200);
    expect(storeMany).toHaveBeenCalledOnce();
    await server.close();
  });

  it('passes a persisted text message to the sales processor', async () => {
    const storeMany = vi.fn().mockResolvedValue(undefined);
    const process = vi.fn().mockResolvedValue(undefined);
    const server = await app({ storeMany }, { process });
    const rawBody = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: '123' },
                messages: [
                  {
                    from: '573001234567',
                    id: 'wamid.flow-1',
                    timestamp: '1760000000',
                    type: 'text',
                    text: { body: 'hola' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    const signature = `sha256=${createHmac('sha256', config.whatsappAppSecret!).update(rawBody).digest('hex')}`;
    const response = await server.inject({
      method: 'POST',
      url: '/webhooks/whatsapp',
      headers: {
        'x-hub-signature-256': signature,
        'content-type': 'application/json',
      },
      payload: rawBody,
    });
    expect(response.statusCode).toBe(200);
    expect(process).toHaveBeenCalledWith({
      whatsappMessageId: 'wamid.flow-1',
      customerPhone: '+573001234567',
      text: 'hola',
    });
    await server.close();
  });
});
