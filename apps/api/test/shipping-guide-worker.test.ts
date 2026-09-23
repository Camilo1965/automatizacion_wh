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
        status: 'confirmed',
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
        status: 'confirmed',
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

  it('keeps a successful provider creation uncertain when local persistence fails', async () => {
    const job = {
      id: 'job-1',
      orderId: 'order-1',
      carrier: 'envia',
      insuranceMode: 'standard' as const,
      collectionValueCop: 120000,
    };
    const jobs = {
      claimNext: vi.fn().mockResolvedValueOnce(job).mockResolvedValueOnce(null),
      markCreated: vi
        .fn()
        .mockRejectedValue(new Error('transcript_insert_failed')),
      markUncertain: vi.fn(),
      markFailed: vi.fn(),
    };
    const orders = {
      get: vi.fn().mockResolvedValue({
        status: 'confirmed',
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
      createPreShipment: vi.fn().mockResolvedValue({
        preShipmentNumber: 'PRE-123',
        freightCop: 11900,
      }),
    };
    const worker = new ShippingGuideWorker(jobs, orders, client);

    await expect(worker.runOnce()).resolves.toBe(true);
    await expect(worker.runOnce()).resolves.toBe(false);

    expect(client.createPreShipment).toHaveBeenCalledTimes(1);
    expect(jobs.markUncertain).toHaveBeenCalledTimes(1);
    expect(jobs.markUncertain).toHaveBeenCalledWith('job-1');
    expect(jobs.markFailed).not.toHaveBeenCalled();
  });

  it('never fails or retries a provider-created guide when uncertainty persistence also fails', async () => {
    const jobs = {
      claimNext: vi
        .fn()
        .mockResolvedValueOnce({
          id: 'job-1',
          orderId: 'order-1',
          carrier: 'envia',
          insuranceMode: 'standard' as const,
          collectionValueCop: 120000,
        })
        .mockResolvedValueOnce(null),
      markCreated: vi.fn().mockRejectedValue(new Error('database_unavailable')),
      markUncertain: vi
        .fn()
        .mockRejectedValue(new Error('database_unavailable')),
      markFailed: vi.fn(),
    };
    const orders = {
      get: vi.fn().mockResolvedValue({
        status: 'confirmed',
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
      createPreShipment: vi.fn().mockResolvedValue({
        preShipmentNumber: 'PRE-123',
        freightCop: 11900,
      }),
    };
    const incidents = { open: vi.fn() };
    const worker = new ShippingGuideWorker(jobs, orders, client, incidents);

    await expect(worker.runOnce()).resolves.toBe(true);
    await expect(worker.runOnce()).resolves.toBe(false);

    expect(client.createPreShipment).toHaveBeenCalledTimes(1);
    expect(jobs.markUncertain).toHaveBeenCalledTimes(1);
    expect(jobs.markFailed).not.toHaveBeenCalled();
    expect(incidents.open).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'guide_uncertain', retrySafe: false }),
    );
  });

  it('fails a claimed job when the order is no longer confirmed', async () => {
    const jobs = {
      claimNext: vi.fn().mockResolvedValue({
        id: 'job-1',
        orderId: 'order-1',
        carrier: 'envia',
        insuranceMode: 'standard',
        collectionValueCop: 120000,
      }),
      markCreated: vi.fn(),
      markUncertain: vi.fn(),
      markFailed: vi.fn(),
    };
    const orders = {
      get: vi.fn().mockResolvedValue({
        status: 'cancelled',
        referenceModelName: 'Tenis Camila',
        referenceCode: '01',
        unitPriceCop: 120000,
        size: '37',
        quantity: 1,
        customer: { name: 'Ana Ruiz', phone: '+573001234567' },
        destination: {
          address: 'Calle 1',
          localityCarrierCode: '05001000',
          deliveryNotes: null,
        },
      }),
    };
    const client = { createPreShipment: vi.fn() };
    const worker = new ShippingGuideWorker(jobs, orders, client);
    await expect(worker.runOnce()).resolves.toBe(true);
    expect(client.createPreShipment).not.toHaveBeenCalled();
    expect(jobs.markFailed).toHaveBeenCalledWith(
      'job-1',
      'order_not_confirmed',
    );
  });
});
