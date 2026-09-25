import { describe, expect, it, vi } from 'vitest';

import { WhatsAppSalesService } from '../src/modules/conversations/whatsapp-sales-service.js';
import { OrderConflictError } from '../src/modules/orders/order-errors.js';
import { createDefaultBotFlow } from '../src/modules/conversations/flow-definition.js';

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
  it('sends the pinned custom size prompt once after a successful product cancellation', async () => {
    const flow = createDefaultBotFlow();
    flow.steps.size = {
      enabled: true,
      message: 'Dime tu talla KAIRO personalizada.',
    };
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: false,
        conversationId: 'c1',
        state: 'awaiting_size',
        reply: null,
        action: 'edit_product',
        activeOrderId: 'o1',
        flow,
        variables: { pedido: 'PED-000008' },
      }),
      returnToSize: vi.fn(),
      clearActiveOrder: vi.fn(),
    };
    const orders = {
      create: vi.fn(),
      transition: vi.fn().mockResolvedValue({ status: 'cancelled' }),
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
      whatsappMessageId: 'custom-product-edit',
      customerPhone: '573000000001',
      text: 'cambiar producto',
    });
    expect(conversations.clearActiveOrder).toHaveBeenCalledWith('c1', 'o1');
    expect(outbound.enqueueText).toHaveBeenCalledTimes(1);
    expect(outbound.enqueueText.mock.calls[0]?.[0].body).toContain(
      'Dime tu talla KAIRO personalizada.',
    );
    expect(outbound.enqueueText.mock.calls[0]?.[0].idempotencyKey).toBe(
      'product-restart:custom-product-edit',
    );
  });
  it('does not ask for a new size when product cancellation fails', async () => {
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: false,
        conversationId: 'c1',
        state: 'awaiting_size',
        reply: 'Confirma la talla que buscas.',
        action: 'edit_product',
        activeOrderId: 'o1',
      }),
      returnToSize: vi.fn(),
      clearActiveOrder: vi.fn(),
      takeOver: vi.fn(),
    };
    const orders = {
      create: vi.fn(),
      transition: vi.fn().mockRejectedValue(new Error('cancel failed')),
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
      whatsappMessageId: 'failed-product-edit',
      customerPhone: '573000000001',
      text: 'cambiar producto',
    });
    expect(conversations.clearActiveOrder).not.toHaveBeenCalled();
    expect(conversations.takeOver).toHaveBeenCalledWith('c1');
    expect(outbound.enqueueText).toHaveBeenCalledTimes(1);
    expect(outbound.enqueueText.mock.calls[0]?.[0].body).not.toMatch(/talla/i);
  });
  it('requotes an edited address and sends a new summary with edit commands', async () => {
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: false,
        conversationId: 'c1',
        state: 'awaiting_address',
        reply: null,
        action: 'collect_address',
        summaryEditAction: 'edit_address',
        input: 'Carrera 9 # 10-11',
        activeOrderId: 'o1',
      }),
      returnToSize: vi.fn(),
      publishSummary: vi.fn().mockResolvedValue(true),
      setState: vi.fn(),
    };
    const orders = {
      create: vi.fn(),
      update: vi.fn(),
      createSummary: vi.fn().mockResolvedValue({
        version: 4,
        snapshot: {
          totalCop: 130000,
          shippingCostCop: 10000,
          shippingQuote: { carrier: 'envia' },
          destination: { address: 'Carrera 9 # 10-11' },
        },
      }),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const shipping = { createQuotes: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
      orders,
      undefined,
      undefined,
      shipping,
    );
    await service.process({
      whatsappMessageId: 'edit-address',
      customerPhone: '573000000001',
      text: 'Carrera 9 # 10-11',
    });
    expect(orders.update).toHaveBeenCalledWith({
      orderId: 'o1',
      address: 'Carrera 9 # 10-11',
    });
    expect(shipping.createQuotes).toHaveBeenCalledWith('o1');
    expect(conversations.publishSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'c1',
        orderId: 'o1',
        version: 4,
        expectedState: 'awaiting_address',
        expectedEditAction: 'edit_address',
        expectedGeneration: 0,
        body: expect.stringMatching(
          /cambiar dirección[\s\S]*cambiar municipio[\s\S]*cambiar producto/i,
        ),
      }),
    );
  });

  it('validates an edited municipality in the saved department, then requotes', async () => {
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: false,
        conversationId: 'c1',
        state: 'awaiting_locality',
        reply: null,
        action: 'collect_locality',
        summaryEditAction: 'edit_locality',
        input: 'Medellín',
        activeOrderId: 'o1',
        pendingDepartment: 'Antioquia',
      }),
      returnToSize: vi.fn(),
      publishSummary: vi.fn().mockResolvedValue(true),
      setState: vi.fn(),
    };
    const orders = {
      create: vi.fn(),
      update: vi.fn(),
      createSummary: vi.fn().mockResolvedValue({
        version: 5,
        snapshot: {
          totalCop: 140000,
          shippingCostCop: 20000,
          shippingQuote: { carrier: 'envia' },
        },
      }),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const shipping = { createQuotes: vi.fn() };
    const localities = {
      list: vi.fn().mockResolvedValue({
        items: [
          {
            carrierCode: '05001000',
            department: 'Antioquia',
            locality: 'Medellín',
          },
        ],
      }),
    };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
      orders,
      localities,
      undefined,
      shipping,
    );
    await service.process({
      whatsappMessageId: 'edit-locality',
      customerPhone: '573000000001',
      text: 'Medellín',
    });
    expect(localities.list).toHaveBeenCalledWith({
      department: 'Antioquia',
      query: 'Medellín',
      limit: 10,
    });
    expect(orders.update).toHaveBeenCalledWith({
      orderId: 'o1',
      localityCarrierCode: '05001000',
    });
    expect(shipping.createQuotes).toHaveBeenCalledWith('o1');
    expect(conversations.publishSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'c1',
        orderId: 'o1',
        version: 5,
        expectedState: 'awaiting_locality',
        expectedEditAction: 'edit_locality',
        expectedGeneration: 0,
      }),
    );
  });

  it('keeps an unknown edited municipality pending and offers at most three catalog names', async () => {
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: false,
        conversationId: 'c1',
        state: 'awaiting_locality',
        reply: null,
        action: 'collect_locality',
        summaryEditAction: 'edit_locality',
        input: 'Belx',
        activeOrderId: 'o1',
        pendingDepartment: 'Antioquia',
      }),
      returnToSize: vi.fn(),
      setState: vi.fn(),
      setLocalitySuggestions: vi.fn().mockResolvedValue(false),
    };
    const orders = { create: vi.fn(), update: vi.fn(), createSummary: vi.fn() };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const localities = {
      list: vi.fn().mockResolvedValue({
        items: ['Bello', 'Belmira', 'Belén', 'Berlín'].map((locality) => ({
          carrierCode: '05001000',
          department: 'Antioquia',
          locality,
        })),
      }),
    };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
      orders,
      localities,
    );
    await service.process({
      whatsappMessageId: 'unknown-edited-locality',
      customerPhone: '573000000001',
      text: 'Belx',
    });
    expect(conversations.setLocalitySuggestions).toHaveBeenCalledWith(
      'c1',
      ['Bello', 'Belmira', 'Belén'],
      'unknown-edited-locality',
      expect.stringMatching(/Una asesora continuará/i),
    );
    expect(orders.update).not.toHaveBeenCalled();
    expect(orders.createSummary).not.toHaveBeenCalled();
    expect(outbound.enqueueText).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringMatching(
          /1\. Bello[\s\S]*2\. Belmira[\s\S]*3\. Belén/,
        ),
      }),
    );
    expect(outbound.enqueueText.mock.calls[0]?.[0].body).not.toContain(
      'Berlín',
    );
  });

  it('replays a product edit as a product restart, not a plain cancellation', async () => {
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: true,
        conversationId: 'c1',
        state: 'awaiting_size',
        reply: null,
        action: 'edit_product',
        activeOrderId: 'o1',
      }),
      returnToSize: vi.fn(),
      clearActiveOrder: vi.fn(),
    };
    const orders = {
      create: vi.fn(),
      get: vi.fn().mockResolvedValue({ status: 'draft', orderNumber: 8 }),
      transition: vi.fn(),
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
      whatsappMessageId: 'edit-product',
      customerPhone: '573000000001',
      text: 'cambiar producto',
    });
    expect(orders.transition).toHaveBeenCalledWith({
      orderId: 'o1',
      action: 'cancel',
      idempotencyKey: 'whatsapp:edit-product',
    });
    expect(conversations.clearActiveOrder).toHaveBeenCalledWith('c1', 'o1');
    expect(outbound.enqueueText).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringMatching(/Cancelé el pedido.*referencia.*talla/is),
        idempotencyKey: 'product-restart:edit-product',
      }),
    );
  });
  it('cancels the active draft, clears its snapshot, and replies once with its id', async () => {
    const conversations = {
      receive: vi
        .fn()
        .mockResolvedValueOnce({
          duplicate: false,
          conversationId: 'c1',
          state: 'awaiting_size',
          reply: null,
          action: 'cancel_order',
          activeOrderId: 'o1',
        })
        .mockResolvedValueOnce({
          duplicate: true,
          state: 'awaiting_size',
          reply: null,
        }),
      returnToSize: vi.fn(),
      clearActiveOrder: vi.fn(),
    };
    const orders = {
      create: vi.fn(),
      transition: vi.fn().mockResolvedValue({ id: 'o1', status: 'cancelled' }),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const guides = { enqueue: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
      orders,
      undefined,
      guides,
    );
    const message = {
      whatsappMessageId: 'cancel-1',
      customerPhone: '573000000001',
      text: 'cancelar',
    };

    await service.process(message);
    await service.process(message);

    expect(orders.transition).toHaveBeenCalledExactlyOnceWith({
      orderId: 'o1',
      action: 'cancel',
      idempotencyKey: 'whatsapp:cancel-1',
    });
    expect(conversations.clearActiveOrder).toHaveBeenCalledExactlyOnceWith(
      'c1',
      'o1',
    );
    expect(outbound.enqueueText).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        body: 'Cancelé el pedido o1. Si quieres empezar otro, dime tu talla.',
        idempotencyKey: 'cancelled:cancel-1',
      }),
    );
    expect(guides.enqueue).not.toHaveBeenCalled();
  });

  it('hands cancellation failures to an operator without claiming success', async () => {
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: false,
        conversationId: 'c1',
        state: 'awaiting_size',
        reply: null,
        action: 'cancel_order',
        activeOrderId: 'o1',
      }),
      returnToSize: vi.fn(),
      clearActiveOrder: vi.fn(),
      takeOver: vi.fn(),
    };
    const orders = {
      create: vi.fn(),
      transition: vi.fn().mockRejectedValue(new Error('database unavailable')),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const alerts = { open: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
      orders,
      undefined,
      undefined,
      undefined,
      alerts,
    );

    await service.process({
      whatsappMessageId: 'cancel-failed',
      customerPhone: '573000000001',
      text: 'cancelar',
    });

    expect(conversations.clearActiveOrder).not.toHaveBeenCalled();
    expect(conversations.takeOver).toHaveBeenCalledExactlyOnceWith('c1');
    expect(alerts.open).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'order_cancellation_attention',
        entityId: 'o1',
        severity: 'critical',
      }),
    );
    expect(outbound.enqueueText).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        source: 'owner_panel',
        body: expect.stringMatching(/revisará/i),
      }),
    );
    expect(outbound.enqueueText.mock.calls[0]?.[0].body).not.toMatch(/Cancelé/);
  });

  it('states that cancellation succeeded when clearing its active link fails', async () => {
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: false,
        conversationId: 'c1',
        state: 'awaiting_size',
        reply: null,
        action: 'cancel_order',
        activeOrderId: 'o1',
      }),
      returnToSize: vi.fn(),
      clearActiveOrder: vi
        .fn()
        .mockRejectedValue(new Error('link write failed')),
      takeOver: vi.fn(),
    };
    const orders = {
      create: vi.fn(),
      transition: vi.fn().mockResolvedValue({ id: 'o1', status: 'cancelled' }),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const alerts = { open: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
      orders,
      undefined,
      undefined,
      undefined,
      alerts,
    );

    await service.process({
      whatsappMessageId: 'clear-failed',
      customerPhone: '573000000001',
      text: 'cancelar',
    });

    expect(conversations.takeOver).toHaveBeenCalledExactlyOnceWith('c1');
    expect(alerts.open).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'order_cancellation_attention',
        entityId: 'o1',
        severity: 'critical',
      }),
    );
    expect(outbound.enqueueText).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        body: expect.stringMatching(/cancelado.*revisará/is),
        source: 'owner_panel',
      }),
    );
    expect(outbound.enqueueText.mock.calls[0]?.[0].body).not.toMatch(
      /No se completó/,
    );
  });

  it('records an alert even if both cancellation replies fail to enqueue', async () => {
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: false,
        conversationId: 'c1',
        state: 'awaiting_size',
        reply: null,
        action: 'cancel_order',
        activeOrderId: 'o1',
      }),
      returnToSize: vi.fn(),
      clearActiveOrder: vi.fn(),
      takeOver: vi.fn(),
    };
    const orders = {
      create: vi.fn(),
      transition: vi.fn().mockResolvedValue({ id: 'o1', status: 'cancelled' }),
    };
    const outbound = {
      enqueueText: vi.fn().mockRejectedValue(new Error('outbox unavailable')),
      enqueueImage: vi.fn(),
    };
    const alerts = { open: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
      orders,
      undefined,
      undefined,
      undefined,
      alerts,
    );

    await expect(
      service.process({
        whatsappMessageId: 'reply-failed',
        customerPhone: '573000000001',
        text: 'cancelar',
      }),
    ).rejects.toThrow('outbox unavailable');

    expect(conversations.takeOver).toHaveBeenCalledExactlyOnceWith('c1');
    expect(outbound.enqueueText).toHaveBeenCalledTimes(2);
    expect(outbound.enqueueText.mock.calls[1]?.[0].body).toMatch(
      /cancelado.*revisará/is,
    );
    expect(alerts.open).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'order_cancellation_attention',
        entityId: 'o1',
        severity: 'critical',
      }),
    );
  });
  it('reopens confirmation when a quote expires without creating a guide', async () => {
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: false,
        conversationId: 'c1',
        state: 'completed',
        reply: null,
        action: 'confirm_order',
        activeOrderId: 'o1',
        activeSummaryVersion: 3,
      }),
      returnToSize: vi.fn(),
      setState: vi.fn(),
      publishSummary: vi.fn().mockResolvedValue(true),
    };
    const orders = {
      create: vi.fn(),
      transition: vi
        .fn()
        .mockRejectedValue(
          new OrderConflictError('shipping_quote_expired', 'Expired'),
        ),
      createSummary: vi.fn().mockResolvedValue({
        version: 4,
        snapshot: {
          orderNumber: 'PED-1',
          reference: { code: '01', modelName: 'Tenis', color: 'Negro' },
          size: '37.0',
          quantity: 1,
          totalCop: 140000,
          shippingCostCop: 20000,
          shippingQuote: { carrier: 'envia' },
          customer: { name: 'Ana', phone: '573000000001' },
          destination: {
            locality: 'Medellín',
            department: 'Antioquia',
            address: 'Calle 1',
          },
        },
      }),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const guides = { enqueue: vi.fn() };
    const shipping = { createQuotes: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
      orders,
      undefined,
      guides,
      shipping,
    );
    await service.process({
      whatsappMessageId: 'expired-confirmation',
      customerPhone: '573000000001',
      text: 'confirmar',
    });
    expect(shipping.createQuotes).toHaveBeenCalledWith('o1');
    expect(conversations.publishSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'c1',
        orderId: 'o1',
        version: 4,
        expectedState: 'completed',
        expectedEditAction: null,
        expectedGeneration: 0,
      }),
    );
    expect(guides.enqueue).not.toHaveBeenCalled();
    expect(outbound.enqueueText).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining('venció') }),
    );
  });
  it('keeps the handover acknowledgement deliverable after automation pauses', async () => {
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const service = new WhatsAppSalesService(
      {
        receive: vi.fn().mockResolvedValue({
          duplicate: false,
          conversationId: 'conversation-1',
          state: 'awaiting_size',
          reply: 'La propietaria continuará contigo.',
          action: 'human_takeover',
        }),
        returnToSize: vi.fn(),
      },
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
    );
    await service.process({
      whatsappMessageId: 'human-request',
      customerPhone: '573000000001',
      text: 'asesora',
    });
    expect(outbound.enqueueText).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'owner_panel',
        body: 'La propietaria continuará contigo.',
      }),
    );
  });
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
        body: expect.stringContaining(
          'Esa referencia no está en el menú vigente.',
        ),
      }),
    );
  });

  it('hands off an invalid reference on the second failure and retains the conversation', async () => {
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
      recordInvalidReference: vi.fn().mockResolvedValue(true),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const alerts = { open: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      {
        create: vi.fn(),
        findOption: vi.fn().mockResolvedValue(null),
        getNextCursor: vi.fn(),
      },
      outbound,
      undefined,
      undefined,
      undefined,
      undefined,
      alerts,
    );
    await service.process({
      whatsappMessageId: 'invalid-reference-twice',
      customerPhone: '573000000001',
      text: '99',
    });
    expect(conversations.recordInvalidReference).toHaveBeenCalledWith(
      'conversation-1',
      'invalid-reference-twice',
      expect.stringMatching(/Una asesora continuará/i),
    );
    expect(outbound.enqueueText).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'owner_panel',
        body: expect.stringMatching(/asesora|propietaria/i),
      }),
    );
    expect(alerts.open).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 'conversation-1',
      }),
    );
  });

  it('retries a persisted invalid-reference handoff after outbound enqueue fails', async () => {
    const handoffReply = 'Una asesora continuará la selección de referencia.';
    const conversations = {
      receive: vi
        .fn()
        .mockResolvedValueOnce({
          duplicate: false,
          conversationId: 'c1',
          state: 'showing_models',
          reply: null,
          action: 'select_reference',
          input: '99',
        })
        .mockResolvedValueOnce({
          duplicate: true,
          conversationId: 'c1',
          state: 'showing_models',
          reply: handoffReply,
          action: 'human_takeover',
        }),
      returnToSize: vi.fn(),
      recordInvalidReference: vi.fn().mockResolvedValue(true),
      completeInvalidHandoff: vi.fn(),
    };
    const outbound = {
      enqueueText: vi
        .fn()
        .mockRejectedValueOnce(new Error('queue unavailable'))
        .mockResolvedValue(undefined),
      enqueueImage: vi.fn(),
    };
    const alerts = { open: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      {
        create: vi.fn(),
        findOption: vi.fn().mockResolvedValue(null),
        getNextCursor: vi.fn(),
      },
      outbound,
      undefined,
      undefined,
      undefined,
      undefined,
      alerts,
    );
    const inbound = {
      whatsappMessageId: 'invalid-ref-replay',
      customerPhone: '573000000001',
      text: '99',
    };
    await expect(service.process(inbound)).rejects.toThrow('queue unavailable');
    await service.process(inbound);
    expect(conversations.recordInvalidReference).toHaveBeenCalledTimes(1);
    expect(outbound.enqueueText).toHaveBeenCalledTimes(2);
    expect(outbound.enqueueText.mock.calls[0]?.[0].idempotencyKey).toBe(
      'reply:invalid-ref-replay',
    );
    expect(outbound.enqueueText.mock.calls[1]?.[0]).toMatchObject({
      source: 'owner_panel',
      body: handoffReply,
      idempotencyKey: 'reply:invalid-ref-replay',
    });
    expect(alerts.open).toHaveBeenCalledTimes(1);
    expect(conversations.completeInvalidHandoff).toHaveBeenCalledTimes(1);
    expect(conversations.completeInvalidHandoff).toHaveBeenCalledWith(
      'c1',
      'invalid-ref-replay',
    );
  });

  it('retries a persisted invalid-locality handoff when the owner alert fails', async () => {
    const handoffReply = 'Una asesora confirmará el municipio del pedido.';
    const conversations = {
      receive: vi
        .fn()
        .mockResolvedValueOnce({
          duplicate: false,
          conversationId: 'c1',
          state: 'awaiting_locality',
          reply: null,
          action: 'collect_locality',
          input: 'Belx',
          activeOrderId: 'o1',
          pendingDepartment: 'Antioquia',
        })
        .mockResolvedValueOnce({
          duplicate: true,
          conversationId: 'c1',
          state: 'awaiting_locality',
          reply: handoffReply,
          action: 'human_takeover',
        }),
      returnToSize: vi.fn(),
      setLocalitySuggestions: vi.fn().mockResolvedValue(true),
      completeInvalidHandoff: vi.fn(),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const alerts = {
      open: vi
        .fn()
        .mockRejectedValueOnce(new Error('alert unavailable'))
        .mockResolvedValue(undefined),
    };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
      { create: vi.fn(), update: vi.fn() },
      { list: vi.fn().mockResolvedValue({ items: [] }) },
      undefined,
      undefined,
      alerts,
    );
    const inbound = {
      whatsappMessageId: 'invalid-city-replay',
      customerPhone: '573000000001',
      text: 'Belx',
    };
    await expect(service.process(inbound)).rejects.toThrow('alert unavailable');
    await service.process(inbound);
    expect(conversations.setLocalitySuggestions).toHaveBeenCalledTimes(1);
    expect(outbound.enqueueText).toHaveBeenCalledTimes(2);
    expect(outbound.enqueueText.mock.calls[0]?.[0].idempotencyKey).toBe(
      'reply:invalid-city-replay',
    );
    expect(outbound.enqueueText.mock.calls[1]?.[0].idempotencyKey).toBe(
      'reply:invalid-city-replay',
    );
    expect(alerts.open).toHaveBeenCalledTimes(2);
    expect(conversations.completeInvalidHandoff).toHaveBeenCalledTimes(1);
    expect(conversations.completeInvalidHandoff).toHaveBeenCalledWith(
      'c1',
      'invalid-city-replay',
    );
  });

  it('keeps a recovered handoff pending when the alert service is unavailable', async () => {
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: true,
        conversationId: 'c1',
        state: 'awaiting_locality',
        reply: 'Una asesora continuará contigo.',
        action: 'human_takeover',
      }),
      returnToSize: vi.fn(),
      completeInvalidHandoff: vi.fn(),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
    );
    await expect(
      service.process({
        whatsappMessageId: 'no-alert',
        customerPhone: '573000000001',
        text: '3',
      }),
    ).rejects.toThrow(/alerta/i);
    expect(conversations.completeInvalidHandoff).not.toHaveBeenCalled();
  });

  it('hands off after two unknown municipalities while preserving the current order', async () => {
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: false,
        conversationId: 'c1',
        state: 'awaiting_locality',
        reply: null,
        action: 'collect_locality',
        input: 'Belx',
        activeOrderId: 'o1',
        pendingDepartment: 'Antioquia',
      }),
      returnToSize: vi.fn(),
      setLocalitySuggestions: vi.fn().mockResolvedValue(true),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const alerts = { open: vi.fn() };
    const orders = { create: vi.fn(), update: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
      orders,
      {
        list: vi.fn().mockResolvedValue({
          items: [
            {
              carrierCode: '05001000',
              department: 'Antioquia',
              locality: 'Bello',
            },
          ],
        }),
      },
      undefined,
      undefined,
      alerts,
    );
    await service.process({
      whatsappMessageId: 'invalid-locality-twice',
      customerPhone: '573000000001',
      text: 'Belx',
    });
    expect(conversations.setLocalitySuggestions).toHaveBeenCalledWith(
      'c1',
      ['Bello'],
      'invalid-locality-twice',
      expect.stringMatching(/Una asesora continuará/i),
    );
    expect(orders.update).not.toHaveBeenCalled();
    expect(outbound.enqueueText).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'owner_panel',
        body: expect.stringMatching(/municipio|asesora/i),
      }),
    );
    expect(alerts.open).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'c1' }),
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
        customerId: 'customer-1',
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
        modelName: 'Tenis Camila',
        color: 'Negro',
        priceCop: 120000,
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
      customerId: 'customer-1',
    });
    expect(conversations.attachOrder).toHaveBeenCalledWith(
      'conversation-1',
      '11111111-1111-4111-8111-111111111111',
      'order-1',
    );
    expect(outbound.enqueueText).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Elegiste REF 01 · Tenis Camila. ¿Cuál es tu nombre completo?',
      }),
    );
  });

  it('creates a summary after delivery data and confirms with the inbound id', async () => {
    const flow = createDefaultBotFlow();
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
          flow,
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
      publishSummary: vi.fn().mockResolvedValue(true),
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
          productSubtotalCop: 120000,
          totalCop: 136968,
          shippingCostCop: 16968,
          shippingPending: false,
          shippingQuote: {
            id: '11111111-1111-4111-8111-111111111111',
            carrier: 'envia',
            serviceId: 12,
            freightCop: 13368,
            cashOnDeliveryCop: 3000,
            surchargeCop: 600,
            estimatedDays: '1',
            expiresAt: '2026-09-07T23:00:00.000Z',
          },
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
    const shipping = { createQuotes: vi.fn().mockResolvedValue([]) };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
      orders,
      undefined,
      undefined,
      shipping,
    );
    await service.process({
      whatsappMessageId: 'wamid.notes',
      customerPhone: '+573001234567',
      text: 'ninguna',
    });
    expect(conversations.publishSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-1',
        orderId: 'order-1',
        version: 3,
        expectedState: 'awaiting_confirmation',
        expectedEditAction: null,
        expectedGeneration: 0,
        body: [
          'Revisa el resumen de tu pedido.',
          '',
          'Pedido PED-000123',
          'REF 01 · Tenis Camila (Negro)',
          'Talla 37',
          'Productos: $120.000 COP',
          'Envío (envia): $16.968 COP',
          'Total contra entrega: $136.968 COP',
          'Cliente: Camila Pérez',
          'Dirección: Calle 1 # 2-3',
          'Medellín, Antioquia',
          '',
          '¿Confirmas tu pedido para reservarlo?',
          '• confirmar',
          '• cancelar',
          '• cambiar dirección',
          '• cambiar municipio',
          '• cambiar producto',
        ].join('\n'),
      }),
    );
    expect(shipping.createQuotes).toHaveBeenCalledWith('order-1');
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

  it('does not publish a confirmable summary or a final total without a shipping quote', async () => {
    const flow = createDefaultBotFlow();
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: false,
        conversationId: 'conversation-1',
        state: 'awaiting_confirmation',
        reply: null,
        activeOrderId: 'order-1',
        action: 'collect_notes',
        input: '',
        flow,
      }),
      returnToSize: vi.fn(),
      publishSummary: vi.fn(),
      handOverUnquotedSummary: vi.fn().mockResolvedValue(true),
    };
    const orders = {
      create: vi.fn(),
      createSummary: vi.fn().mockResolvedValue({
        version: 1,
        snapshot: {
          orderNumber: 'PED-000124',
          reference: { code: '01', modelName: 'Tenis Camila', color: 'Negro' },
          size: '37.0',
          productSubtotalCop: 120000,
          shippingCostCop: null,
          shippingPending: true,
          totalCop: 120000,
          customer: { name: 'Camila Pérez' },
          destination: {
            address: 'Calle 1 # 2-3',
            locality: 'Medellín',
            department: 'Antioquia',
          },
        },
      }),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const alerts = { open: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
      orders,
      undefined,
      undefined,
      { createQuotes: vi.fn() },
      alerts,
    );
    await service.process({
      whatsappMessageId: 'wamid.no-quote',
      customerPhone: '+573001234567',
      text: 'ninguna',
    });
    expect(conversations.publishSummary).not.toHaveBeenCalled();
    const body = conversations.handOverUnquotedSummary.mock.calls.at(-1)?.[0]
      .body as string;
    expect(body).toContain('Envío pendiente de cotización');
    expect(body).not.toContain('Total contra entrega');
    expect(body).not.toContain('• confirmar');
    expect(body).toContain('La propietaria revisará la cobertura');
    expect(conversations.handOverUnquotedSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'shipping-attention:wamid.no-quote',
      }),
    );
    expect(alerts.open).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'shipping_quote_attention',
        entityId: 'order-1',
      }),
    );
  });

  it('does not send a delayed unquoted review after a newer conversation generation', async () => {
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: false,
        conversationId: 'conversation-1',
        state: 'awaiting_confirmation',
        reply: null,
        activeOrderId: 'order-1',
        summaryGeneration: 3,
        summaryEditAction: null,
        action: 'collect_notes',
      }),
      returnToSize: vi.fn(),
      publishSummary: vi.fn(),
      handOverUnquotedSummary: vi.fn().mockResolvedValue(false),
      takeOver: vi.fn(),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const alerts = { open: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
      {
        create: vi.fn(),
        createSummary: vi.fn().mockResolvedValue({
          version: 2,
          snapshot: {
            shippingPending: true,
            shippingCostCop: null,
            totalCop: 120000,
          },
        }),
      },
      undefined,
      undefined,
      { createQuotes: vi.fn() },
      alerts,
    );
    await service.process({
      whatsappMessageId: 'wamid.stale-no-quote',
      customerPhone: '+573001234567',
      text: 'ninguna',
    });
    expect(conversations.handOverUnquotedSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-1',
        orderId: 'order-1',
        expectedState: 'awaiting_confirmation',
        expectedGeneration: 3,
        expectedEditAction: null,
      }),
    );
    expect(conversations.takeOver).not.toHaveBeenCalled();
    expect(outbound.enqueueText).not.toHaveBeenCalled();
    expect(alerts.open).not.toHaveBeenCalled();
  });

  it('does not hand over a reset conversation after an earlier shipping failure', async () => {
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: false,
        conversationId: 'conversation-1',
        state: 'awaiting_confirmation',
        reply: null,
        activeOrderId: 'order-1',
        summaryGeneration: 4,
        action: 'collect_notes',
      }),
      returnToSize: vi.fn(),
      publishSummary: vi.fn(),
      handOverUnquotedSummary: vi.fn().mockResolvedValue(false),
      takeOver: vi.fn(),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const alerts = { open: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
      { create: vi.fn(), createSummary: vi.fn() },
      undefined,
      undefined,
      { createQuotes: vi.fn().mockRejectedValue(new Error('no coverage')) },
      alerts,
    );
    await service.process({
      whatsappMessageId: 'wamid.stale-quote-error',
      customerPhone: '+573001234567',
      text: 'ninguna',
    });
    expect(conversations.handOverUnquotedSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedGeneration: 4,
        idempotencyKey: 'shipping-attention:wamid.stale-quote-error',
      }),
    );
    expect(conversations.takeOver).not.toHaveBeenCalled();
    expect(outbound.enqueueText).not.toHaveBeenCalled();
    expect(alerts.open).not.toHaveBeenCalled();
  });

  it('keeps the legacy shipping-selection path unconfirmable when its selected quote disappears', async () => {
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: false,
        conversationId: 'conversation-1',
        state: 'awaiting_shipping',
        reply: null,
        activeOrderId: 'order-1',
        action: 'select_shipping',
        input: '1',
      }),
      returnToSize: vi.fn(),
      publishSummary: vi.fn(),
      handOverUnquotedSummary: vi.fn().mockResolvedValue(true),
    };
    const orders = {
      create: vi.fn(),
      createSummary: vi.fn().mockResolvedValue({
        version: 2,
        snapshot: {
          orderNumber: 'PED-000125',
          shippingCostCop: null,
          shippingPending: true,
          totalCop: 120000,
        },
      }),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const shipping = {
      createQuotes: vi.fn(),
      getShipping: vi.fn().mockResolvedValue({
        quotes: [
          {
            id: 'quote-1',
            carrier: 'envia',
            freightCop: 10000,
            cashOnDeliveryCop: 0,
            surchargeCop: 0,
            insuranceCop: 0,
            insuranceMode: 'none',
            recommended: true,
            selected: false,
          },
        ],
        guide: null,
      }),
      selectQuote: vi.fn(),
    };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
      orders,
      undefined,
      undefined,
      shipping,
    );
    await service.process({
      whatsappMessageId: 'wamid.legacy-no-quote',
      customerPhone: '+573001234567',
      text: '1',
    });
    expect(shipping.selectQuote).toHaveBeenCalledWith('order-1', 'quote-1');
    expect(conversations.publishSummary).not.toHaveBeenCalled();
    expect(conversations.handOverUnquotedSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.not.stringContaining('• confirmar'),
      }),
    );
  });

  it('uses the owner-configured shipping recommendation before the summary', async () => {
    const quotes = [
      {
        id: 'economy',
        carrier: 'envia',
        freightCop: 10000,
        cashOnDeliveryCop: 2000,
        surchargeCop: 0,
        insuranceCop: 0,
        insuranceMode: 'none',
        recommended: true,
        selected: false,
      },
      {
        id: 'protected',
        carrier: 'tcc',
        freightCop: 12000,
        cashOnDeliveryCop: 2000,
        surchargeCop: 0,
        insuranceCop: 3000,
        insuranceMode: 'plus',
        recommended: true,
        selected: false,
      },
    ];
    const conversations = {
      receive: vi.fn().mockResolvedValue({
        duplicate: false,
        conversationId: 'conversation-1',
        state: 'awaiting_confirmation',
        reply: null,
        activeOrderId: 'order-1',
        action: 'collect_notes',
        input: '',
      }),
      returnToSize: vi.fn(),
      setState: vi.fn(),
      publishSummary: vi.fn().mockResolvedValue(true),
    };
    const orders = {
      create: vi.fn(),
      createSummary: vi.fn().mockResolvedValue({
        version: 4,
        snapshot: {
          totalCop: 137000,
          shippingCostCop: 17000,
          shippingQuote: { carrier: 'tcc' },
        },
      }),
    };
    const shipping = {
      createQuotes: vi.fn().mockResolvedValue(quotes),
      getShipping: vi.fn().mockResolvedValue({ quotes, guide: null }),
      selectQuote: vi.fn(),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
      orders,
      undefined,
      undefined,
      shipping,
    );

    await service.process({
      whatsappMessageId: 'wamid.notes',
      customerPhone: '+573001234567',
      text: 'ninguna',
    });
    expect(orders.createSummary).toHaveBeenCalledWith('order-1');
    expect(conversations.publishSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-1',
        orderId: 'order-1',
        version: 4,
        expectedState: 'awaiting_confirmation',
        expectedEditAction: null,
        expectedGeneration: 0,
        body: expect.stringContaining('confirmar'),
      }),
    );
    expect(shipping.selectQuote).not.toHaveBeenCalled();
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
