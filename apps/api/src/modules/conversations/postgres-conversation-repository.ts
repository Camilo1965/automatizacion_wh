import { and, eq, inArray, isNull, max, sql } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import {
  whatsappConversationEvents,
  whatsappConversationMessages,
  whatsappConversations,
  conversationOrderLinks,
  botFlowDrafts,
  botFlowVersions,
  salesOrders,
  catalogReferences,
  shippingLocalities,
} from '../../database/schema/index.js';
import { type ConversationTransition } from './conversation-state.js';
import {
  normalizeCustomerPhone,
  resolveCustomerContact,
  lockCustomerPhone,
  lockCustomerIds,
} from '../customers/customer-contact.js';
import { BotFlowDefinitionSchema } from '@camila/contracts';
import { advanceConfiguredConversation } from './configured-flow.js';
import {
  createDefaultBotFlow,
  type BotFlowDefinition,
} from './flow-definition.js';
import {
  insertTextForLockedIdentity,
  lockOutboundIdentity,
} from '../whatsapp/postgres-outbound-repository.js';
import { resolveOfferedLocality } from './locality-suggestions.js';
import { canonicalDepartment } from './department-selection.js';

export type ReceiveConversationInput = Readonly<{
  whatsappMessageId: string;
  customerPhone: string;
  text: string;
  occurredAt?: Date;
}>;

export type ReceiveConversationResult = Readonly<{
  duplicate: boolean;
  conversationId?: string;
  state: string;
  reply: string | null;
  selectedSize?: string | null;
  activeOrderId?: string | null;
  pendingDepartment?: string | null;
  activeSummaryVersion?: number | null;
  summaryEditAction?: 'edit_address' | 'edit_locality' | null;
  summaryGeneration?: number;
  action?: ConversationTransition['action'];
  input?: string;
  flow?: BotFlowDefinition;
  variables?: Record<string, string>;
  customerId?: string | null;
}>;

export class PostgresConversationRepository {
  constructor(private readonly database: PostgresDatabase) {}
  async takeOver(conversationId: string) {
    await this.database.orm
      .update(whatsappConversations)
      .set({ mode: 'human', activeSummaryVersion: null, updatedAt: new Date() })
      .where(eq(whatsappConversations.id, conversationId));
  }

