import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { createDefaultBotFlow } from '../src/modules/conversations/flow-definition.js';
import type { BotFlowService } from '../src/modules/conversations/bot-flow-service.js';
import { registerBotFlowRoutes } from '../src/routes/admin/bot-flow.js';

describe('admin bot-flow simulation route', () => {
  it('returns a side-effect-free simulation without invoking operational services', async () => {
    const app = Fastify();
    const service = {
      get: vi.fn(),
      save: vi.fn(),
      publish: vi.fn(),
      bootstrap: vi.fn(),
      audit: vi.fn(),
    } as unknown as BotFlowService;
    registerBotFlowRoutes(app, service, async () => ({
      id: 'admin-1',
      username: 'admin',
    }));

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/bot-flow/simulate',
        payload: {
          definition: createDefaultBotFlow(),
          messages: ['hola'],
          scenario: 'available',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.sideEffects).toBe(false);
      expect(service.get).not.toHaveBeenCalled();
      expect(service.save).not.toHaveBeenCalled();
      expect(service.publish).not.toHaveBeenCalled();
      expect(service.bootstrap).not.toHaveBeenCalled();
      expect(service.audit).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
