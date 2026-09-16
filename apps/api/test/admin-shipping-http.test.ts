import { describe, expect, it, vi } from 'vitest';

import { ShippingResponseSchema } from '@camila/contracts';

import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import type { PostgresDatabase } from '../src/database/client.js';
import { AuthenticationRequiredError } from '../src/modules/auth/auth-errors.js';
import type { AuthService } from '../src/modules/auth/auth-service.js';
import type { CatalogService } from '../src/modules/catalog/catalog-service.js';
import type { PhotoStorage } from '../src/modules/catalog/photo-storage.js';

const config: AppConfig = {
  nodeEnv: 'test',
  host: '127.0.0.1',
  port: 3000,
  databaseUrl: 'postgresql://test',
  adminOrigin: 'http://127.0.0.1:5173',
  logLevel: 'silent',
  mediaRoot: './var/media',
};
const state = {
  quotes: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      carrier: 'envia',
      serviceId: 12,
      freightCop: 13368,
      cashOnDeliveryCop: 3000,
      surchargeCop: 600,
      insuranceMode: 'none' as const,
      insuranceCop: 0,
      estimatedDays: '1',
      quotedAt: new Date('2026-09-07T17:00:00Z'),
      expiresAt: new Date('2026-09-07T17:30:00Z'),
      recommended: true,
      selected: true,
    },
  ],
  guide: null,
};

describe('admin shipping HTTP API', () => {
  it('protects shipping data and exposes quote and municipal-rule actions', async () => {
    const service = {
      createQuotes: vi.fn().mockResolvedValue(state.quotes),
      selectQuote: vi.fn().mockResolvedValue(state.quotes),
      getShipping: vi.fn().mockResolvedValue(state),
      setCarrierRule: vi.fn(),
      getDefaultPolicy: vi.fn().mockResolvedValue({
        preferredCarrier: null,
        fallbackPolicy: 'allow',
        offerMode: 'customer_choice',
        protectedInsurance: 'standard',
      }),
      setDefaultPolicy: vi.fn(),
      setShippingPolicy: vi.fn(),
      listShippingRules: vi.fn().mockResolvedValue([
        {
          localityCarrierCode: '05001000',
          locality: 'Medellín',
          department: 'Antioquia',
          preferredCarrier: 'tcc',
          fallbackPolicy: 'block',
          offerMode: 'protected_only',
          protectedInsurance: 'plus',
          active: true,
          updatedAt: new Date('2026-09-09T12:00:00Z'),
        },
      ]),
      deactivateShippingRule: vi.fn(),
      listObservedCarriers: vi.fn().mockResolvedValue(['envia', 'tcc']),
      previewPolicy: vi.fn().mockResolvedValue({
        localityCarrierCode: '05001000',
        source: 'municipality',
        policy: {
          preferredCarrier: 'tcc',
          fallbackPolicy: 'block',
          offerMode: 'protected_only',
          protectedInsurance: 'plus',
        },
      }),
    };
    const guideService = {
      fetchPdf: vi.fn().mockResolvedValue({
        bytes: new TextEncoder().encode('%PDF-test'),
        sha256: 'a'.repeat(64),
      }),
      reviewUncertain: vi.fn(),
    };
    const authService = {
      getSession: async (token?: string) => {
        if (token !== 'good') throw new AuthenticationRequiredError();
        return {
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          username: 'camila',
        };
      },
    } as unknown as AuthService;
    const integrationSettingsService = {
      getPublic: vi.fn().mockResolvedValue({
        whatsapp: {
          configured: true,
          phoneNumberId: '1339849665872310',
          graphApiVersion: 'v26.0',
        },
        shipping: {
          configured: false,
          accountEmail: null,
          integrationId: null,
        },
      }),
      update: vi.fn(),
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
      shippingQuoteService: service,
      shippingGuideService: guideService,
      integrationSettingsService,
    });
    const orderId = '22222222-2222-4222-8222-222222222222';
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/admin/orders/${orderId}/shipping`,
        })
      ).statusCode,
    ).toBe(401);
    const response = await app.inject({
      method: 'POST',
      url: `/api/admin/orders/${orderId}/shipping-quotes`,
      headers: {
        cookie: 'camila_admin_session=good',
        origin: config.adminOrigin,
      },
    });
    expect(response.statusCode).toBe(201);
    expect(
      ShippingResponseSchema.parse(response.json()).data.quotes[0]?.carrier,
    ).toBe('envia');
    const rule = await app.inject({
      method: 'PUT',
      url: '/api/admin/shipping/carrier-rules',
      headers: {
        cookie: 'camila_admin_session=good',
        origin: config.adminOrigin,
      },
      payload: { localityCarrierCode: '05001000', carrier: 'TCC' },
    });
    expect(rule.statusCode).toBe(204);
    expect(service.setCarrierRule).toHaveBeenCalledWith('05001000', 'tcc');
    const integrationSettings = await app.inject({
      method: 'GET',
      url: '/api/admin/integrations/settings',
      headers: { cookie: 'camila_admin_session=good' },
    });
    expect(integrationSettings.statusCode).toBe(200);
    expect(integrationSettings.json().data.whatsapp).not.toHaveProperty(
      'accessToken',
    );
    const preferences = await app.inject({
      method: 'GET',
      url: '/api/admin/shipping/preferences',
      headers: { cookie: 'camila_admin_session=good' },
    });
    expect(preferences.statusCode).toBe(200);
    expect(preferences.json().data.offerMode).toBe('customer_choice');
    const savePolicy = await app.inject({
      method: 'POST',
      url: '/api/admin/shipping/rules',
      headers: {
        cookie: 'camila_admin_session=good',
        origin: config.adminOrigin,
      },
      payload: {
        localityCarrierCode: '05001000',
        preferredCarrier: 'tcc',
        fallbackPolicy: 'block',
        offerMode: 'protected_only',
        protectedInsurance: 'plus',
      },
    });
    expect(savePolicy.statusCode).toBe(204);
    expect(service.setShippingPolicy).toHaveBeenCalledWith(
      '05001000',
      expect.objectContaining({
        fallbackPolicy: 'block',
        protectedInsurance: 'plus',
      }),
      'camila',
    );
    const pdf = await app.inject({
      method: 'GET',
      url: `/api/admin/orders/${orderId}/shipping-guide/pdf`,
      headers: { cookie: 'camila_admin_session=good' },
    });
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['cache-control']).toBe('private, no-store');
    expect(pdf.headers.etag).toBe(`"${'a'.repeat(64)}"`);
    const review = await app.inject({
      method: 'POST',
      url: `/api/admin/orders/${orderId}/shipping-guide/review`,
      headers: {
        cookie: 'camila_admin_session=good',
        origin: config.adminOrigin,
      },
      payload: { preShipmentNumber: '954101306101' },
    });
    expect(review.statusCode).toBe(204);
    expect(guideService.reviewUncertain).toHaveBeenCalledWith(
      orderId,
      '954101306101',
    );
    await app.close();

    const unconfigured = await buildApp({
      config,
      database: {
        orm: {} as PostgresDatabase['orm'],
        ping: vi.fn(),
        close: vi.fn(),
      },
      authService,
      catalogService: {} as CatalogService,
      photoStorage: {} as PhotoStorage,
    });
    const unavailable = await unconfigured.inject({
      method: 'POST',
      url: `/api/admin/orders/${orderId}/shipping-quotes`,
      headers: {
        cookie: 'camila_admin_session=good',
        origin: config.adminOrigin,
      },
    });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json().error.code).toBe('shipping_not_configured');
    await unconfigured.close();
  });
});