  receive(input: ReceiveConversationInput): Promise<ReceiveConversationResult> {
    const customerPhone = normalizeCustomerPhone(input.customerPhone);
    return this.database.orm.transaction(async (tx) => {
      await lockCustomerPhone(tx, customerPhone);

      const [duplicate] = await tx
        .select({
          id: whatsappConversationEvents.id,
          conversationId: whatsappConversationEvents.conversationId,
          stateAfter: whatsappConversationEvents.stateAfter,
          cancellationOrderId: whatsappConversationEvents.cancellationOrderId,
          cancellationAction: whatsappConversationEvents.cancellationAction,
          continuationAction: whatsappConversationEvents.continuationAction,
          continuationReply: whatsappConversationEvents.continuationReply,
          continuationGeneration:
            whatsappConversationEvents.continuationGeneration,
        })
        .from(whatsappConversationEvents)
        .where(
          eq(
            whatsappConversationEvents.whatsappMessageId,
            input.whatsappMessageId,
          ),
        )
        .limit(1);
      const [observed] = await tx
        .select()
        .from(whatsappConversations)
        .where(eq(whatsappConversations.customerPhone, customerPhone))
        .limit(1);
      if (observed?.customerId !== null && observed?.customerId !== undefined)
        await lockCustomerIds(tx, [observed.customerId]);
      const [existing] = await tx
        .select()
        .from(whatsappConversations)
        .where(eq(whatsappConversations.customerPhone, customerPhone))
        .limit(1);
      if (
        existing !== undefined &&
        observed !== undefined &&
        (existing.id !== observed.id ||
          existing.customerId !== observed.customerId)
      ) {
        throw new Error('Conversation identity changed during receive');
      }

      if (duplicate !== undefined) {
        const recoverCancellation =
          duplicate.conversationId === existing?.id &&
          existing.mode === 'bot' &&
          duplicate.cancellationOrderId !== null;
        const recoverInvalidHandoff =
          duplicate.conversationId === existing?.id &&
          (duplicate.continuationAction === 'invalid_ref' ||
            duplicate.continuationAction === 'invalid_city' ||
            duplicate.continuationAction === 'human_takeover') &&
          duplicate.continuationReply !== null;
        const recoverContinuation =
          duplicate.conversationId === existing?.id &&
          existing.mode === 'bot' &&
          (duplicate.continuationAction === 'edit_address' ||
            duplicate.continuationAction === 'edit_locality') &&
          existing.summaryEditAction === duplicate.continuationAction &&
          existing.summaryGeneration === duplicate.continuationGeneration &&
          existing.state === duplicate.stateAfter;
        const [originalInbound] =
          duplicate.continuationAction === 'collect_address' ||
          duplicate.continuationAction === 'collect_locality' ||
          duplicate.continuationAction === 'select_reference'
            ? await tx
                .select({ textBody: whatsappConversationMessages.textBody })
                .from(whatsappConversationMessages)
                .where(
                  eq(
                    whatsappConversationMessages.providerMessageId,
                    input.whatsappMessageId,
                  ),
                )
                .limit(1)
            : [];
        const recoverReference =
          duplicate.conversationId === existing?.id &&
          existing.mode === 'bot' &&
          duplicate.continuationAction === 'select_reference' &&
          duplicate.stateAfter === 'showing_models' &&
          (existing.state === 'awaiting_name' ||
            existing.state === 'awaiting_reuse_confirmation') &&
          existing.activeOrderId !== null &&
          existing.selectedReferenceId !== null &&
          originalInbound?.textBody != null;
        const recoverSummary =
          duplicate.conversationId === existing?.id &&
          existing.mode === 'bot' &&
          existing.activeOrderId !== null &&
          originalInbound?.textBody != null &&
          ((duplicate.continuationAction === 'collect_address' &&
            existing.summaryEditAction === 'edit_address') ||
            (duplicate.continuationAction === 'collect_locality' &&
              existing.summaryEditAction === 'edit_locality')) &&
          existing.summaryGeneration === duplicate.continuationGeneration &&
          existing.state === duplicate.stateAfter;
        return {
          duplicate: true,
          state: existing?.state ?? 'awaiting_size',
          reply:
            recoverContinuation || recoverInvalidHandoff
              ? duplicate.continuationReply
              : null,
          ...(recoverInvalidHandoff
            ? {
                conversationId: duplicate.conversationId,
                action: 'human_takeover' as const,
              }
            : {}),
          ...(recoverCancellation
            ? {
                conversationId: duplicate.conversationId,
                action:
                  duplicate.cancellationAction === 'edit_product'
                    ? ('edit_product' as const)
                    : ('cancel_order' as const),
                activeOrderId: duplicate.cancellationOrderId,
                ...(duplicate.cancellationAction === 'edit_product'
                  ? {
                      flow: BotFlowDefinitionSchema.parse(
                        existing.flowSnapshot ?? createDefaultBotFlow(),
                      ),
                    }
                  : {}),
              }
            : {}),
          ...(recoverContinuation
            ? {
                conversationId: duplicate.conversationId,
                action: duplicate.continuationAction as
                  'edit_address' | 'edit_locality',
              }
            : {}),
          ...(recoverSummary
            ? {
                conversationId: duplicate.conversationId,
                action: duplicate.continuationAction as
                  'collect_address' | 'collect_locality',
                input:
                  resolveOfferedLocality(
                    originalInbound?.textBody ?? '',
                    existing.offeredLocalities,
                  ) ?? '',
                activeOrderId: existing.activeOrderId,
                pendingDepartment: existing.pendingDepartment,
                summaryEditAction: existing.summaryEditAction as
                  'edit_address' | 'edit_locality',
                summaryGeneration: existing.summaryGeneration,
                flow: BotFlowDefinitionSchema.parse(
                  existing.flowSnapshot ?? createDefaultBotFlow(),
                ),
              }
            : {}),
          ...(recoverReference
            ? {
                conversationId: duplicate.conversationId,
                customerId: existing.customerId,
                action: 'select_reference' as const,
                input: originalInbound.textBody!,
                activeOrderId: existing.activeOrderId,
                selectedSize: existing.selectedSize,
                flow: BotFlowDefinitionSchema.parse(
                  existing.flowSnapshot ?? createDefaultBotFlow(),
                ),
              }
            : {}),
        };
      }

      const customerId = await resolveCustomerContact(tx, {
        normalizedPhone: customerPhone,
      });

      const now = input.occurredAt ?? new Date();
      const [published] = await tx
        .select()
        .from(botFlowDrafts)
        .where(eq(botFlowDrafts.id, 'sales'));
      const [activeVersion] =
        published?.activeVersionId == null
          ? []
          : await tx
              .select()
              .from(botFlowVersions)
              .where(eq(botFlowVersions.id, published.activeVersionId));
      let flow = BotFlowDefinitionSchema.parse(
        existing?.flowSnapshot ??
          (published?.activeVersionId == null
            ? createDefaultBotFlow()
            : (activeVersion?.definition ?? createDefaultBotFlow())),
      );
      const [context] =
        existing?.activeOrderId == null
          ? []
          : await tx
              .select({
                name: salesOrders.customerName,
                orderNumber: salesOrders.orderNumber,
                reference: catalogReferences.code,
                total: sql<
                  string | null
                >`(SELECT snapshot->>'totalCop' FROM order_summaries WHERE order_id = ${salesOrders.id} ORDER BY version DESC LIMIT 1)`,
                carrier: sql<
                  string | null
                >`(SELECT snapshot->'shippingQuote'->>'carrier' FROM order_summaries WHERE order_id = ${salesOrders.id} ORDER BY version DESC LIMIT 1)`,
              })
              .from(salesOrders)
              .innerJoin(
                catalogReferences,
                eq(catalogReferences.id, salesOrders.referenceId),
              )
              .where(eq(salesOrders.id, existing.activeOrderId));
      const variables = {
        talla: existing?.selectedSize ?? '',
        nombre: context?.name ?? '',
        referencia: context?.reference ?? '',
        pedido:
          context?.orderNumber == null
            ? ''
            : `PED-${String(context.orderNumber).padStart(6, '0')}`,
        total:
          context?.total == null
            ? ''
            : new Intl.NumberFormat('es-CO', {
                style: 'currency',
                currency: 'COP',
                maximumFractionDigits: 0,
              }).format(Number(context.total)),
        transportadora: context?.carrier ?? '',
      };
      const resolvedText =
        existing?.state === 'awaiting_locality'
          ? resolveOfferedLocality(input.text, existing.offeredLocalities)
          : input.text;
      let transition: ConversationTransition =
        existing?.mode === 'human'
          ? {
              state:
                existing.state as import('./conversation-state.js').ConversationState,
              reply: null,
            }
          : advanceConfiguredConversation(
              existing === undefined
                ? null
                : (existing.state as import('./conversation-state.js').ConversationState),
              resolvedText ?? '',
              existing?.invalidAttempts ?? 0,
              flow,
              variables,
            );
      if (
        transition.action === 'confirm_order' &&
        existing?.activeSummaryVersion == null
      )
        transition = {
          state: 'awaiting_confirmation',
          reply: 'Espera el resumen actualizado antes de confirmar.',
        };
      if (
        (existing?.summaryEditAction === 'edit_address' &&
          transition.action === 'collect_address') ||
        (existing?.summaryEditAction === 'edit_locality' &&
          transition.action === 'collect_locality')
      )
        transition = {
          ...transition,
          state:
            existing.state as import('./conversation-state.js').ConversationState,
          reply: null,
        };
      if (transition.action === 'collect_department') {
        const departments = await tx
          .selectDistinct({ name: shippingLocalities.department })
          .from(shippingLocalities)
          .where(eq(shippingLocalities.active, true));
        const selected = canonicalDepartment(
          transition.input ?? '',
          departments.map(({ name }) => name),
        );
        if (selected === null) {
          const invalid = advanceConfiguredConversation(
            'awaiting_department',
            '',
            existing?.invalidAttempts ?? 0,
            flow,
            variables,
          );
          transition =
            invalid.action === 'human_takeover'
              ? invalid
              : {
                  ...invalid,
                  reply:
                    'No encontré ese departamento en el catálogo de envíos. Escribe el nombre completo del departamento.',
                };
        } else {
          transition = { ...transition, input: selected };
        }
      }
      if (transition.action === 'reset')
        flow = BotFlowDefinitionSchema.parse(
          published?.activeVersionId == null
            ? createDefaultBotFlow()
            : (activeVersion?.definition ?? createDefaultBotFlow()),
        );
      const conversation =
        existing ??
        (
          await tx
            .insert(whatsappConversations)
            .values({
              customerPhone,
              customerId,
              state: transition.state,
              lastInboundMessageAt: now,
              flowVersionId: published?.activeVersionId ?? null,
              flowSnapshot: flow,
            })
            .returning()
        )[0];
      if (conversation === undefined)
        throw new Error('Conversation insert failed');

      const [sequenceRow] = await tx
        .select({ value: max(whatsappConversationEvents.sequence) })
        .from(whatsappConversationEvents)
        .where(eq(whatsappConversationEvents.conversationId, conversation.id));
      const lastSequence = sequenceRow?.value ?? 0;
      const reply = conversation.mode === 'human' ? null : transition.reply;
      const advancesSummaryGeneration =
        transition.action === 'edit_address' ||
        transition.action === 'edit_locality' ||
        transition.action === 'edit_product' ||
        transition.action === 'cancel_order' ||
        transition.action === 'reset' ||
        (existing?.summaryEditAction === 'edit_address' &&
          transition.action === 'collect_address') ||
        (existing?.summaryEditAction === 'edit_locality' &&
          transition.action === 'collect_locality');
      const summaryGeneration =
        (existing?.summaryGeneration ?? 0) +
        (advancesSummaryGeneration ? 1 : 0);

      await tx.insert(whatsappConversationEvents).values({
        conversationId: conversation.id,
        whatsappMessageId: input.whatsappMessageId,
        cancellationOrderId:
          transition.action === 'cancel_order' ||
          transition.action === 'edit_product'
            ? (existing?.activeOrderId ?? null)
            : null,
        cancellationAction:
          transition.action === 'cancel_order' ||
          transition.action === 'edit_product'
            ? transition.action
            : null,
        continuationAction:
          transition.action === 'select_reference' ||
          transition.action === 'human_takeover' ||
          transition.action === 'edit_address' ||
          transition.action === 'edit_locality' ||
          (existing?.summaryEditAction != null &&
            (transition.action === 'collect_address' ||
              transition.action === 'collect_locality'))
            ? transition.action
            : null,
        continuationReply:
          transition.action === 'human_takeover' ||
          transition.action === 'edit_address' ||
          transition.action === 'edit_locality'
            ? reply
            : null,
        continuationGeneration:
          transition.action === 'edit_address' ||
          transition.action === 'edit_locality' ||
          (existing?.summaryEditAction != null &&
            (transition.action === 'collect_address' ||
              transition.action === 'collect_locality'))
            ? summaryGeneration
            : null,
        sequence: lastSequence + 1,
        stateBefore: existing?.state ?? null,
        stateAfter: transition.state,
      });
      await tx
        .insert(whatsappConversationMessages)
        .values({
          conversationId: conversation.id,
          providerMessageId: input.whatsappMessageId,
          source: 'customer',
          messageType: 'text',
          textBody: input.text,
          status: 'received',
          occurredAt: now,
        })
        .onConflictDoNothing({
          target: whatsappConversationMessages.providerMessageId,
        });
      await tx
        .update(whatsappConversations)
        .set({
          state: transition.state,
          customerId,
          ...(transition.selectedSize === undefined
            ? {}
            : { selectedSize: transition.selectedSize }),
          ...(transition.action === 'collect_locality'
            ? { invalidAttempts: existing?.invalidAttempts ?? 0 }
            : transition.invalidAttempts === undefined
              ? transition.selectedSize === undefined
                ? {}
                : { invalidAttempts: 0 }
              : { invalidAttempts: transition.invalidAttempts }),
          ...(transition.action === 'human_takeover' ? { mode: 'human' } : {}),
          ...(transition.action === 'collect_department'
            ? {
                pendingDepartment: transition.input ?? null,
                offeredLocalities: [],
              }
            : {}),
          ...(transition.action === 'reset' ||
          transition.action === 'edit_locality' ||
          transition.action === 'edit_product' ||
          transition.action === 'cancel_order'
            ? { offeredLocalities: [] }
            : {}),
          ...(transition.action === 'edit_address' ||
          transition.action === 'edit_locality'
            ? {
                activeSummaryVersion: null,
                summaryEditAction: transition.action,
              }
            : transition.action === 'edit_product' ||
                transition.action === 'cancel_order' ||
                transition.action === 'reset'
              ? { activeSummaryVersion: null, summaryEditAction: null }
              : {}),
          summaryGeneration,
          lastInboundMessageAt: now,
          updatedAt: now,
          ...(existing?.flowSnapshot == null || transition.action === 'reset'
            ? {
                flowSnapshot: flow,
                flowVersionId: published?.activeVersionId ?? null,
              }
            : {}),
        })
        .where(
          and(
            eq(whatsappConversations.id, conversation.id),
            eq(whatsappConversations.customerPhone, customerPhone),
          ),
        );
      return {
        duplicate: false,
        conversationId: conversation.id,
        customerId,
        state: transition.state,
        reply,
        flow,
        variables,
        selectedSize:
          transition.selectedSize === undefined
            ? (existing?.selectedSize ?? null)
            : transition.selectedSize,
        activeOrderId: existing?.activeOrderId ?? null,
        pendingDepartment:
          transition.action === 'collect_department'
            ? (transition.input ?? null)
            : (existing?.pendingDepartment ?? null),
        activeSummaryVersion:
          transition.action === 'edit_address' ||
          transition.action === 'edit_locality' ||
          transition.action === 'edit_product' ||
          transition.action === 'cancel_order'
            ? null
            : (existing?.activeSummaryVersion ?? null),
        summaryEditAction:
          transition.action === 'edit_address' ||
          transition.action === 'edit_locality'
            ? transition.action
            : ((existing?.summaryEditAction as
                'edit_address' | 'edit_locality' | null) ?? null),
        summaryGeneration,
        ...(transition.action === undefined
          ? {}
          : { action: transition.action }),
        ...(transition.input === undefined ? {} : { input: transition.input }),
      };
    });
  }

