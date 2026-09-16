import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { IntegrationSecretCrypto } from '../src/modules/integrations/integration-secret-crypto.js';
import {
  IntegrationSettingsError,
  IntegrationSettingsService,
} from '../src/modules/integrations/integration-settings-service.js';

describe('IntegrationSettingsService', () => {
  it('writes encrypted values and exposes only a safe connection summary', async () => {
    const values = new Map<string, string>();
    const service = new IntegrationSettingsService(
      {
        get: async (provider) => values.get(provider) ?? null,
        upsert: async (provider, encrypted) => void values.set(provider, encrypted),
      },
      new IntegrationSecretCrypto(randomBytes(32).toString('base64')),
    );

    await service.update({
      whatsapp: {
        phoneNumberId: '1339849665872310',
        graphApiVersion: 'v26.0',
        accessToken: 'private-access-token',
      },
      shipping: { accountEmail: 'owner@example.com', password: 'private-pass' },
    });

    expect([...values.values()].join(' ')).not.toContain('private-access-token');
    await expect(service.getPublic()).resolves.toEqual({
      whatsapp: {
        configured: true,
        phoneNumberId: '1339849665872310',
        graphApiVersion: 'v26.0',
      },
      shipping: {
        configured: true,
        accountEmail: 'owner@example.com',
        integrationId: null,
      },
    });
  });

  it('does not accept an incomplete first-time configuration', async () => {
    const service = new IntegrationSettingsService(
      { get: async () => null, upsert: async () => undefined },
      new IntegrationSecretCrypto(randomBytes(32).toString('base64')),
    );
    await expect(
      service.update({ whatsapp: { phoneNumberId: '1339849665872310' } }),
    ).rejects.toBeInstanceOf(IntegrationSettingsError);
  });
});
