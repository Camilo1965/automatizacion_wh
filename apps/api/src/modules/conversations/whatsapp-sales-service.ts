import { OrderConflictError } from '../orders/order-errors.js';
import type { SavedDestination } from '../customers/postgres-customer-repository.js';
import type {
  AvailableCatalogItem,
  AvailableCatalogPage,
} from '../catalog/catalog-types.js';
import type { BotFlowDefinition } from './flow-definition.js';
import { renderFlowMessage } from './configured-flow.js';
import {
  formatOrderConfirmation,
  formatOrderReview,
  hasQuotedShipping,
} from './customer-order-messages.js';
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
  clearActiveOrder?(
    conversationId: string,
    expectedOrderId: string,
  ): Promise<void>;
  restartAfterUnavailableOrder?(input: {
    conversationId: string;
    orderId: string;
    customerPhone: string;
    body: string;
    idempotencyKey: string;
  }): Promise<boolean>;
  publishSummary?(input: {
    conversationId: string;
    orderId: string;
    version: number;
    customerPhone: string;
    body: string;
    idempotencyKey: string;
    expectedState: string;
    expectedEditAction: 'edit_address' | 'edit_locality' | null;
    expectedGeneration: number;
  }): Promise<boolean>;
  invalidateSummary?(input: {
    conversationId: string;
    orderId: string;
    version: number;
  }): Promise<boolean>;
  handOverUnquotedSummary?(input: {
    conversationId: string;
    orderId: string;
    customerPhone: string;
    body: string;
    idempotencyKey: string;
    expectedState: string;
    expectedEditAction: 'edit_address' | 'edit_locality' | null;
    expectedGeneration: number;
  }): Promise<boolean>;
  setState?(conversationId: string, state: string): Promise<void>;
  setLocalitySuggestions?(
    conversationId: string,
    localities: readonly string[],
    whatsappMessageId: string,
    handoffReply: string,
  ): Promise<boolean>;
  recordInvalidReference?(
    conversationId: string,
    whatsappMessageId: string,
    handoffReply: string,
  ): Promise<boolean>;
  clearLocalitySuggestions?(conversationId: string): Promise<void>;
  completeInvalidHandoff?(
    conversationId: string,
    whatsappMessageId: string,
  ): Promise<void>;
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
  ): Promise<Readonly<{
    referenceId: string;
    code: string;
    modelName: string;
  }> | null>;
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
  reuseDestination?(input: {
    orderId: string;
    customerId: string;
    customerName: string;
    address: string;
    localityCarrierCode: string;
  }): Promise<void>;
  createSummary?(orderId: string): Promise<OrderSummary>;
  get?(
    orderId: string,
  ): Promise<Pick<OrderRecord, 'status' | 'orderNumber'> | null>;
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

const INVALID_REFERENCE_HANDOFF_REPLY =
  'No pude identificar la referencia. Una asesora continuará esta conversación y te ayudará a elegir el modelo.';
const INVALID_LOCALITY_HANDOFF_REPLY =
  'No pude identificar el municipio. Una asesora continuará esta conversación y confirmará la dirección de tu pedido.';

function displaySize(size: string): string {
  return size.endsWith('.0') ? size.slice(0, -2) : size;
}