  async returnToSize(conversationId: string): Promise<void> {
    await this.database.orm
      .update(whatsappConversations)
      .set({
        state: 'awaiting_size',
        selectedSize: null,
        selectedReferenceId: null,
        invalidAttempts: 0,
        pendingDepartment: null,
        offeredLocalities: [],
        activeSummaryVersion: null,
        summaryEditAction: null,
        updatedAt: new Date(),
      })
      .where(eq(whatsappConversations.id, conversationId));
  }

  async attachOrder(
    conversationId: string,
    referenceId: string,
    orderId: string,
  ): Promise<void> {
    await this.database.orm.transaction(async (tx) => {
      const [link] = await tx
        .insert(conversationOrderLinks)
        .values({ orderId, originConversationId: conversationId })
        .onConflictDoNothing({ target: conversationOrderLinks.orderId })
        .returning({
          originConversationId: conversationOrderLinks.originConversationId,
        });
      if (link === undefined) {
        const [existing] = await tx
          .select({
            originConversationId: conversationOrderLinks.originConversationId,
          })
          .from(conversationOrderLinks)
          .where(eq(conversationOrderLinks.orderId, orderId));
        if (existing?.originConversationId !== conversationId) {
          throw new Error('Order is already linked to another conversation');
        }
      }
      await tx
        .update(whatsappConversations)
        .set({
          state: 'awaiting_name',
          selectedReferenceId: referenceId,
          activeOrderId: orderId,
          invalidAttempts: 0,
          offeredLocalities: [],
          updatedAt: new Date(),
        })
        .where(eq(whatsappConversations.id, conversationId));
    });
  }

