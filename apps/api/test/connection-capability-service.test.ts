import { describe, expect, it } from 'vitest';
import { ConnectionCapabilityService } from '../src/modules/whatsapp/connection-capability-service.js';

describe('ConnectionCapabilityService', () => {
  it('defaults safely to cloud API only', () => {
    const result = new ConnectionCapabilityService({
      phoneNumberId: '123',
      wabaId: '456',
      webhookConfigured: true,
    }).getConnection();

    expect(result).toMatchObject({
      mode: 'cloud_api_only',
      mobileAppAvailable: false,
      evidenceSource: null,
    });
  });
});
