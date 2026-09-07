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
});
