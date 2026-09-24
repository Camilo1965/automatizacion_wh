import { createHash } from 'node:crypto';

import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  lt,
  lte,
  or,
  sql,
} from 'drizzle-orm';

import type { PrivacyDataClass, RetentionAction } from '@camila/contracts';

import type { PostgresDatabase } from '../../database/client.js';
import {
  lockCustomerPhone,
  type CustomerTransaction,
} from '../customers/customer-contact.js';
import {
  adminSessions,
  customers,
  orderSummaries,
  ownerAlerts,
  salesOrders,
  whatsappConversationMessages,
  whatsappConversations,
  whatsappInboundMessages,
  whatsappOutboundMessages,
} from '../../database/schema/index.js';
import type {
  CustomerRelatedSnapshot,
  RetentionDataStore,
} from './retention-service.js';

const ANON_PHONE = '0000000000';
const ANON_NAME = 'ANONIMIZADO';
type RetentionOrm = PostgresDatabase['orm'] | CustomerTransaction;

function opaqueCustomerId(phone: string): string {
  return createHash('sha256').update(phone).digest('hex').slice(0, 16);
}

export class PostgresRetentionDataStore implements RetentionDataStore {
  constructor(private readonly database: PostgresDatabase) {}

  async listCandidates(
    dataClass: PrivacyDataClass,
    cutoff: Date,
  ): Promise<Array<{ id: string; createdAt: Date }>> {
    const orm = this.database.orm;
    switch (dataClass) {
      case 'whatsapp_inbound_messages': {
        const rows = await orm
          .select({
            id: whatsappInboundMessages.id,
            createdAt: whatsappInboundMessages.createdAt,
          })
          .from(whatsappInboundMessages)
          .where(
            and(
              lt(whatsappInboundMessages.createdAt, cutoff),
              sql`${whatsappInboundMessages.customerPhone} <> ${ANON_PHONE}`,
            ),
          )
          .orderBy(asc(whatsappInboundMessages.id));
        return rows;
      }
      case 'whatsapp_conversation_messages': {
        const rows = await orm
          .select({
            id: whatsappConversationMessages.id,
            createdAt: whatsappConversationMessages.createdAt,
          })
          .from(whatsappConversationMessages)
          .where(lt(whatsappConversationMessages.createdAt, cutoff))
          .orderBy(asc(whatsappConversationMessages.id));
        return rows;
      }
      case 'whatsapp_outbound_messages': {
        const rows = await orm
          .select({
            id: whatsappOutboundMessages.id,
            createdAt: whatsappOutboundMessages.createdAt,
          })
          .from(whatsappOutboundMessages)
          .where(
            and(
              lt(whatsappOutboundMessages.createdAt, cutoff),
              sql`${whatsappOutboundMessages.customerPhone} NOT LIKE 'A%'`,
              sql`${whatsappOutboundMessages.customerPhone} <> ${ANON_PHONE}`,
            ),
          )
          .orderBy(asc(whatsappOutboundMessages.id));
        return rows;
      }
      case 'whatsapp_conversations': {
        const rows = await orm
          .select({
            id: whatsappConversations.id,
            createdAt: whatsappConversations.createdAt,
          })
          .from(whatsappConversations)
          .where(
            and(
              lt(whatsappConversations.createdAt, cutoff),
              sql`${whatsappConversations.customerPhone} NOT LIKE 'A%'`,
            ),
          )
          .orderBy(asc(whatsappConversations.id));
        return rows;
      }
      case 'sales_orders_customer_pii': {
        const rows = await orm
          .select({
            id: salesOrders.id,
            createdAt: salesOrders.createdAt,
          })
          .from(salesOrders)
          .where(
            and(
              lt(salesOrders.createdAt, cutoff),
              or(
                sql`${salesOrders.customerPhone} IS DISTINCT FROM ${ANON_PHONE}`,
                sql`${salesOrders.customerName} IS DISTINCT FROM ${ANON_NAME}`,
                isNotNull(salesOrders.address),
              ),
            ),
          )
          .orderBy(asc(salesOrders.id));
        return rows;
      }
      case 'admin_sessions_expired': {
        const rows = await orm
          .select({
            id: adminSessions.id,
            createdAt: adminSessions.createdAt,
          })
          .from(adminSessions)
          .where(
            and(
              lt(adminSessions.createdAt, cutoff),
              or(
                lte(adminSessions.expiresAt, sql`now()`),
                isNotNull(adminSessions.revokedAt),
              ),
            ),
          )
          .orderBy(asc(adminSessions.id));
        return rows;
      }
      case 'owner_alerts_resolved': {
        const rows = await orm
          .select({
            id: ownerAlerts.id,
            createdAt: ownerAlerts.createdAt,
          })
          .from(ownerAlerts)
          .where(
            and(
              eq(ownerAlerts.status, 'resolved'),
              lt(ownerAlerts.resolvedAt, cutoff),
            ),
          )
          .orderBy(asc(ownerAlerts.id));
        return rows;
      }
      case 'admin_audit_events':
        return [];
      default:
        return [];
    }
  }

