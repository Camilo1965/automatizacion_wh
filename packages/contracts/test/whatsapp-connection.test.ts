import { describe, expect, it } from 'vitest';
import { WhatsAppConnectionResponseSchema } from '../src/whatsapp-connection.js';

describe('WhatsAppConnectionResponseSchema', () => {
  it('accepts a safe cloud-api-only capability report', () => {
    expect(
      WhatsAppConnectionResponseSchema.parse({
        data: {
          mode: 'cloud_api_only',
          mobileAppAvailable: false,
          phoneNumberId: '1339849665872310',
          wabaId: '1099315002467423',
          webhookConfigured: true,
          serviceWindowHours: 24,
          evidenceSource: null,
          checkedAt: '2026-09-10T12:00:00.000Z',
        },
      }).data.mobileAppAvailable,
    ).toBe(false);
  });

  it('rejects coexistence without provider evidence', () => {
    expect(
      WhatsAppConnectionResponseSchema.safeParse({
        data: {
          mode: 'business_app_coexistence',
          mobileAppAvailable: true,
          phoneNumberId: '1',
          wabaId: '2',
          webhookConfigured: true,
          serviceWindowHours: 24,
          evidenceSource: null,
          checkedAt: '2026-09-10T12:00:00.000Z',
        },
      }).success,
    ).toBe(false);
  });
});
