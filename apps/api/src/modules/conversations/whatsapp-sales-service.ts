import { OrderConflictError } from '../orders/order-errors.js';
import type {
  AvailableCatalogItem,
  AvailableCatalogPage,
} from '../catalog/catalog-types.js';
import type { BotFlowDefinition } from './flow-definition.js';
import { renderFlowMessage } from './configured-flow.js';
import { ownerAvailabilityMessage } from './owner-service-hours.js';
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
  takeOver?(conversationId: string): Promise<void>;
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
    pageSize?: number;
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
  create(
    input: CreateOrderInput,
  ): Promise<
    Pick<OrderRecord, 'id'> & Partial<Pick<OrderRecord, 'orderNumber'>>
  >;
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

type ShippingGuideJobPort = Readonly<{
  enqueue(orderId: string): Promise<unknown>;
}>;

type ShippingQuotePort = Readonly<{
  createQuotes(orderId: string): Promise<unknown>;
  getShipping?(orderId: string): Promise<
    Readonly<{
      quotes: readonly ShippingChoice[];
      guide: unknown;
    }>
  >;
  selectQuote?(orderId: string, quoteId: string): Promise<unknown>;
}>;

type ShippingChoice = Readonly<{
  id: string;
  carrier: string;
  freightCop: number;
  cashOnDeliveryCop: number;
  surchargeCop: number;
  insuranceCop: number;
  insuranceMode: 'none' | 'standard' | 'plus';
  recommended: boolean;
  selected: boolean;
}>;

function displaySize(size: string): string {
  return size.endsWith('.0') ? size.slice(0, -2) : size;
}

function formatCop(value: number): string {
  return `$${new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
  }).format(value)}`;
}

function summaryText(summary: OrderSummary, flow?: BotFlowDefinition): string {
  const snapshot = summary.snapshot as {
    orderNumber?: string;
    reference?: { code?: string; modelName?: string; color?: string };
    size?: string;
    productSubtotalCop?: number;
    totalCop?: number;
    shippingCostCop?: number | null;
    shippingQuote?: {
      carrier?: string;
      insuranceMode?: 'none' | 'standard' | 'plus';
    };
    customer?: { name?: string };
    destination?: { locality?: string; department?: string; address?: string };
  };
  const shippingLine =
    snapshot.shippingCostCop == null
      ? 'Envío pendiente de cotización'
      : `Envío: ${flow?.optionalSteps.showCarrierInSummary === false ? '' : (snapshot.shippingQuote?.carrier ?? 'transportadora') + ' · '}${formatCop(snapshot.shippingCostCop)}${snapshot.shippingQuote?.insuranceMode && snapshot.shippingQuote.insuranceMode !== 'none' ? ` · Seguro ${snapshot.shippingQuote.insuranceMode === 'plus' ? '99 Plus' : '99 estándar'}` : ''}`;
  return [
    `Resumen ${snapshot.orderNumber ?? ''}`.trim(),
    `REF ${snapshot.reference?.code ?? ''} · ${snapshot.reference?.modelName ?? ''} · ${snapshot.reference?.color ?? ''}`,
    `Talla ${displaySize(snapshot.size ?? '')}`,
    `Productos: ${formatCop(snapshot.productSubtotalCop ?? 0)}`,
    shippingLine,
    `Total ${formatCop(snapshot.totalCop ?? 0)}`,
    `Cliente: ${snapshot.customer?.name ?? ''}`,
    `Entrega: ${snapshot.destination?.address ?? ''}, ${snapshot.destination?.locality ?? ''}, ${snapshot.destination?.department ?? ''}`,
    `Pago contra entrega. Responde “${flow?.commands.confirm ?? 'confirmar'}” para reservar o “${flow?.commands.cancel ?? 'cancelar'}”.`,
  ].join('\n');
}

// Retained only to finish conversations that were already waiting for a
// customer selection before automatic routing was enabled.
function shippingChoices(
  quotes: readonly ShippingChoice[],
): readonly ShippingChoice[] {
  return quotes
    .filter((quote) => quote.recommended)
    .sort((left, right) =>
      left.insuranceMode === 'none'
        ? -1
        : right.insuranceMode === 'none'
          ? 1
          : 0,
    );
}

export class WhatsAppSalesService {
  constructor(
    private readonly conversations: ConversationPort,
    private readonly catalog: CatalogPort,
    private readonly menus: MenuPort,
    private readonly outbound: OutboundPort,
    private readonly orders?: OrderPort,
    private readonly localities?: LocalityPort,
    private readonly shippingGuideJobs?: ShippingGuideJobPort,
    private readonly shippingQuotes?: ShippingQuotePort,
    private readonly alerts?: Readonly<{
      open(input: {
        type: string;
        severity: 'info' | 'warning' | 'critical';
        title: string;
        detail: string;
        entityUrl: string;
        entityId: string;
        retrySafe: boolean;
      }): Promise<unknown>;
    }>,
    private readonly getOwnerSettings?: () => Promise<
      Parameters<typeof ownerAvailabilityMessage>[0]
    >,
  ) {}

