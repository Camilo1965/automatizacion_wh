import { describe, expect, it, vi } from 'vitest';

import { WhatsAppSalesService } from '../src/modules/conversations/whatsapp-sales-service.js';

function availableItem() {
  return {
    referenceId: '11111111-1111-4111-8111-111111111111',
    code: '01',
    modelName: 'Tenis Camila',
    color: 'Negro',
    priceCop: 120_000,
    confirmedSize: '37.0',
    availableQuantity: 2,
    photoStorageKey: 'catalog/01.jpg',
    photoMimeType: 'image/jpeg' as const,
  };
}

describe('WhatsAppSalesService', () => {
  it('queues the first welcome once', async () => {
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: false,
        conversationId: 'conversation-1',
        state: 'awaiting_size',
        reply: '¡Hola! 😊 ¿Qué talla buscas?',
      }),
      returnToSize: vi.fn(),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
    );
    await service.process({
      whatsappMessageId: 'wamid.1',
      customerPhone: '+573001234567',
      text: 'hola',
    });
    expect(outbound.enqueueText).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      customerPhone: '+573001234567',
      body: '¡Hola! 😊 ¿Qué talla buscas?',
      idempotencyKey: 'reply:wamid.1',
    });
  });

  it('queues only the available photos for the confirmed size', async () => {
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: false,
        conversationId: 'conversation-1',
        state: 'showing_models',
        reply: null,
        selectedSize: '37.0',
        action: 'show_catalog',
      }),
      returnToSize: vi.fn(),
    };
    const catalog = {
      listAvailableForConfirmedSize: vi.fn().mockResolvedValue({
        items: [availableItem()],
        nextAfterCode: null,
      }),
    };
    const menus = {
      create: vi.fn().mockResolvedValue({ id: 'menu-1', version: 1 }),
      findOption: vi.fn(),
      getNextCursor: vi.fn(),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      catalog,
      menus,
      outbound,
    );

    await service.process({
      whatsappMessageId: 'wamid.2',
      customerPhone: '+573001234567',
      text: '37',
    });

    expect(catalog.listAvailableForConfirmedSize).toHaveBeenCalledWith({
      confirmedSize: '37.0',
    });
    expect(outbound.enqueueImage).toHaveBeenCalledWith(
      expect.objectContaining({
        caption: 'REF 01 · Tenis Camila · Negro · $120.000 · Talla 37',
        storageKey: 'catalog/01.jpg',
        mimeType: 'image/jpeg',
      }),
    );
    expect(outbound.enqueueText).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Responde con la referencia que te gustó o “cambiar talla”.',
      }),
    );
  });

  it('returns to size selection when no stock is available', async () => {
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: false,
        conversationId: 'conversation-1',
        state: 'showing_models',
        reply: null,
        selectedSize: '45.0',
        action: 'show_catalog',
      }),
      returnToSize: vi.fn().mockResolvedValue(undefined),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      {
        listAvailableForConfirmedSize: vi
          .fn()
          .mockResolvedValue({ items: [], nextAfterCode: null }),
      },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
    );
    await service.process({
      whatsappMessageId: 'wamid.3',
      customerPhone: '+573001234567',
      text: '45',
    });
    expect(conversations.returnToSize).toHaveBeenCalledWith('conversation-1');
    expect(outbound.enqueueText).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'No tenemos modelos disponibles en talla 45. Escribe otra talla.',
      }),
    );
  });

  it('rejects a reference that was not in the active menu', async () => {
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: false,
        conversationId: 'conversation-1',
        state: 'showing_models',
        reply: null,
        selectedSize: '37.0',
        action: 'select_reference',
        input: '99',
      }),
      returnToSize: vi.fn(),
    };
    const menus = {
      create: vi.fn(),
      findOption: vi.fn().mockResolvedValue(null),
      getNextCursor: vi.fn(),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      menus,
      outbound,
    );
    await service.process({
      whatsappMessageId: 'wamid.4',
      customerPhone: '+573001234567',
      text: '99',
    });
    expect(outbound.enqueueText).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Esa referencia no está en el menú vigente. Elige una de las fotos enviadas.',
      }),
    );
  });

  it('loads the next page without repeating previous references', async () => {
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: false,
        conversationId: 'conversation-1',
        state: 'showing_models',
        reply: null,
        selectedSize: '37.0',
        action: 'more_models',
      }),
      returnToSize: vi.fn(),
    };
    const catalog = {
      listAvailableForConfirmedSize: vi.fn().mockResolvedValue({
        items: [{ ...availableItem(), code: '05' }],
        nextAfterCode: null,
      }),
    };
    const menus = {
      create: vi.fn().mockResolvedValue({ id: 'menu-2', version: 2 }),
      findOption: vi.fn(),
      getNextCursor: vi.fn().mockResolvedValue('04'),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      catalog,
      menus,
      outbound,
    );
    await service.process({
      whatsappMessageId: 'wamid.5',
      customerPhone: '+573001234567',
      text: 'más modelos',
    });
    expect(catalog.listAvailableForConfirmedSize).toHaveBeenCalledWith({
      confirmedSize: '37.0',
      afterCode: '04',
    });
  });

  it('creates a one-pair draft only for a reference in the active menu', async () => {
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: false,
        conversationId: 'conversation-1',
        state: 'showing_models',
        reply: null,
        selectedSize: '37.0',
        action: 'select_reference',
        input: '01',
      }),
      returnToSize: vi.fn(),
      attachOrder: vi.fn().mockResolvedValue(undefined),
    };
    const menus = {
      create: vi.fn(),
      getNextCursor: vi.fn(),
      findOption: vi.fn().mockResolvedValue({
        referenceId: '11111111-1111-4111-8111-111111111111',
        code: '01',
      }),
    };
    const orders = {
      create: vi.fn().mockResolvedValue({ id: 'order-1' }),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      menus,
      outbound,
      orders,
    );
    await service.process({
      whatsappMessageId: 'wamid.6',
      customerPhone: '+573001234567',
      text: '01',
    });
    expect(orders.create).toHaveBeenCalledWith({
      referenceId: '11111111-1111-4111-8111-111111111111',
      size: '37.0',
      quantity: 1,
      customerPhone: '+573001234567',
    });
    expect(conversations.attachOrder).toHaveBeenCalledWith(
      'conversation-1',
      '11111111-1111-4111-8111-111111111111',
      'order-1',
    );
    expect(outbound.enqueueText).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Perfecto, elegiste la REF 01. ¿Cuál es tu nombre completo?',
      }),
    );
  });

  it('creates a summary after delivery data and confirms with the inbound id', async () => {
    const conversations = {
      receive: vi
        .fn()
        .mockResolvedValueOnce({
          duplicate: false,
          conversationId: 'conversation-1',
          state: 'awaiting_confirmation',
          reply: null,
          activeOrderId: 'order-1',
          action: 'collect_notes',
          input: '',
        })
        .mockResolvedValueOnce({
          duplicate: false,
          conversationId: 'conversation-1',
          state: 'completed',
          reply: null,
          activeOrderId: 'order-1',
          activeSummaryVersion: 3,
          action: 'confirm_order',
        }),
      returnToSize: vi.fn(),
      setSummaryVersion: vi.fn(),
    };
    const orders = {
      create: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      createSummary: vi.fn().mockResolvedValue({
        version: 3,
        snapshot: {
          orderNumber: 'PED-000123',
          reference: { code: '01', modelName: 'Tenis Camila', color: 'Negro' },
          size: '37.0',
          quantity: 1,
          totalCop: 120000,
          customer: { name: 'Camila Pérez', phone: '+573158191776' },
          destination: {
            locality: 'Medellín',
            department: 'Antioquia',
            address: 'Calle 1 # 2-3',
          },
        },
      }),
      transition: vi
        .fn()
        .mockResolvedValue({ id: 'order-1', status: 'confirmed' }),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
      orders,
    );
    await service.process({
      whatsappMessageId: 'wamid.notes',
      customerPhone: '+573001234567',
      text: 'ninguna',
    });
    expect(conversations.setSummaryVersion).toHaveBeenCalledWith(
      'conversation-1',
      3,
    );
    expect(outbound.enqueueText).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining('PED-000123') }),
    );
    await service.process({
      whatsappMessageId: 'wamid.confirm',
      customerPhone: '+573001234567',
      text: 'confirmar',
    });
    expect(orders.transition).toHaveBeenCalledWith({
      orderId: 'order-1',
      action: 'confirm',
      summaryVersion: 3,
      idempotencyKey: 'whatsapp:wamid.confirm',
    });
    expect(outbound.enqueueText).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('quedó confirmado'),
      }),
    );
  });

  it('accepts only an imported locality in the selected department', async () => {
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: false,
        conversationId: 'conversation-1',
        state: 'awaiting_address',
        reply: 'Escribe la dirección completa de entrega.',
        activeOrderId: 'order-1',
        pendingDepartment: 'Antioquia',
        action: 'collect_locality',
        input: 'Medellín',
      }),
      returnToSize: vi.fn(),
      setState: vi.fn(),
    };
    const orders = { create: vi.fn(), update: vi.fn().mockResolvedValue({}) };
    const localities = {
      list: vi.fn().mockResolvedValue({
        items: [
          {
            carrierCode: '05001000',
            department: 'Antioquia',
            locality: 'Medellín',
          },
        ],
        nextAfterCode: null,
      }),
    };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      { enqueueText: vi.fn(), enqueueImage: vi.fn() },
      orders,
      localities,
    );
    await service.process({
      whatsappMessageId: 'wamid.locality',
      customerPhone: '+573001234567',
      text: 'Medellín',
    });
    expect(localities.list).toHaveBeenCalledWith({
      department: 'Antioquia',
      query: 'Medellín',
      limit: 10,
    });
    expect(orders.update).toHaveBeenCalledWith({
      orderId: 'order-1',
      localityCarrierCode: '05001000',
    });
  });
});
