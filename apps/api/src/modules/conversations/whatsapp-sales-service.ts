import type {
  AvailableCatalogItem,
  AvailableCatalogPage,
} from '../catalog/catalog-types.js';
import type {
  EnqueueImageInput,
  EnqueueTextInput,
} from '../whatsapp/postgres-outbound-repository.js';
import type {
  ReceiveConversationInput,
  ReceiveConversationResult,
} from './postgres-conversation-repository.js';

type ConversationPort = Readonly<{
  receive(input: ReceiveConversationInput): Promise<ReceiveConversationResult>;
  returnToSize(conversationId: string): Promise<void>;
}>;

type CatalogPort = Readonly<{
  listAvailableForConfirmedSize(input: {
    confirmedSize: string;
    afterCode?: string;
  }): Promise<AvailableCatalogPage>;
}>;

export type MenuRecord = Readonly<{ id: string; version: number }>;
type MenuPort = Readonly<{
  create(input: {
    conversationId: string;
    confirmedSize: string;
    items: readonly AvailableCatalogItem[];
    nextAfterCode: string | null;
  }): Promise<MenuRecord>;
  findOption(
    conversationId: string,
    input: string,
  ): Promise<Readonly<{ referenceId: string; code: string }> | null>;
  getNextCursor(conversationId: string): Promise<string | null>;
}>;

type OutboundPort = Readonly<{
  enqueueText(input: EnqueueTextInput): Promise<unknown>;
  enqueueImage(input: EnqueueImageInput): Promise<unknown>;
}>;

function displaySize(size: string): string {
  return size.endsWith('.0') ? size.slice(0, -2) : size;
}

function formatCop(value: number): string {
  return `$${new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
  }).format(value)}`;
}

export class WhatsAppSalesService {
  constructor(
    private readonly conversations: ConversationPort,
    private readonly catalog: CatalogPort,
    private readonly menus: MenuPort,
    private readonly outbound: OutboundPort,
  ) {}

  async process(input: ReceiveConversationInput): Promise<void> {
    const result = await this.conversations.receive(input);
    if (result.duplicate || result.conversationId === undefined) return;
    if (result.reply !== null) {
      await this.queueText(result.conversationId, input, result.reply, 'reply');
    }
    if (
      result.action === 'show_catalog' &&
      result.selectedSize !== undefined &&
      result.selectedSize !== null
    ) {
      await this.showCatalog(result.conversationId, input, result.selectedSize);
    }
    if (
      result.action === 'more_models' &&
      result.selectedSize !== undefined &&
      result.selectedSize !== null
    ) {
      const afterCode = await this.menus.getNextCursor(result.conversationId);
      if (afterCode === null) {
        await this.queueText(
          result.conversationId,
          input,
          'Ya viste todos los modelos disponibles en esa talla. Elige una referencia o cambia la talla.',
          'catalog-end',
        );
      } else {
        await this.showCatalog(
          result.conversationId,
          input,
          result.selectedSize,
          afterCode,
        );
      }
    }
    if (result.action === 'select_reference' && result.input !== undefined) {
      const option = await this.menus.findOption(
        result.conversationId,
        result.input,
      );
      if (option === null) {
        await this.queueText(
          result.conversationId,
          input,
          'Esa referencia no está en el menú vigente. Elige una de las fotos enviadas.',
          'invalid-reference',
        );
      }
    }
  }

  private async showCatalog(
    conversationId: string,
    inbound: ReceiveConversationInput,
    size: string,
    afterCode?: string,
  ): Promise<void> {
    const page = await this.catalog.listAvailableForConfirmedSize({
      confirmedSize: size,
      ...(afterCode === undefined ? {} : { afterCode }),
    });
    if (page.items.length === 0) {
      await this.conversations.returnToSize(conversationId);
      await this.queueText(
        conversationId,
        inbound,
        `No tenemos modelos disponibles en talla ${displaySize(size)}. Escribe otra talla.`,
        'no-stock',
      );
      return;
    }
    const menu = await this.menus.create({
      conversationId,
      confirmedSize: size,
      items: page.items,
      nextAfterCode: page.nextAfterCode,
    });
    for (const item of page.items) {
      await this.outbound.enqueueImage({
        conversationId,
        customerPhone: inbound.customerPhone,
        caption: `REF ${item.code} · ${item.modelName} · ${item.color} · ${formatCop(item.priceCop)} · Talla ${displaySize(size)}`,
        storageKey: item.photoStorageKey,
        mimeType: item.photoMimeType,
        idempotencyKey: `menu:${menu.id}:${item.referenceId}`,
      });
    }
    const more =
      page.nextAfterCode === null
        ? ''
        : ' También puedes escribir “más modelos”.';
    await this.queueText(
      conversationId,
      inbound,
      `Responde con la referencia que te gustó o “cambiar talla”.${more}`,
      `menu-prompt:${menu.version}`,
    );
  }

  private async queueText(
    conversationId: string,
    inbound: ReceiveConversationInput,
    body: string,
    suffix: string,
  ): Promise<void> {
    await this.outbound.enqueueText({
      conversationId,
      customerPhone: inbound.customerPhone,
      body,
      idempotencyKey: `${suffix}:${inbound.whatsappMessageId}`,
    });
  }
}
