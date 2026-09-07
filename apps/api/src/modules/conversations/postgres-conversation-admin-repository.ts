import { desc, eq, sql } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import {
  whatsappConversations,
  whatsappOutboundMessages,
} from '../../database/schema.js';

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
  list(limit?: number): Promise<readonly AdminConversation[]>;
  get(conversationId: string): Promise<AdminConversation | null>;
  takeControl(conversationId: string): Promise<void>;
  releaseControl(conversationId: string): Promise<void>;
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

  async list(limit = 50): Promise<readonly AdminConversation[]> {
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
      .orderBy(desc(whatsappConversations.updatedAt))
      .limit(limit);
    return rows.map((row) =>
      mapConversation(row.conversation, row.pendingOutbound),
    );
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

  async takeControl(conversationId: string): Promise<void> {
    await this.database.orm.transaction(async (tx) => {
      await tx
        .update(whatsappConversations)
        .set({ mode: 'human', updatedAt: new Date() })
        .where(eq(whatsappConversations.id, conversationId));
      await tx
        .update(whatsappOutboundMessages)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(
          sql`${whatsappOutboundMessages.conversationId} = ${conversationId}
            AND ${whatsappOutboundMessages.status} = 'pending'`,
        );
    });
  }

  async releaseControl(conversationId: string): Promise<void> {
    await this.database.orm
      .update(whatsappConversations)
      .set({ mode: 'bot', updatedAt: new Date() })
      .where(eq(whatsappConversations.id, conversationId));
  }
}
