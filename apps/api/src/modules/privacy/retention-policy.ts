import type { PrivacyDataClass, RetentionAction } from '@camila/contracts';

export type PrivacyInventoryDefinition = {
  dataClass: PrivacyDataClass;
  tables: string[];
  piiFields: string[];
  relationshipStrategy: string;
  allowedActions: RetentionAction[];
};

/**
 * Explicit inventory: each class names tables, PII fields, relationship strategy
 * and allowed actions. Orders that must be retained allow anonymize/retain only.
 */
export const PRIVACY_INVENTORY: readonly PrivacyInventoryDefinition[] = [
  {
    dataClass: 'whatsapp_inbound_messages',
    tables: ['whatsapp_inbound_messages'],
    piiFields: ['customer_phone', 'text_body', 'payload'],
    relationshipStrategy:
      'Independent rows; delete removes message; anonymize redacts phone/body/payload.',
    allowedActions: ['retain', 'anonymize', 'delete'],
  },
  {
    dataClass: 'whatsapp_conversation_messages',
    tables: ['whatsapp_conversation_messages'],
    piiFields: ['text_body'],
    relationshipStrategy:
      'Child of whatsapp_conversations; delete message rows; anonymize clears text_body.',
    allowedActions: ['retain', 'anonymize', 'delete'],
  },
  {
    dataClass: 'whatsapp_outbound_messages',
    tables: ['whatsapp_outbound_messages'],
    piiFields: ['customer_phone', 'text_body'],
    relationshipStrategy:
      'Outbox rows; delete or anonymize customer phone / text body.',
    allowedActions: ['retain', 'anonymize', 'delete'],
  },
  {
    dataClass: 'whatsapp_conversations',
    tables: ['whatsapp_conversations'],
    piiFields: ['customer_phone', 'pending_department'],
    relationshipStrategy:
      'May reference sales_orders (restrict); anonymize phone only — do not delete while order FK exists.',
    allowedActions: ['retain', 'anonymize'],
  },
  {
    dataClass: 'sales_orders_customer_pii',
    tables: ['sales_orders', 'order_summaries'],
    piiFields: [
      'customer_name',
      'customer_phone',
      'address',
      'delivery_notes',
      'order_summaries.snapshot',
    ],
    relationshipStrategy:
      'Commercial/accounting retention: anonymize PII in place; never delete order rows via retention.',
    allowedActions: ['retain', 'anonymize'],
  },
  {
    dataClass: 'admin_sessions_expired',
    tables: ['admin_sessions'],
    piiFields: ['token_hash'],
    relationshipStrategy:
      'Expired/revoked sessions only; safe to delete; active sessions untouched.',
    allowedActions: ['retain', 'delete'],
  },
  {
    dataClass: 'owner_alerts_resolved',
    tables: ['owner_alerts'],
    piiFields: ['title', 'detail'],
    relationshipStrategy:
      'Resolved alerts only; delete after policy duration; deliveries cascade separately if configured.',
    allowedActions: ['retain', 'delete'],
  },
  {
    dataClass: 'admin_audit_events',
    tables: ['admin_audit_events'],
    piiFields: ['actor_username', 'metadata'],
    relationshipStrategy:
      'Immutable audit trail — retain only; never delete or anonymize via retention jobs.',
    allowedActions: ['retain'],
  },
] as const;

export function inventoryFor(
  dataClass: PrivacyDataClass,
): PrivacyInventoryDefinition {
  const found = PRIVACY_INVENTORY.find((item) => item.dataClass === dataClass);
  if (found === undefined) {
    throw new Error(`Unknown privacy data class: ${dataClass}`);
  }
  return found;
}
