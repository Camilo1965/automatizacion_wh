import { and, desc, eq, lt, or, sql } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import { whatsappConversations } from '../../database/schema.js';

export type AdminConversation = Readonly<{
  id: string;
  customerPhone: string;
  state: string;
  mode: 'bot' | 'human';
  selectedSize: string | null;
  activeOrderId: string | null;
  pendingOutbound: number;
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
): AdminConversation {
  return {
    id: row.id,
    customerPhone: row.customerPhone,
    state: row.state,
    mode: row.mode as 'bot' | 'human',
    selectedSize: row.selectedSize,
    activeOrderId: row.activeOrderId,
    pendingOutbound,
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
          WHERE outbound.conversation_id = ${whatsappConversations.id}
            AND outbound.status = 'pending'
        )`,
      })
      .from(whatsappConversations)
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
        mapConversation(row.conversation, row.pendingOutbound),
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
          WHERE outbound.conversation_id = ${whatsappConversations.id}
            AND outbound.status = 'pending'
        )`,
      })
      .from(whatsappConversations)
      .where(eq(whatsappConversations.id, conversationId))
      .limit(1);
    return row === undefined
      ? null
      : mapConversation(row.conversation, row.pendingOutbound);
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
