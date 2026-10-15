import { and, desc, eq, lt, or, sql } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import {
  customers,
  whatsappConversations,
} from '../../database/schema/index.js';

export type AdminConversation = Readonly<{
  id: string;
  customerPhone: string;
  customerId: string | null;
  state: string;
  mode: 'bot' | 'human';
  selectedSize: string | null;
  activeOrderId: string | null;
  pendingOutbound: number;
  customerName: string | null;
  lastPreview: string | null;
  unreadCount: number;
  lastMessageAt: Date | null;
  lastInboundMessageAt: Date;
  updatedAt: Date;
}>;

export interface ConversationAdminRepository {
  list(input?: {
    limit?: number;
    after?: Readonly<{ updatedAt: Date; id: string }>;
  }): Promise<{
    items: readonly AdminConversation[];
    nextCursor: Readonly<{ updatedAt: Date; id: string }> | null;
  }>;
  get(conversationId: string): Promise<AdminConversation | null>;
  markRead?(conversationId: string): Promise<boolean>;
  takeControl(conversationId: string): Promise<void>;
  releaseControl(conversationId: string): Promise<void>;
  getManualContext?(conversationId: string): Promise<{
    customerPhone: string;
    controlMode: 'bot' | 'human';
    lastInboundMessageAt: Date;
  } | null>;
}

function mapConversation(
  row: typeof whatsappConversations.$inferSelect,
  pendingOutbound: number,
  customerName: string | null,
  lastPreview: string | null,
  unreadCount: number,
  lastMessageAt: Date | null,
): AdminConversation {
  const mappedLastMessageAt =
    lastMessageAt === null
      ? null
      : lastMessageAt instanceof Date
        ? lastMessageAt
        : new Date(String(lastMessageAt));
  return {
    id: row.id,
    customerPhone: row.customerPhone,
    customerId: row.customerId,
    state: row.state,
    mode: row.mode as 'bot' | 'human',
    selectedSize: row.selectedSize,
    activeOrderId: row.activeOrderId,
    pendingOutbound,
    customerName,
    lastPreview,
    unreadCount,
    lastMessageAt: mappedLastMessageAt,
    lastInboundMessageAt: row.lastInboundMessageAt,
    updatedAt: row.updatedAt,
  };
}