  async clearActiveOrder(
    conversationId: string,
    expectedOrderId: string,
  ): Promise<void> {
    await this.database.orm
      .update(whatsappConversations)
      .set({
        activeOrderId: null,
        selectedReferenceId: null,
        activeSummaryVersion: null,
        summaryEditAction: null,
        offeredLocalities: [],
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(whatsappConversations.id, conversationId),
          eq(whatsappConversations.activeOrderId, expectedOrderId),
        ),
      );
  }

  async publishSummary(input: {
    conversationId: string;
    orderId: string;
    version: number;
    customerPhone: string;
    body: string;
    idempotencyKey: string;
    expectedState: string;
    expectedEditAction: 'edit_address' | 'edit_locality' | null;
    expectedGeneration: number;
  }): Promise<boolean> {
    return this.database.orm.transaction(async (tx) => {
      await lockOutboundIdentity(tx, input.customerPhone, input.conversationId);
      const updated = await tx
        .update(whatsappConversations)
        .set({
          activeSummaryVersion: input.version,
          summaryEditAction: null,
          state: 'awaiting_confirmation',
          offeredLocalities: [],
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(whatsappConversations.id, input.conversationId),
            eq(whatsappConversations.activeOrderId, input.orderId),
            eq(whatsappConversations.mode, 'bot'),
            eq(whatsappConversations.state, input.expectedState),
            eq(
              whatsappConversations.summaryGeneration,
              input.expectedGeneration,
            ),
            input.expectedEditAction === null
              ? isNull(whatsappConversations.summaryEditAction)
              : eq(
                  whatsappConversations.summaryEditAction,
                  input.expectedEditAction,
                ),
          ),
        )
        .returning({ id: whatsappConversations.id });
      if (updated.length === 0) return false;
      await insertTextForLockedIdentity(tx, {
        conversationId: input.conversationId,
        customerPhone: input.customerPhone,
        body: input.body,
        idempotencyKey: input.idempotencyKey,
      });
      return true;
    });
  }

