import { describe, expect, it, vi } from 'vitest';

import { ConversationMessagesPageSchema } from '@camila/contracts';
import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import type { PostgresDatabase } from '../src/database/client.js';
import { AuthenticationRequiredError } from '../src/modules/auth/auth-errors.js';
import type { AuthService } from '../src/modules/auth/auth-service.js';
import type { CatalogService } from '../src/modules/catalog/catalog-service.js';
import type { PhotoStorage } from '../src/modules/catalog/photo-storage.js';
import type { ManualMessageService } from '../src/modules/conversations/manual-message-service.js';

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

describe('admin conversation HTTP API', () => {
  it('requires the owner session and allows taking control', async () => {
    const takeControl = vi.fn().mockResolvedValue(undefined);
    const repository = {
      list: vi.fn().mockResolvedValue({
        items: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            customerPhone: '+573001234567',
            mode: 'bot',
            state: 'awaiting_size',
            pendingOutbound: 1,
          },
        ],
        nextCursor: null,
      }),
      get: vi.fn().mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        customerPhone: '+573001234567',
        mode: 'human',
        state: 'awaiting_size',
        pendingOutbound: 0,
      }),
      takeControl,
      releaseControl: vi.fn(),
    };
    const authService = {
      getSession: async (token: string | undefined) => {
        if (token !== 'good') throw new AuthenticationRequiredError();
        return {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          username: 'camila',
          role: 'owner' as const,
        };
      },
    } as unknown as AuthService;
    const app = await buildApp({
      config,
      database: {
        orm: {} as PostgresDatabase['orm'],
        ping: vi.fn(),
        close: vi.fn(),
      },
      authService,
      catalogService: {} as CatalogService,
      photoStorage: {} as PhotoStorage,
      conversationAdminRepository: repository,
    });
    const anonymous = await app.inject({
      method: 'GET',
      url: '/api/admin/conversations',
    });
    expect(anonymous.statusCode).toBe(401);
    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/conversations',
      headers: { cookie: 'camila_admin_session=good' },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data.items).toHaveLength(1);
    expect(list.json().data.nextCursor).toBeNull();
    const take = await app.inject({
      method: 'POST',
      url: '/api/admin/conversations/11111111-1111-4111-8111-111111111111/take-control',
      headers: {
        cookie: 'camila_admin_session=good',
        origin: config.adminOrigin,
      },
    });
    expect(take.statusCode).toBe(200);
    expect(takeControl).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
    );
    await app.close();
  });

  it('returns the transcript and queues an authenticated owner message', async () => {
    const send = vi
      .fn()
      .mockResolvedValue({ id: 'outbound-1', status: 'queued' });
    const authService = {
      getSession: vi.fn().mockResolvedValue({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        username: 'camila',
        role: 'owner' as const,
      }),
    } as unknown as AuthService;
    const conversationAdminRepository = {
      list: vi.fn(),
      get: vi.fn(),
      takeControl: vi.fn(),
      releaseControl: vi.fn(),
    };
    const app = await buildApp({
      config,
      database: {
        orm: {} as PostgresDatabase['orm'],
        ping: vi.fn(),
        close: vi.fn(),
      },
      authService,
      catalogService: {} as CatalogService,
      photoStorage: {} as PhotoStorage,
      conversationAdminRepository,
      conversationTranscriptRepository: {
        listMessages: vi.fn().mockResolvedValue({
          items: [
            {
              id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              conversationId: '11111111-1111-4111-8111-111111111111',
              source: 'customer',
              messageType: 'text',
              text: 'Hola',
              mediaUrl: null,
              status: 'received',
              providerMessageId: 'wamid.1',
              occurredAt: new Date('2026-09-10T12:00:00Z'),
            },
          ],
          nextCursor: null,
        }),
        updateProviderStatus: vi.fn(),
      },
      manualMessageService: { send } as unknown as ManualMessageService,
    });
    const headers = {
      cookie: 'camila_admin_session=good',
      origin: config.adminOrigin,
    };
    const transcript = await app.inject({
      method: 'GET',
      url: '/api/admin/conversations/11111111-1111-4111-8111-111111111111/messages',
      headers,
    });
    expect(transcript.statusCode).toBe(200);
    expect(transcript.json().data.items[0].occurredAt).toBe(
      '2026-09-10T12:00:00.000Z',
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/conversations/11111111-1111-4111-8111-111111111111/messages',
      headers,
      payload: { clientRequestId: 'owner-reply-1', text: 'Hola' },
    });
    expect(response.statusCode).toBe(202);
    expect(send).toHaveBeenCalledWith({
      conversationId: '11111111-1111-4111-8111-111111111111',
      actorUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      clientRequestId: 'owner-reply-1',
      text: 'Hola',
    });
    await app.close();
  });

  it('returns internal guide events only after authentication and conversation existence checks', async () => {
    const conversationId = '11111111-1111-4111-8111-111111111111';
    const event = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      conversationId,
      source: 'system',
      messageType: 'event',
      text: null,
      mediaUrl: null,
      status: 'internal',
      providerMessageId: null,
      occurredAt: new Date('2026-09-10T12:00:00Z'),
      orderId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      orderNumber: 'PED-000123',
      guideJobId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      preShipmentNumber: 'PRE-12345',
      carrier: 'envia',
    };
    const getConversation = vi.fn().mockResolvedValue({ id: conversationId });
    const listMessages = vi.fn().mockResolvedValue({
      items: [event],
      nextCursor: null,
    });
    const authService = {
      getSession: async (token: string | undefined) => {
        if (token !== 'good') throw new AuthenticationRequiredError();
        return {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          username: 'camila',
          role: 'owner' as const,
        };
      },
    } as unknown as AuthService;
    const app = await buildApp({
      config,
      database: {
        orm: {} as PostgresDatabase['orm'],
        ping: vi.fn(),
        close: vi.fn(),
      },
      authService,
      catalogService: {} as CatalogService,
      photoStorage: {} as PhotoStorage,
      conversationAdminRepository: {
        list: vi.fn(),
        get: getConversation,
        takeControl: vi.fn(),
        releaseControl: vi.fn(),
      },
      conversationTranscriptRepository: {
        listMessages,
        updateProviderStatus: vi.fn(),
      },
    });

    const anonymous = await app.inject({
      method: 'GET',
      url: `/api/admin/conversations/${conversationId}/messages`,
    });
    expect(anonymous.statusCode).toBe(401);
    expect(getConversation).not.toHaveBeenCalled();
    expect(listMessages).not.toHaveBeenCalled();

    getConversation.mockResolvedValueOnce(null);
    const missing = await app.inject({
      method: 'GET',
      url: `/api/admin/conversations/${conversationId}/messages`,
      headers: { cookie: 'camila_admin_session=good' },
    });
    expect(missing.statusCode).toBe(404);
    expect(listMessages).not.toHaveBeenCalled();

    const response = await app.inject({
      method: 'GET',
      url: `/api/admin/conversations/${conversationId}/messages`,
      headers: { cookie: 'camila_admin_session=good' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.items[0]).toEqual({
      ...event,
      occurredAt: '2026-09-10T12:00:00.000Z',
    });
    expect(
      ConversationMessagesPageSchema.safeParse(response.json().data).success,
    ).toBe(true);
    expect(getConversation).toHaveBeenCalledTimes(2);
    expect(listMessages).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
