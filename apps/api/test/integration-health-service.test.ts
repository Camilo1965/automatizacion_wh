import { describe, expect, it } from 'vitest';
import { IntegrationHealthService } from '../src/modules/integrations/integration-health-service.js';

describe('IntegrationHealthService', () => {
  it('reports checks without calling message, quote or guide operations', async () => {
    const service = new IntegrationHealthService(
      {
        database: async () => undefined,
        mediaStorage: async () => undefined,
        whatsappConfigured: true,
        shippingConfigured: false,
        schedulerHealthy: true,
      },
      () => new Date('2026-09-10T19:00:00Z'),
    );
    const result = await service.check();
    expect(result.database.status).toBe('up');
    expect(result.shipping.status).toBe('degraded');
  });
});