  async handOverUnquotedSummary(input: {
    conversationId: string;
    orderId: string;
    customerPhone: string;
    body: string;
    idempotencyKey: string;
    expectedState: string;
    expectedEditAction: 'edit_address' | 'edit_locality' | null;
    expectedGeneration: number;
  }): Promise<boolean> {
    return this.database.orm.transaction(async (tx) => {
      await lockOutboundIdentity(tx, input.customerPhone, input.conversationId);
      const updated = await tx
        .update(whatsappConversations)
        .set({
          mode: 'human',
          activeSummaryVersion: null,
          summaryEditAction: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(whatsappConversations.id, input.conversationId),
            eq(whatsappConversations.activeOrderId, input.orderId),
            eq(whatsappConversations.mode, 'bot'),
            eq(whatsappConversations.state, input.expectedState),
            isNull(whatsappConversations.activeSummaryVersion),
            eq(
              whatsappConversations.summaryGeneration,
              input.expectedGeneration,
            ),
            input.expectedEditAction === null
              ? isNull(whatsappConversations.summaryEditAction)
              : eq(
                  whatsappConversations.summaryEditAction,
                  input.expectedEditAction,
                ),
            sql`EXISTS (
              SELECT 1 FROM ${salesOrders}
              WHERE ${salesOrders.id} = ${input.orderId}
                AND ${salesOrders.status} = 'draft'
            )`,
          ),
        )
        .returning({ id: whatsappConversations.id });
      if (updated.length === 0) return false;
      await insertTextForLockedIdentity(tx, {
        conversationId: input.conversationId,
        customerPhone: input.customerPhone,
        body: input.body,
        source: 'owner_panel',
        idempotencyKey: input.idempotencyKey,
      });
      return true;
    });
  }

