import { describe, expect, it, vi } from 'vitest';

import { ShippingGuideWorker } from '../src/modules/shipping/shipping-guide-worker.js';
import { ShippingUncertainError } from '../src/modules/shipping/99envios-client.js';

describe('ShippingGuideWorker', () => {
  it('opens a non-retriable alert when guide creation is uncertain', async () => {
    const jobs = {
      claimNext: vi.fn().mockResolvedValue({
        id: 'job-1',
        orderId: 'order-1',
        carrier: 'tcc',
        insuranceMode: 'standard',
        collectionValueCop: 120000,
      }),
      markCreated: vi.fn(),
      markUncertain: vi.fn(),
      markFailed: vi.fn(),
    };
    const orders = {
      get: vi.fn().mockResolvedValue({
        referenceModelName: 'Tenis',
        referenceCode: '01',
        unitPriceCop: 120000,
        size: '37',
        quantity: 1,
        customer: { name: 'Ana Ruiz', phone: '573001234567' },
        destination: {
          address: 'Calle 1',
          localityCarrierCode: '05001000',
          deliveryNotes: null,
        },
      }),
    };
    const client = {
      createPreShipment: vi
        .fn()
        .mockRejectedValue(new ShippingUncertainError()),
    };
    const incidents = { open: vi.fn() };
    await new ShippingGuideWorker(jobs, orders, client, incidents).runOnce();
    expect(incidents.open).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'guide_uncertain',
        retrySafe: false,
        entityId: 'order-1',
      }),
    );
  });
  it('creates a single guide for a claimed confirmed order', async () => {
    const jobs = {
      claimNext: vi.fn().mockResolvedValue({
        id: 'job-1',
        orderId: 'order-1',
        carrier: 'envia',
        insuranceMode: 'plus',
        collectionValueCop: 136968,
      }),
      markCreated: vi.fn(),
      markUncertain: vi.fn(),
      markFailed: vi.fn(),
    };
    const orders = {
      get: vi.fn().mockResolvedValue({
        referenceModelName: 'Tenis Camila',
        referenceCode: '01',
        unitPriceCop: 120000,
        size: '37',
        quantity: 1,
        customer: { name: 'Camila Pérez', phone: '+573158191776' },
        destination: {
          address: 'Calle 1 # 2-3',
          localityCarrierCode: '05001000',
          deliveryNotes: null,
        },
      }),
    };
    const client = {
      createPreShipment: vi.fn().mockResolvedValue({
        preShipmentNumber: '954101306101',
        freightCop: 11596,
      }),
    };
    const worker = new ShippingGuideWorker(jobs, orders, client);
    await expect(worker.runOnce()).resolves.toBe(true);
    expect(client.createPreShipment).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: 'Calzado REF 01 · Tenis Camila · Talla 37',
        declaredValueCop: 136968,
        insurance: 'plus',
        recipient: expect.objectContaining({
          firstName: 'Camila',
          firstSurname: 'Pérez',
          localityCode: '05001000',
        }),
      }),
    );
    expect(jobs.markCreated).toHaveBeenCalledWith(
      'job-1',
      '954101306101',
      11596,
    );
  });
});