  async applyAction(
    dataClass: PrivacyDataClass,
    action: RetentionAction,
    ids: string[],
    orm: RetentionOrm = this.database.orm,
  ): Promise<number> {
    if (ids.length === 0 || action === 'retain') {
      return 0;
    }
    if (action === 'delete') {
      switch (dataClass) {
        case 'whatsapp_inbound_messages': {
          const deleted = await orm
            .delete(whatsappInboundMessages)
            .where(inArray(whatsappInboundMessages.id, ids))
            .returning({ id: whatsappInboundMessages.id });
          return deleted.length;
        }
        case 'whatsapp_conversation_messages': {
          const deleted = await orm
            .delete(whatsappConversationMessages)
            .where(inArray(whatsappConversationMessages.id, ids))
            .returning({ id: whatsappConversationMessages.id });
          return deleted.length;
        }
        case 'whatsapp_outbound_messages': {
          const deleted = await orm
            .delete(whatsappOutboundMessages)
            .where(inArray(whatsappOutboundMessages.id, ids))
            .returning({ id: whatsappOutboundMessages.id });
          return deleted.length;
        }
        case 'admin_sessions_expired': {
          const deleted = await orm
            .delete(adminSessions)
            .where(inArray(adminSessions.id, ids))
            .returning({ id: adminSessions.id });
          return deleted.length;
        }
        case 'owner_alerts_resolved': {
          const deleted = await orm
            .delete(ownerAlerts)
            .where(inArray(ownerAlerts.id, ids))
            .returning({ id: ownerAlerts.id });
          return deleted.length;
        }
        default:
          throw new Error(`Delete not allowed for ${dataClass}`);
      }
    }

    // anonymize
    switch (dataClass) {
      case 'whatsapp_inbound_messages': {
        const updated = await orm
          .update(whatsappInboundMessages)
          .set({
            customerPhone: ANON_PHONE,
            textBody: null,
            payload: {},
          })
          .where(inArray(whatsappInboundMessages.id, ids))
          .returning({ id: whatsappInboundMessages.id });
        return updated.length;
      }
      case 'whatsapp_conversation_messages': {
        const updated = await orm
          .update(whatsappConversationMessages)
          .set({ textBody: null })
          .where(inArray(whatsappConversationMessages.id, ids))
          .returning({ id: whatsappConversationMessages.id });
        return updated.length;
      }
      case 'whatsapp_outbound_messages': {
        const updated = await orm
          .update(whatsappOutboundMessages)
          .set({
            customerPhone: ANON_PHONE,
            textBody: null,
          })
          .where(inArray(whatsappOutboundMessages.id, ids))
          .returning({ id: whatsappOutboundMessages.id });
        return updated.length;
      }
      case 'whatsapp_conversations': {
        let count = 0;
        for (const id of ids) {
          const anonPhone = `A${opaqueCustomerId(id)}`;
          const updated = await orm
            .update(whatsappConversations)
            .set({
              customerPhone: anonPhone,
              pendingDepartment: null,
            })
            .where(eq(whatsappConversations.id, id))
            .returning({ id: whatsappConversations.id });
          count += updated.length;
        }
        return count;
      }
      case 'sales_orders_customer_pii': {
        const updated = await orm
          .update(salesOrders)
          .set({
            customerName: ANON_NAME,
            customerPhone: ANON_PHONE,
            address: null,
            deliveryNotes: null,
            updatedAt: sql`now()`,
          })
          .where(inArray(salesOrders.id, ids))
          .returning({ id: salesOrders.id });
        const objectSnapshot = sql`CASE
          WHEN jsonb_typeof(${orderSummaries.snapshot}) = 'object'
            THEN ${orderSummaries.snapshot}
          ELSE '{}'::jsonb
        END`;
        const redactedRootSnapshot = sql`(
          ${objectSnapshot}
          #- '{customerName}'::text[]
          #- '{customerPhone}'::text[]
          #- '{address}'::text[]
          #- '{deliveryNotes}'::text[]
        ) || jsonb_build_object(
          'customerName', 'ANONIMIZADO',
          'customerPhone', '0000000000'
        )`;
        await orm
          .update(orderSummaries)
          .set({
            snapshot: sql`(
              ${redactedRootSnapshot}
            ) || CASE
              WHEN jsonb_typeof((${objectSnapshot})->'customer') = 'object'
                THEN jsonb_build_object(
                  'customer',
                  jsonb_set(
                    jsonb_set(
                      (${objectSnapshot})->'customer',
                      '{name}'::text[],
                      to_jsonb('ANONIMIZADO'::text)
                    ),
                    '{phone}'::text[],
                    to_jsonb('0000000000'::text)
                  )
                )
              ELSE '{}'::jsonb
            END
            || CASE
              WHEN jsonb_typeof((${objectSnapshot})->'destination') = 'object'
                THEN jsonb_build_object(
                  'destination',
                  jsonb_set(
                    jsonb_set(
                      (${objectSnapshot})->'destination',
                      '{address}'::text[],
                      'null'::jsonb
                    ),
                    '{deliveryNotes}'::text[],
                    'null'::jsonb
                  )
                )
              ELSE '{}'::jsonb
            END`,
          })
          .where(inArray(orderSummaries.orderId, ids));
        return updated.length;
      }
      default:
        throw new Error(`Anonymize not allowed for ${dataClass}`);
    }
  }