  async setState(conversationId: string, state: string): Promise<void> {
    await this.database.orm
      .update(whatsappConversations)
      .set({ state, updatedAt: new Date() })
      .where(eq(whatsappConversations.id, conversationId));
  }

  async setLocalitySuggestions(
    conversationId: string,
    localities: readonly string[],
    whatsappMessageId: string,
    handoffReply: string,
  ): Promise<boolean> {
    return this.database.orm.transaction(async (tx) => {
      const [updated] = await tx
        .update(whatsappConversations)
        .set({
          state: 'awaiting_locality',
          offeredLocalities: localities.slice(0, 3),
          invalidAttempts: sql`${whatsappConversations.invalidAttempts} + 1`,
          mode: sql`CASE WHEN ${whatsappConversations.invalidAttempts} + 1 >= 2 THEN 'human' ELSE 'bot' END`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(whatsappConversations.id, conversationId),
            eq(whatsappConversations.mode, 'bot'),
            inArray(whatsappConversations.state, [
              'awaiting_locality',
              'awaiting_address',
            ]),
          ),
        )
        .returning({ mode: whatsappConversations.mode });
      if (updated === undefined)
        throw new Error('Locality suggestions could not be saved');
      if (updated.mode === 'human')
        await this.markInvalidHandoff(
          tx,
          conversationId,
          whatsappMessageId,
          'invalid_city',
          handoffReply,
        );
      return updated.mode === 'human';
    });
  }

