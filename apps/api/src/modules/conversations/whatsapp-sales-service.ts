import type {
  AvailableCatalogItem,
  AvailableCatalogPage,
} from '../catalog/catalog-types.js';
import type {
  CreateOrderInput,
  OrderRecord,
  OrderSummary,
  PatchOrderInput,
} from '../orders/order-types.js';
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
  attachOrder?(
    conversationId: string,
    referenceId: string,
    orderId: string,
  ): Promise<void>;
  setSummaryVersion?(conversationId: string, version: number): Promise<void>;
  setState?(conversationId: string, state: string): Promise<void>;
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

type OrderPort = Readonly<{
  create(input: CreateOrderInput): Promise<Pick<OrderRecord, 'id'>>;
  update?(input: PatchOrderInput): Promise<unknown>;
  createSummary?(orderId: string): Promise<OrderSummary>;
  transition?(input: {
    orderId: string;
    action: 'confirm' | 'cancel';
    summaryVersion?: number;
    idempotencyKey?: string;
  }): Promise<unknown>;
}>;

type LocalityPort = Readonly<{
  list(input: { department: string; query: string; limit: number }): Promise<{
    items: readonly Readonly<{
      carrierCode: string;
      department: string;
      locality: string;
    }>[];
  }>;
}>;

function displaySize(size: string): string {
  return size.endsWith('.0') ? size.slice(0, -2) : size;
}

function formatCop(value: number): string {
  return `$${new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
  }).format(value)}`;
}

function summaryText(summary: OrderSummary): string {
  const snapshot = summary.snapshot as {
    orderNumber?: string;
    reference?: { code?: string; modelName?: string; color?: string };
    size?: string;
    totalCop?: number;
    customer?: { name?: string };
    destination?: { locality?: string; department?: string; address?: string };
  };
  return [
    `Resumen ${snapshot.orderNumber ?? ''}`.trim(),
    `REF ${snapshot.reference?.code ?? ''} · ${snapshot.reference?.modelName ?? ''} · ${snapshot.reference?.color ?? ''}`,
    `Talla ${displaySize(snapshot.size ?? '')} · Total ${formatCop(snapshot.totalCop ?? 0)}`,
    `Cliente: ${snapshot.customer?.name ?? ''}`,
    `Entrega: ${snapshot.destination?.address ?? ''}, ${snapshot.destination?.locality ?? ''}, ${snapshot.destination?.department ?? ''}`,
    'Pago contra entrega. Responde “confirmar” para reservar o “cancelar”.',
  ].join('\n');
}

export class WhatsAppSalesService {
  constructor(
    private readonly conversations: ConversationPort,
    private readonly catalog: CatalogPort,
    private readonly menus: MenuPort,
    private readonly outbound: OutboundPort,
    private readonly orders?: OrderPort,
    private readonly localities?: LocalityPort,
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
      } else if (
        this.orders !== undefined &&
        this.conversations.attachOrder !== undefined &&
        result.selectedSize !== undefined &&
        result.selectedSize !== null
      ) {
        const order = await this.orders.create({
          referenceId: option.referenceId,
          size: result.selectedSize,
          quantity: 1,
          customerPhone: input.customerPhone,
        });
        await this.conversations.attachOrder(
          result.conversationId,
          option.referenceId,
          order.id,
        );
        await this.queueText(
          result.conversationId,
          input,
          `Perfecto, elegiste la REF ${option.code}. ¿Cuál es tu nombre completo?`,
          'reference-selected',
        );
      }
    }
    if (
      result.activeOrderId !== undefined &&
      result.activeOrderId !== null &&
      this.orders?.update !== undefined
    ) {
      const patch = this.orderPatchFor(result, result.activeOrderId);
      if (patch !== null) await this.orders.update(patch);
    }
    if (
      result.action === 'collect_locality' &&
      result.input !== undefined &&
      result.pendingDepartment != null &&
      result.activeOrderId != null &&
      this.localities !== undefined &&
      this.orders?.update !== undefined
    ) {
      const page = await this.localities.list({
        department: result.pendingDepartment,
        query: result.input,
        limit: 10,
      });
      const normalized = result.input
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLocaleLowerCase('es-CO');
      const locality = page.items.find(
        (item) =>
          item.locality
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .toLocaleLowerCase('es-CO') === normalized,
      );
      if (locality === undefined) {
        await this.conversations.setState?.(
          result.conversationId,
          'awaiting_locality',
        );
        await this.queueText(
          result.conversationId,
          input,
          'No encontré esa ciudad o municipio en el listado de envíos. Escríbelo de nuevo.',
          'unknown-locality',
        );
      } else {
        await this.orders.update({
          orderId: result.activeOrderId,
          localityCarrierCode: locality.carrierCode,
        });
        await this.queueText(
          result.conversationId,
          input,
          'Escribe la dirección completa de entrega.',
          'locality-selected',
        );
      }
    }
    if (
      result.action === 'collect_notes' &&
      result.activeOrderId != null &&
      this.orders?.createSummary !== undefined &&
      this.conversations.setSummaryVersion !== undefined
    ) {
      const summary = await this.orders.createSummary(result.activeOrderId);
      await this.conversations.setSummaryVersion(
        result.conversationId,
        summary.version,
      );
      await this.queueText(
        result.conversationId,
        input,
        summaryText(summary),
        `summary:${summary.version}`,
      );
    }
    if (
      result.action === 'confirm_order' &&
      result.activeOrderId != null &&
      result.activeSummaryVersion != null &&
      this.orders?.transition !== undefined
    ) {
      await this.orders.transition({
        orderId: result.activeOrderId,
        action: 'confirm',
        summaryVersion: result.activeSummaryVersion,
        idempotencyKey: `whatsapp:${input.whatsappMessageId}`,
      });
      await this.queueText(
        result.conversationId,
        input,
        '¡Listo! Tu pedido quedó confirmado y la unidad fue reservada. Te avisaremos cuando se genere la guía.',
        'confirmed',
      );
    }
  }

  private orderPatchFor(
    result: ReceiveConversationResult,
    orderId: string,
  ): PatchOrderInput | null {
    if (result.input === undefined) return null;
    switch (result.action) {
      case 'collect_name':
        return { orderId, customerName: result.input };
      case 'collect_phone':
        return { orderId, customerPhone: result.input };
      case 'collect_address':
        return { orderId, address: result.input };
      case 'collect_notes':
        return { orderId, deliveryNotes: result.input || null };
      default:
        return null;
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