  async findCustomerRelated(
    customerPhone: string,
    orm: RetentionOrm = this.database.orm,
  ): Promise<CustomerRelatedSnapshot> {
    const profiles = await orm
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.normalizedPhone, customerPhone));
    const customerIds = profiles.map((profile) => profile.id);
    const orders = await orm
      .select({
        id: salesOrders.id,
        status: salesOrders.status,
        createdAt: salesOrders.createdAt,
        customerName: salesOrders.customerName,
        customerPhone: salesOrders.customerPhone,
        address: salesOrders.address,
      })
      .from(salesOrders)
      .where(
        or(
          and(
            sql`${salesOrders.customerId} IS NULL`,
            eq(salesOrders.customerPhone, customerPhone),
          ),
          customerIds.length === 0
            ? undefined
            : inArray(salesOrders.customerId, customerIds),
        ),
      );

    const inbound = await orm
      .select({ id: whatsappInboundMessages.id })
      .from(whatsappInboundMessages)
      .where(eq(whatsappInboundMessages.customerPhone, customerPhone));

    const conversations = await orm
      .select({ id: whatsappConversations.id })
      .from(whatsappConversations)
      .where(
        or(
          and(
            sql`${whatsappConversations.customerId} IS NULL`,
            eq(whatsappConversations.customerPhone, customerPhone),
          ),
          customerIds.length === 0
            ? undefined
            : inArray(whatsappConversations.customerId, customerIds),
        ),
      );

    const conversationIds = conversations.map((c) => c.id);
    const conversationMessages =
      conversationIds.length === 0
        ? []
        : await orm
            .select({ id: whatsappConversationMessages.id })
            .from(whatsappConversationMessages)
            .where(
              inArray(
                whatsappConversationMessages.conversationId,
                conversationIds,
              ),
            );

    const outbound = await orm
      .select({ id: whatsappOutboundMessages.id })
      .from(whatsappOutboundMessages)
      .where(
        or(
          and(
            sql`${whatsappOutboundMessages.conversationId} IS NULL`,
            eq(whatsappOutboundMessages.customerPhone, customerPhone),
          ),
          conversationIds.length === 0
            ? undefined
            : inArray(whatsappOutboundMessages.conversationId, conversationIds),
        ),
      );

    return {
      customerOpaqueId: opaqueCustomerId(customerPhone),
      customerIds,
      orders: orders.map((o) => ({
        id: o.id,
        status: o.status,
        createdAt: o.createdAt,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        address: o.address,
      })),
      inboundIds: inbound.map((r) => r.id),
      conversationMessageIds: conversationMessages.map((r) => r.id),
      outboundIds: outbound.map((r) => r.id),
      conversationIds,
    };
  }

  async anonymizeCustomer(customerPhone: string): Promise<{
    customerOpaqueId: string;
    relatedCounts: Record<string, number>;
  }> {
    return this.database.orm.transaction(async (tx) => {
      await lockCustomerPhone(tx, customerPhone);
      const related = await this.findCustomerRelated(customerPhone, tx);
      const orderIds = related.orders.map((o) => o.id);
      await this.applyAction(
        'sales_orders_customer_pii',
        'anonymize',
        orderIds,
        tx,
      );
      await this.applyAction(
        'whatsapp_inbound_messages',
        'anonymize',
        related.inboundIds,
        tx,
      );
      await this.applyAction(
        'whatsapp_conversation_messages',
        'anonymize',
        related.conversationMessageIds,
        tx,
      );
      await this.applyAction(
        'whatsapp_outbound_messages',
        'anonymize',
        related.outboundIds,
        tx,
      );
      await this.applyAction(
        'whatsapp_conversations',
        'anonymize',
        related.conversationIds,
        tx,
      );
      if (related.customerIds.length > 0) {
        await tx
          .update(customers)
          .set({
            displayName: null,
            normalizedPhone: null,
            marketingConsent: 'unknown',
            marketingConsentChannel: null,
            marketingConsentPurpose: null,
            marketingConsentNoticeVersion: null,
            marketingConsentEvidenceRef: null,
            marketingConsentRecordedAt: null,
            needsReview: true,
            updatedAt: new Date(),
          })
          .where(inArray(customers.id, related.customerIds));
      }
      return {
        customerOpaqueId: related.customerOpaqueId,
        relatedCounts: {
          customers: related.customerIds.length,
          orders: orderIds.length,
          inbound: related.inboundIds.length,
          conversationMessages: related.conversationMessageIds.length,
          outbound: related.outboundIds.length,
          conversations: related.conversationIds.length,
        },
      };
    });
  }
}