  async clearLocalitySuggestions(conversationId: string): Promise<void> {
    await this.database.orm
      .update(whatsappConversations)
      .set({ offeredLocalities: [], invalidAttempts: 0, updatedAt: new Date() })
      .where(eq(whatsappConversations.id, conversationId));
  }

  async recordInvalidReference(
    conversationId: string,
    whatsappMessageId: string,
    handoffReply: string,
  ): Promise<boolean> {
    return this.database.orm.transaction(async (tx) => {
      const [updated] = await tx
        .update(whatsappConversations)
        .set({
          invalidAttempts: sql`${whatsappConversations.invalidAttempts} + 1`,
          mode: sql`CASE WHEN ${whatsappConversations.invalidAttempts} + 1 >= 2 THEN 'human' ELSE 'bot' END`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(whatsappConversations.id, conversationId),
            eq(whatsappConversations.mode, 'bot'),
            eq(whatsappConversations.state, 'showing_models'),
          ),
        )
        .returning({ mode: whatsappConversations.mode });
      if (updated?.mode === 'human')
        await this.markInvalidHandoff(
          tx,
          conversationId,
          whatsappMessageId,
          'invalid_ref',
          handoffReply,
        );
      return updated?.mode === 'human';
    });
  }

  async completeInvalidHandoff(
    conversationId: string,
    whatsappMessageId: string,
  ): Promise<void> {
    await this.database.orm
      .update(whatsappConversationEvents)
      .set({ continuationAction: null, continuationReply: null })
      .where(
        and(
          eq(whatsappConversationEvents.conversationId, conversationId),
          eq(whatsappConversationEvents.whatsappMessageId, whatsappMessageId),
          inArray(whatsappConversationEvents.continuationAction, [
            'invalid_ref',
            'invalid_city',
            'human_takeover',
          ]),
        ),
      );
  }

  private async markInvalidHandoff(
    tx: Parameters<Parameters<PostgresDatabase['orm']['transaction']>[0]>[0],
    conversationId: string,
    whatsappMessageId: string,
    reason: 'invalid_ref' | 'invalid_city',
    reply: string,
  ): Promise<void> {
    const [event] = await tx
      .update(whatsappConversationEvents)
      .set({ continuationAction: reason, continuationReply: reply })
      .where(
        and(
          eq(whatsappConversationEvents.conversationId, conversationId),
          eq(whatsappConversationEvents.whatsappMessageId, whatsappMessageId),
        ),
      )
      .returning({ id: whatsappConversationEvents.id });
    if (event === undefined)
      throw new Error('Invalid-input handoff event was not found');
  }
}