  async process(input: ReceiveConversationInput): Promise<void> {
    const result = await this.conversations.receive(input);
    if (result.duplicate || result.conversationId === undefined) return;
    if (result.reply !== null) {
      const availability =
        result.action === 'human_takeover' && this.getOwnerSettings
          ? ownerAvailabilityMessage(await this.getOwnerSettings())
          : '';
      await this.queueText(
        result.conversationId,
        input,
        [result.reply, availability].filter(Boolean).join('\n'),
        'reply',
        result.action === 'human_takeover' ? 'owner_panel' : undefined,
      );
    }
    if (result.action === 'human_takeover') {
      await this.alerts?.open({
        type: 'conversation_attention',
        severity: 'warning',
        title: 'Cliente solicita atención',
        detail:
          'La automatización quedó pausada. Abre la conversación para continuar y reanuda el bot cuando corresponda.',
        entityUrl: `/conversations?conversation=${result.conversationId}`,
        entityId: result.conversationId,
        retrySafe: false,
      });
      return;
    }
    if (
      result.action === 'show_catalog' &&
      result.selectedSize !== undefined &&
      result.selectedSize !== null
    ) {
      await this.showCatalog(
        result.conversationId,
        input,
        result.selectedSize,
        undefined,
        result.flow,
      );
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
          result.flow,
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
          ...(result.customerId === undefined
            ? {}
            : { customerId: result.customerId }),
        });
        await this.conversations.attachOrder(
          result.conversationId,
          option.referenceId,
          order.id,
        );
        await this.queueText(
          result.conversationId,
          input,
          result.flow === undefined
            ? `Perfecto, elegiste la REF ${option.code}. ¿Cuál es tu nombre completo?`
            : renderFlowMessage(result.flow.steps.name.message, {
                ...result.variables,
                talla: displaySize(result.selectedSize),
                pedido:
                  order.orderNumber === undefined
                    ? ''
                    : `PED-${String(order.orderNumber).padStart(6, '0')}`,
                referencia: option.code,
              }),
          'reference-selected',
        );
      }
    }
    if (
      result.activeOrderId !== undefined &&
      result.activeOrderId !== null &&
      this.orders?.update !== undefined
    ) {
      const patch = this.orderPatchFor(
        result,
        result.activeOrderId,
        input.customerPhone,
      );
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
        const suggestions = page.items
          .slice(0, 3)
          .map((item) => item.locality)
          .join(', ');
        await this.conversations.setState?.(
          result.conversationId,
          'awaiting_locality',
        );
        await this.queueText(
          result.conversationId,
          input,
          suggestions
            ? `No encontré esa ciudad o municipio exactamente. Opciones: ${suggestions}. Escribe el nombre completo de una opción.`
            : 'No encontré esa ciudad o municipio en el listado de envíos. Revisa la ortografía o escribe otro municipio del departamento.',
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
          result.flow
            ? renderFlowMessage(
                result.flow.steps.address.message,
                result.variables,
              )
            : 'Escribe la dirección completa de entrega.',
          'locality-selected',
        );
      }
    }
    if (
      (result.action === 'collect_notes' ||
        (result.action === 'collect_address' &&
          result.flow?.optionalSteps.notes === false)) &&
      result.activeOrderId != null &&
      this.orders?.createSummary !== undefined &&
      this.conversations.setSummaryVersion !== undefined
    ) {
      await this.prepareSummary(result, input);
    }
    if (
      result.action === 'select_shipping' &&
      result.input !== undefined &&
      result.activeOrderId != null &&
      this.shippingQuotes?.getShipping !== undefined &&
      this.shippingQuotes.selectQuote !== undefined &&
      this.orders?.createSummary !== undefined &&
      this.conversations.setSummaryVersion !== undefined
    ) {
      const shipping = await this.shippingQuotes.getShipping(
        result.activeOrderId,
      );
      const choices = shippingChoices(shipping.quotes);
      const selected = choices[Number(result.input) - 1];
      if (selected === undefined) {
        await this.conversations.setState?.(
          result.conversationId,
          'awaiting_shipping',
        );
        await this.queueText(
          result.conversationId,
          input,
          'Esa opción ya no está disponible. Responde 1 o 2.',
          'invalid-shipping-option',
        );
        return;
      }
      await this.shippingQuotes.selectQuote(result.activeOrderId, selected.id);
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
      try {
        await this.orders.transition({
          orderId: result.activeOrderId,
          action: 'confirm',
          summaryVersion: result.activeSummaryVersion,
          idempotencyKey: `whatsapp:${input.whatsappMessageId}`,
        });
      } catch (error) {
        if (
          error instanceof OrderConflictError &&
          [
            'shipping_quote_expired',
            'shipping_quote_stale',
            'stale_summary',
          ].includes(error.code)
        ) {
          await this.queueText(
            result.conversationId,
            input,
            'La cotización venció o cambió. Revisa el nuevo total y confirma nuevamente.',
            'quote-refresh',
          );
          await this.prepareSummary(result, input);
          return;
        }
        await this.conversations.takeOver?.(result.conversationId);
        await this.outbound.enqueueText({
          conversationId: result.conversationId,
          customerPhone: input.customerPhone,
          body: 'La propietaria revisará tu pedido antes de continuar.',
          source: 'owner_panel',
          idempotencyKey: `confirmation-attention:${input.whatsappMessageId}`,
        });
        await this.alerts?.open({
          type: 'order_confirmation_attention',
          severity: 'critical',
          title: 'Revisar confirmación de pedido',
          detail:
            'No se completó la confirmación. Revisar disponibilidad y estado antes de continuar.',
          entityUrl: `/orders/${result.activeOrderId}`,
          entityId: result.activeOrderId,
          retrySafe: false,
        });
        return;
      }
      await this.shippingGuideJobs?.enqueue(result.activeOrderId);
      await this.queueText(
        result.conversationId,
        input,
        (result.flow
          ? renderFlowMessage(
              result.flow.steps.complete.message,
              result.variables,
            )
          : undefined) ??
          '¡Listo! Tu pedido quedó confirmado y la unidad fue reservada. Te avisaremos cuando se genere la guía.',
        'confirmed',
      );
    }
  }

  private async prepareSummary(
    result: ReceiveConversationResult,
    input: ReceiveConversationInput,
  ): Promise<void> {
    if (result.conversationId === undefined) return;
    if (
      result.activeOrderId == null ||
      this.orders?.createSummary === undefined ||
      this.conversations.setSummaryVersion === undefined
    ) {
      await this.conversations.takeOver?.(result.conversationId);
      return;
    }
    try {
      if (result.flow)
        await this.queueText(
          result.conversationId,
          input,
          renderFlowMessage(result.flow.steps.quote.message, result.variables),
          'quoting',
        );
      await this.shippingQuotes?.createQuotes(result.activeOrderId);
    } catch {
      await this.conversations.takeOver?.(result.conversationId);
      await this.outbound.enqueueText({
        conversationId: result.conversationId,
        customerPhone: input.customerPhone,
        body: 'La propietaria revisará la cobertura del envío antes de confirmar tu pedido.',
        source: 'owner_panel',
        idempotencyKey: `shipping-attention:${input.whatsappMessageId}`,
      });
      await this.alerts?.open({
        type: 'shipping_quote_attention',
        severity: 'critical',
        title: 'Revisar cobertura del envío',
        detail:
          'No se obtuvo una cotización que cumpla las preferencias. El pedido no fue confirmado y requiere atención.',
        entityUrl: `/orders/${result.activeOrderId}`,
        entityId: result.activeOrderId,
        retrySafe: true,
      });
      return;
    }
    const summary = await this.orders.createSummary(result.activeOrderId);
    await this.conversations.setSummaryVersion(
      result.conversationId,
      summary.version,
    );
    const snapshot = summary.snapshot as {
      totalCop: number;
      shippingQuote?: { carrier?: string };
    };
    const summaryVariables = {
      ...result.variables,
      total: formatCop(snapshot.totalCop),
      transportadora: snapshot.shippingQuote?.carrier ?? '',
    };
    await this.queueText(
      result.conversationId,
      input,
      result.flow === undefined
        ? summaryText(summary)
        : `${renderFlowMessage(result.flow.steps.summary.message, summaryVariables)}\n\n${summaryText(summary, result.flow)}\n\n${renderFlowMessage(result.flow.steps.confirmation.message, summaryVariables)}`,
      `summary:${summary.version}`,
    );

    await this.conversations.setState?.(
      result.conversationId,
      'awaiting_confirmation',
    );
  }

  private orderPatchFor(
    result: ReceiveConversationResult,
    orderId: string,
    senderPhone: string,
  ): PatchOrderInput | null {
    if (result.input === undefined) return null;
    switch (result.action) {
      case 'collect_name':
        return { orderId, customerName: result.input };
      case 'collect_phone':
        return { orderId, customerPhone: result.input || senderPhone };
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
    flow?: BotFlowDefinition,
  ): Promise<void> {
    const page = await this.catalog.listAvailableForConfirmedSize({
      confirmedSize: size,
      ...(flow === undefined ? {} : { pageSize: flow.pageSize }),
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
      flow === undefined
        ? `Responde con la referencia que te gustó o “cambiar talla”.${more}`
        : `${renderFlowMessage(flow.steps.catalog.message, { talla: displaySize(size) })}\n${renderFlowMessage(flow.steps.reference.message, { talla: displaySize(size) })}\nPara ver más: “${flow.commands.more}”. Para reiniciar: “${flow.commands.reset}”.`,
      `menu-prompt:${menu.version}`,
    );
  }

  private async queueText(
    conversationId: string,
    inbound: ReceiveConversationInput,
    body: string,
    suffix: string,
    source?: EnqueueTextInput['source'],
  ): Promise<void> {
    await this.outbound.enqueueText({
      conversationId,
      customerPhone: inbound.customerPhone,
      body,
      ...(source === undefined ? {} : { source }),
      idempotencyKey: `${suffix}:${inbound.whatsappMessageId}`,
    });
  }
}