export class PostgresConversationAdminRepository implements ConversationAdminRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async list(
    input: {
      limit?: number;
      after?: Readonly<{ updatedAt: Date; id: string }>;
    } = {},
  ): Promise<{
    items: readonly AdminConversation[];
    nextCursor: Readonly<{ updatedAt: Date; id: string }> | null;
  }> {
    const limit = input.limit ?? 50;
    const conditions =
      input.after === undefined
        ? undefined
        : or(
            lt(whatsappConversations.updatedAt, input.after.updatedAt),
            and(
              eq(whatsappConversations.updatedAt, input.after.updatedAt),
              lt(whatsappConversations.id, input.after.id),
            ),
          );
    const rows = await this.database.orm
      .select({
        conversation: whatsappConversations,
        pendingOutbound: sql<number>`(
          SELECT count(*)::int
          FROM whatsapp_outbound_messages AS outbound
          WHERE outbound.conversation_id = "whatsapp_conversations"."id"
            AND outbound.status = 'pending'
        )`,
        customerName: customers.displayName,
        lastPreview: sql<string | null>`(
          SELECT COALESCE(
            NULLIF(BTRIM(message.text_body), ''),
            CASE message.message_type
              WHEN 'image' THEN 'Imagen adjunta'
              WHEN 'audio' THEN 'Audio adjunto'
              WHEN 'document' THEN 'Documento adjunto'
              WHEN 'event' THEN 'Actualización del pedido'
              ELSE 'Mensaje'
            END
          )
          FROM whatsapp_conversation_messages AS message
          WHERE message.conversation_id = "whatsapp_conversations"."id"
          ORDER BY message.occurred_at DESC, message.id DESC
          LIMIT 1
        )`,
        unreadCount: sql<number>`(
          SELECT count(*)::int
          FROM whatsapp_conversation_messages AS message
          WHERE message.conversation_id = "whatsapp_conversations"."id"
            AND message.source = 'customer'
            AND message.occurred_at > COALESCE(
              "whatsapp_conversations"."last_read_at",
              '-infinity'::timestamptz
            )
        )`,
        lastMessageAt: sql<Date | null>`(
          SELECT max(message.occurred_at)
          FROM whatsapp_conversation_messages AS message
          WHERE message.conversation_id = "whatsapp_conversations"."id"
        )`,
      })
      .from(whatsappConversations)
      .leftJoin(customers, eq(customers.id, whatsappConversations.customerId))
      .where(conditions)
      .orderBy(
        desc(whatsappConversations.updatedAt),
        desc(whatsappConversations.id),
      )
      .limit(limit + 1);
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1)?.conversation;
    return {
      items: pageRows.map((row) =>
        mapConversation(
          row.conversation,
          row.pendingOutbound,
          row.customerName,
          row.lastPreview,
          row.unreadCount,
          row.lastMessageAt,
        ),
      ),
      nextCursor:
        rows.length > limit && last !== undefined
          ? { updatedAt: last.updatedAt, id: last.id }
          : null,
    };
  }

  async get(conversationId: string): Promise<AdminConversation | null> {
    const [row] = await this.database.orm
      .select({
        conversation: whatsappConversations,
        pendingOutbound: sql<number>`(
          SELECT count(*)::int
          FROM whatsapp_outbound_messages AS outbound
          WHERE outbound.conversation_id = "whatsapp_conversations"."id"
            AND outbound.status = 'pending'
        )`,
        customerName: customers.displayName,
        lastPreview: sql<string | null>`(
          SELECT COALESCE(
            NULLIF(BTRIM(message.text_body), ''),
            CASE message.message_type
              WHEN 'image' THEN 'Imagen adjunta'
              WHEN 'audio' THEN 'Audio adjunto'
              WHEN 'document' THEN 'Documento adjunto'
              WHEN 'event' THEN 'Actualización del pedido'
              ELSE 'Mensaje'
            END
          )
          FROM whatsapp_conversation_messages AS message
          WHERE message.conversation_id = "whatsapp_conversations"."id"
          ORDER BY message.occurred_at DESC, message.id DESC
          LIMIT 1
        )`,
        unreadCount: sql<number>`(
          SELECT count(*)::int
          FROM whatsapp_conversation_messages AS message
          WHERE message.conversation_id = "whatsapp_conversations"."id"
            AND message.source = 'customer'
            AND message.occurred_at > COALESCE(
              "whatsapp_conversations"."last_read_at",
              '-infinity'::timestamptz
            )
        )`,
        lastMessageAt: sql<Date | null>`(
          SELECT max(message.occurred_at)
          FROM whatsapp_conversation_messages AS message
          WHERE message.conversation_id = "whatsapp_conversations"."id"
        )`,
      })
      .from(whatsappConversations)
      .leftJoin(customers, eq(customers.id, whatsappConversations.customerId))
      .where(eq(whatsappConversations.id, conversationId))
      .limit(1);
    return row === undefined
      ? null
      : mapConversation(
          row.conversation,
          row.pendingOutbound,
          row.customerName,
          row.lastPreview,
          row.unreadCount,
          row.lastMessageAt,
        );
  }

  async markRead(conversationId: string): Promise<boolean> {
    const rows = await this.database.orm
      .update(whatsappConversations)
      .set({ lastReadAt: new Date() })
      .where(eq(whatsappConversations.id, conversationId))
      .returning({ id: whatsappConversations.id });
    return rows.length > 0;
  }

  async getManualContext(conversationId: string) {
    const [row] = await this.database.orm
      .select({
        customerPhone: whatsappConversations.customerPhone,
        mode: whatsappConversations.mode,
        lastInboundMessageAt: whatsappConversations.lastInboundMessageAt,
      })
      .from(whatsappConversations)
      .where(eq(whatsappConversations.id, conversationId))
      .limit(1);
    return row === undefined
      ? null
      : {
          customerPhone: row.customerPhone,
          controlMode: row.mode as 'bot' | 'human',
          lastInboundMessageAt: row.lastInboundMessageAt,
        };
  }

  async takeControl(conversationId: string): Promise<void> {
    await this.database.orm.transaction(async (tx) => {
      const rows = await tx.execute<{ customer_phone: string }>(sql`
        SELECT customer_phone FROM whatsapp_conversations WHERE id = ${conversationId}
      `);
      const conversation = rows[0];
      if (conversation === undefined) return;
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${conversation.customer_phone}))`,
      );
      await tx.execute(
        sql`SELECT id FROM whatsapp_conversations WHERE id = ${conversationId} FOR UPDATE`,
      );
      await tx.execute(sql`
        UPDATE whatsapp_conversations
        SET mode = 'human', updated_at = clock_timestamp()
        WHERE id = ${conversationId}
      `);
      await tx.execute(sql`
        WITH cancelled AS (
          UPDATE whatsapp_outbound_messages
          SET status = 'cancelled', updated_at = clock_timestamp()
          WHERE conversation_id = ${conversationId}
            AND status = 'pending' AND source = 'bot'
          RETURNING id
        )
        UPDATE whatsapp_conversation_messages AS transcript
        SET status = 'cancelled', updated_at = clock_timestamp()
        FROM cancelled
        WHERE transcript.outbound_message_id = cancelled.id
      `);
    });
  }

  async releaseControl(conversationId: string): Promise<void> {
    await this.database.orm.transaction(async (tx) => {
      const rows = await tx.execute<{ customer_phone: string }>(sql`
        SELECT customer_phone FROM whatsapp_conversations WHERE id = ${conversationId}
      `);
      const conversation = rows[0];
      if (conversation === undefined) return;
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${conversation.customer_phone}))`,
      );
      await tx.execute(sql`
        UPDATE whatsapp_conversations
        SET mode = 'bot', updated_at = clock_timestamp()
        WHERE id = ${conversationId}
      `);
    });
  }
}