function formatCop(value: number): string {
  return `$${new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
  }).format(value)}`;
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
    private readonly customers?: Readonly<{
      latestUsableDestination(
        customerId: string,
      ): Promise<SavedDestination | null>;
    }>,
  ) {}

  async process(input: ReceiveConversationInput): Promise<void> {
    const result = await this.conversations.receive(input);
    if (
      result.conversationId === undefined ||
      (result.duplicate &&
        result.action !== 'select_reference' &&
        result.action !== 'reuse_destination' &&
        result.action !== 'cancel_order' &&
        result.action !== 'edit_product' &&
        result.action !== 'edit_address' &&
        result.action !== 'edit_locality' &&
        result.action !== 'human_takeover' &&
        !(
          result.action === 'collect_address' &&
          result.summaryEditAction === 'edit_address'
        ) &&
        !(
          result.action === 'collect_locality' &&
          result.summaryEditAction === 'edit_locality'
        ))
    )
      return;
    if (result.reply !== null && result.action !== 'edit_product') {
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
      if (
        this.conversations.completeInvalidHandoff !== undefined &&
        this.alerts === undefined
      )
        throw new Error('El servicio de alerta no está disponible');
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
      await this.conversations.completeInvalidHandoff?.(
        result.conversationId,
        input.whatsappMessageId,
      );
      return;
    }
    if (result.action === 'cancel_order' || result.action === 'edit_product') {
      if (
        result.activeOrderId == null ||
        this.orders?.transition === undefined ||
        this.conversations.clearActiveOrder === undefined
      ) {
        await this.handoffCancellation(result, input, false);
        return;
      }
      let observedOrder: Pick<OrderRecord, 'status' | 'orderNumber'> | null =
        null;
      try {
        if (result.duplicate) {
          if (this.orders.get === undefined)
            throw new Error(
              'Order status lookup is unavailable for cancellation replay',
            );
          observedOrder = await this.orders.get(result.activeOrderId);
          if (observedOrder === null)
            throw new Error('Cancellation order was not found');
        }
        if (observedOrder?.status !== 'cancelled') {
          await this.orders.transition({
            orderId: result.activeOrderId,
            action: 'cancel',
            idempotencyKey: `whatsapp:${input.whatsappMessageId}`,
          });
        }
      } catch {
        try {
          observedOrder =
            (await this.orders.get?.(result.activeOrderId)) ?? null;
        } catch {
          observedOrder = null;
        }
        if (observedOrder?.status !== 'cancelled') {
          await this.handoffCancellation(result, input, false);
          return;
        }
      }
      try {
        await this.conversations.clearActiveOrder(
          result.conversationId,
          result.activeOrderId,
        );
        const orderId =
          result.variables?.pedido ||
          (observedOrder?.orderNumber == null
            ? result.activeOrderId
            : `PED-${String(observedOrder.orderNumber).padStart(6, '0')}`);
        await this.queueText(
          result.conversationId,
          input,
          result.action === 'edit_product'
            ? `Cancelé el pedido ${orderId}. ${
                result.flow
                  ? `Para elegir otra referencia, ${renderFlowMessage(result.flow.steps.size.message, result.variables)}`
                  : 'Para elegir otra referencia, dime tu talla y te mostraré los modelos disponibles.'
              }`
            : `Cancelé el pedido ${orderId}. Si quieres empezar otro, dime tu talla.`,
          result.action === 'edit_product' ? 'product-restart' : 'cancelled',
        );
      } catch {
        await this.handoffCancellation(result, input, true);
      }
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
        const handedOff = await this.conversations.recordInvalidReference?.(
          result.conversationId,
          input.whatsappMessageId,
          INVALID_REFERENCE_HANDOFF_REPLY,
        );
        if (handedOff) {
          await this.handOffInvalidInput(
            result.conversationId,
            input,
            INVALID_REFERENCE_HANDOFF_REPLY,
          );
        } else {
          await this.queueText(
            result.conversationId,
            input,
            'Esa referencia no está en el menú vigente. Elige una de las fotos enviadas o escribe “más modelos”.',
            'invalid-reference',
          );
        }
      } else if (
        this.orders !== undefined &&
        this.conversations.attachOrder !== undefined &&
        result.selectedSize !== undefined &&
        result.selectedSize !== null
      ) {
        const order =
          result.duplicate && result.activeOrderId != null
            ? { id: result.activeOrderId }
            : await this.orders.create({
                referenceId: option.referenceId,
                size: result.selectedSize,
                quantity: 1,
                customerPhone: input.customerPhone,
                ...(result.customerId === undefined
                  ? {}
                  : { customerId: result.customerId }),
              });
        if (!result.duplicate)
          await this.conversations.attachOrder(
            result.conversationId,
            option.referenceId,
            order.id,
          );
        let savedDestination: SavedDestination | null = null;
        if (result.customerId != null) {
          try {
            savedDestination =
              (await this.customers?.latestUsableDestination(
                result.customerId,
              )) ?? null;
          } catch {
            // An unavailable history lookup must not interrupt address capture.
          }
        }
        if (savedDestination !== null && this.conversations.setState) {
          await this.conversations.setState(
            result.conversationId,
            'awaiting_reuse_confirmation',
          );
        } else if (result.state === 'awaiting_reuse_confirmation') {
          await this.conversations.setState?.(
            result.conversationId,
            'awaiting_name',
          );
        }
        await this.queueText(
          result.conversationId,
          input,
          `Elegiste REF ${option.code} · ${option.modelName}. ${
            savedDestination !== null && this.conversations.setState
              ? '¿Quieres usar los datos de entrega de tu pedido anterior? Responde “sí” o “cambiar dirección”.'
              : result.flow === undefined
                ? '¿Cuál es tu nombre completo?'
                : renderFlowMessage(result.flow.steps.name.message, {
                    ...result.variables,
                    talla: displaySize(result.selectedSize),
                    pedido:
                      !('orderNumber' in order) ||
                      order.orderNumber === undefined
                        ? ''
                        : `PED-${String(order.orderNumber).padStart(6, '0')}`,
                    referencia: option.code,
                  })
          }`,
          'reference-selected',
        );
      }
    }
    if (result.action === 'reuse_destination' && result.activeOrderId != null) {
      await this.reuseSavedDestination(result, input);
      return;
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
        const suggestions = page.items.slice(0, 3).map((item) => item.locality);
        const handedOff =
          (await this.conversations.setLocalitySuggestions?.(
            result.conversationId,
            suggestions,
            input.whatsappMessageId,
            INVALID_LOCALITY_HANDOFF_REPLY,
          )) ?? false;
        if (this.conversations.setLocalitySuggestions === undefined)
          await this.conversations.setState?.(
            result.conversationId,
            'awaiting_locality',
          );
        if (handedOff) {
          await this.handOffInvalidInput(
            result.conversationId,
            input,
            INVALID_LOCALITY_HANDOFF_REPLY,
          );
          return;
        }
        await this.queueText(
          result.conversationId,
          input,
          suggestions.length > 0
            ? `No encontré esa ciudad o municipio exactamente. Opciones:\n${suggestions.map((name, index) => `${index + 1}. ${name}`).join('\n')}\nResponde con el número o el nombre completo de una opción.`
            : 'No encontré esa ciudad o municipio en el listado de envíos. Revisa la ortografía o escribe otro municipio del departamento.',
          'unknown-locality',
        );
      } else {
        await this.orders.update({
          orderId: result.activeOrderId,
          localityCarrierCode: locality.carrierCode,
        });
        if (result.summaryEditAction === 'edit_locality') {
          await this.prepareSummary(result, input);
          await this.conversations.clearLocalitySuggestions?.(
            result.conversationId,
          );
        } else {
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
          await this.conversations.clearLocalitySuggestions?.(
            result.conversationId,
          );
        }
      }
    }
    if (
      (result.action === 'collect_notes' ||
        (result.action === 'collect_address' &&
          result.summaryEditAction === 'edit_address') ||
        (result.action === 'collect_address' &&
          result.flow?.optionalSteps.notes === false)) &&
      result.activeOrderId != null &&
      this.orders?.createSummary !== undefined &&
      this.conversations.publishSummary !== undefined
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
      this.conversations.publishSummary !== undefined
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
      const body = formatOrderReview(summary, result.flow);
      if (!hasQuotedShipping(summary)) {
        await this.handOverUnquotedSummary(result, input, body);
        return;
      }
      if (
        !(await this.conversations.publishSummary({
          conversationId: result.conversationId,
          orderId: result.activeOrderId,
          version: summary.version,
          customerPhone: input.customerPhone,
          body,
          idempotencyKey: `summary:${summary.version}:${input.whatsappMessageId}`,
          expectedState: result.state,
          expectedEditAction: result.summaryEditAction ?? null,
          expectedGeneration: result.summaryGeneration ?? 0,
        }))
      )
        return;
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
          const invalidated = await this.conversations.invalidateSummary?.({
            conversationId: result.conversationId,
            orderId: result.activeOrderId,
            version: result.activeSummaryVersion,
          });
          if (!invalidated) return;
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
        formatOrderConfirmation(result.variables?.pedido),
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
      this.conversations.publishSummary === undefined
    ) {
      await this.conversations.takeOver?.(result.conversationId);
      return;
    }
    try {
      if (result.flow && !result.duplicate)
        await this.queueText(
          result.conversationId,
          input,
          renderFlowMessage(result.flow.steps.quote.message, result.variables),
          'quoting',
        );
      await this.shippingQuotes?.createQuotes(result.activeOrderId);
    } catch {
      await this.handOverUnquotedSummary(
        result,
        input,
        'La propietaria revisará la cobertura del envío antes de confirmar tu pedido.',
      );
      return;
    }
    const summary = await this.orders.createSummary(result.activeOrderId);
    const body = formatOrderReview(summary, result.flow);
    if (!hasQuotedShipping(summary)) {
      await this.handOverUnquotedSummary(result, input, body);
      return;
    }
    await this.conversations.publishSummary({
      conversationId: result.conversationId,
      orderId: result.activeOrderId,
      version: summary.version,
      customerPhone: input.customerPhone,
      body,
      idempotencyKey: `summary:${summary.version}:${input.whatsappMessageId}`,
      expectedState: result.state,
      expectedEditAction: result.summaryEditAction ?? null,
      expectedGeneration: result.summaryGeneration ?? 0,
    });
  }

  private async reuseSavedDestination(
    result: ReceiveConversationResult,
    input: ReceiveConversationInput,
  ): Promise<void> {
    if (result.conversationId === undefined || result.activeOrderId == null)
      return;
    let saved: SavedDestination | null = null;
    let lookupFailed = false;
    if (result.customerId != null) {
      try {
        saved =
          (await this.customers?.latestUsableDestination(result.customerId)) ??
          null;
      } catch {
        lookupFailed = true;
      }
    }
    if (saved === null) {
      await this.conversations.setState?.(
        result.conversationId,
        'awaiting_name',
      );
      await this.queueText(
        result.conversationId,
        input,
        lookupFailed
          ? 'No pude comprobar los datos de entrega anteriores. Necesito pedirlos de nuevo. ¿Cuál es tu nombre completo?'
          : 'Ya no tengo un destino anterior completo y disponible. ¿Cuál es tu nombre completo?',
        'reuse-missing',
      );
      return;
    }
    let localities: Awaited<ReturnType<LocalityPort['list']>> | undefined;
    try {
      localities = await this.localities?.list({
        department: saved.localityDepartment,
        query: saved.localityName,
        limit: 10,
      });
    } catch {
      await this.conversations.setState?.(
        result.conversationId,
        'awaiting_name',
      );
      await this.queueText(
        result.conversationId,
        input,
        'No pude comprobar la cobertura de la localidad anterior. Necesito los datos de entrega de nuevo. ¿Cuál es tu nombre completo?',
        'reuse-coverage-unavailable',
      );
      return;
    }
    const covered = localities?.items.find(
      (item) =>
        item.carrierCode === saved.localityCarrierCode &&
        item.department === saved.localityDepartment &&
        item.locality === saved.localityName,
    );
    if (covered === undefined) {
      await this.conversations.setState?.(
        result.conversationId,
        'awaiting_name',
      );
      await this.queueText(
        result.conversationId,
        input,
        'La localidad anterior ya no tiene cobertura confirmada. Necesito los datos de entrega de nuevo. ¿Cuál es tu nombre completo?',
        'reuse-no-coverage',
      );
      return;
    }
    if (
      this.orders?.reuseDestination === undefined ||
      result.customerId == null
    )
      throw new Error('Saved destination update unavailable');
    try {
      await this.orders.reuseDestination({
        orderId: result.activeOrderId,
        customerId: result.customerId,
        customerName: saved.customerName,
        address: saved.address,
        localityCarrierCode: covered.carrierCode,
      });
    } catch (error) {
      if (
        !(error instanceof OrderConflictError) ||
        error.code !== 'customer_identity_mismatch'
      )
        throw error;
      if (this.orders.get === undefined)
        throw new Error(
          'Order status lookup unavailable after reuse conflict',
          {
            cause: error,
          },
        );
      const observedOrder = await this.orders.get(result.activeOrderId);
      if (observedOrder?.status !== 'draft') {
        if (this.conversations.restartAfterUnavailableOrder === undefined)
          throw new Error('Conversation restart unavailable', { cause: error });
        const restarted = await this.conversations.restartAfterUnavailableOrder(
          {
            conversationId: result.conversationId,
            orderId: result.activeOrderId,
            customerPhone: input.customerPhone,
            body: 'Este pedido ya no permite cambios. Para empezar otro pedido, dime tu talla.',
            idempotencyKey: `reuse-order-unavailable:${input.whatsappMessageId}`,
          },
        );
        if (!restarted)
          throw new Error('Conversation changed before restart', {
            cause: error,
          });
        return;
      }
      if (
        this.conversations.takeOver === undefined ||
        this.alerts === undefined
      )
        throw new Error('Owner handoff unavailable after reuse conflict', {
          cause: error,
        });
      await this.conversations.takeOver(result.conversationId);
      await this.alerts.open({
        type: 'conversation_attention',
        severity: 'warning',
        title: 'Revisar datos de entrega',
        detail:
          'No se pudo reutilizar el destino anterior de forma segura. Verifica la identidad y acuerda los datos de entrega con el cliente.',
        entityUrl: `/conversations?conversation=${result.conversationId}`,
        entityId: result.conversationId,
        retrySafe: false,
      });
      await this.queueText(
        result.conversationId,
        input,
        'Una asesora revisará los datos de entrega contigo antes de continuar.',
        'reuse-conflict',
        'owner_panel',
      );
      return;
    }
    await this.prepareSummary(result, input);
  }

  private async handOverUnquotedSummary(
    result: ReceiveConversationResult,
    input: ReceiveConversationInput,
    body: string,
  ): Promise<void> {
    if (
      result.conversationId === undefined ||
      result.activeOrderId == null ||
      this.conversations.handOverUnquotedSummary === undefined
    )
      throw new Error('Unquoted order handover is unavailable');
    const handedOver = await this.conversations.handOverUnquotedSummary({
      conversationId: result.conversationId,
      orderId: result.activeOrderId,
      customerPhone: input.customerPhone,
      body,
      idempotencyKey: `shipping-attention:${input.whatsappMessageId}`,
      expectedState: result.state,
      expectedEditAction: result.summaryEditAction ?? null,
      expectedGeneration: result.summaryGeneration ?? 0,
    });
    if (!handedOver) return;
    await this.alerts?.open({
      type: 'shipping_quote_attention',
      severity: 'critical',
      title: 'Revisar cobertura del envío',
      detail:
        'El resumen no tiene cotización válida. El pedido no se puede confirmar hasta cotizarlo.',
      entityUrl: `/orders/${result.activeOrderId}`,
      entityId: result.activeOrderId,
      retrySafe: true,
    });
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

  private async handOffInvalidInput(
    conversationId: string,
    inbound: ReceiveConversationInput,
    body: string,
  ): Promise<void> {
    await this.queueText(conversationId, inbound, body, 'reply', 'owner_panel');
    if (
      this.conversations.completeInvalidHandoff !== undefined &&
      this.alerts === undefined
    )
      throw new Error('El servicio de alerta no está disponible');
    await this.alerts?.open({
      type: 'conversation_attention',
      severity: 'warning',
      title: 'Cliente necesita ayuda con el pedido',
      detail: body,
      entityUrl: `/conversations?conversation=${conversationId}`,
      entityId: conversationId,
      retrySafe: false,
    });
    await this.conversations.completeInvalidHandoff?.(
      conversationId,
      inbound.whatsappMessageId,
    );
  }

  private async handoffCancellation(
    result: ReceiveConversationResult,
    input: ReceiveConversationInput,
    cancelled: boolean,
  ): Promise<void> {
    if (result.conversationId === undefined)
      throw new Error('Cancellation conversation is unavailable');
    let handoffError: unknown;
    try {
      await this.conversations.takeOver?.(result.conversationId);
      await this.outbound.enqueueText({
        conversationId: result.conversationId,
        customerPhone: input.customerPhone,
        body: cancelled
          ? 'El pedido ya fue cancelado, pero la propietaria revisará los detalles antes de continuar.'
          : 'La propietaria revisará la cancelación de tu pedido antes de continuar.',
        source: 'owner_panel',
        idempotencyKey: `cancellation-attention:${input.whatsappMessageId}`,
      });
    } catch (error) {
      handoffError = error;
    } finally {
      await this.alerts?.open({
        type: 'order_cancellation_attention',
        severity: 'critical',
        title: 'Revisar cancelación de pedido',
        detail: cancelled
          ? 'El pedido fue cancelado, pero no se completó el vínculo activo o el aviso al cliente.'
          : 'No se completó la cancelación automáticamente. Revisar el estado del pedido antes de continuar.',
        entityUrl: `/orders/${result.activeOrderId ?? ''}`,
        entityId: result.activeOrderId ?? result.conversationId,
        retrySafe: false,
      });
    }
    if (handoffError !== undefined) throw handoffError;
  }
}
