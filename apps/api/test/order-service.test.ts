import { describe, expect, it, vi } from 'vitest';

import { OrderService } from '../src/modules/orders/order-service.js';

const reference = {
  id: 'ref',
  code: '01',
  modelName: 'Modelo',
  color: 'Negro',
  priceCop: 100_000,
  active: true,
  photo: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const draft = {
  id: 'order',
  orderNumber: 1,
  status: 'draft' as const,
  referenceId: 'ref',
  referenceCode: '01',
  referenceModelName: 'Modelo',
  referenceColor: 'Negro',
  size: '37',
  quantity: 1,
  customer: { name: null, phone: null },
  destination: {
    address: null,
    localityCarrierCode: null,
    localityDepartment: null,
    localityName: null,
    deliveryNotes: null,
  },
  draftVersion: 1,
  latestSummaryVersion: 0,
  confirmedSummaryVersion: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('OrderService', () => {
  it('rejects an inactive reference before creating a draft', async () => {
    const create = vi.fn();
    const service = new OrderService(
      {
        create,
        find: vi.fn(),
        list: vi.fn(),
        update: vi.fn(),
        createSummary: vi.fn(),
        transition: vi.fn(),
      },
      async () => ({ ...reference, active: false }),
    );
    await expect(
      service.create({
        referenceId: 'ref',
        size: '37',
        quantity: 1,
        adminUserId: 'admin',
      }),
    ).rejects.toMatchObject({ code: 'reference_inactive' });
    expect(create).not.toHaveBeenCalled();
  });

  it('requires customer and destination fields before summarizing', async () => {
    const createSummary = vi.fn();
    const service = new OrderService(
      {
        create: vi.fn(),
        find: vi.fn().mockResolvedValue(draft),
        list: vi.fn(),
        update: vi.fn(),
        createSummary,
        transition: vi.fn(),
      },
      async () => reference,
    );
    await expect(service.createSummary('order')).rejects.toMatchObject({
      code: 'incomplete_order',
    });
    expect(createSummary).not.toHaveBeenCalled();
  });

  it('permits confirmation retry only through its idempotency key', async () => {
    const transition = vi
      .fn()
      .mockResolvedValue({ ...draft, status: 'confirmed' });
    const service = new OrderService(
      {
        create: vi.fn(),
        find: vi.fn().mockResolvedValue({ ...draft, status: 'confirmed' }),
        list: vi.fn(),
        update: vi.fn(),
        createSummary: vi.fn(),
        transition,
      },
      async () => reference,
    );
    await service.transition({
      orderId: 'order',
      action: 'confirm',
      adminUserId: 'admin',
      idempotencyKey: 'abcdefgh',
    });
    expect(transition).toHaveBeenCalledOnce();
  });
});
