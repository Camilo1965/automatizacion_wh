import { sql } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import type {
  ConversationTranscriptRepository,
  TranscriptMessage,
  TranscriptMessageSource,
  TranscriptMessageStatus,
  TranscriptPage,
} from './conversation-transcript-repository.js';

type MessageRow = {
  id: string;
  conversation_id: string;
  source: TranscriptMessageSource;
  message_type: TranscriptMessage['messageType'];
  text_body: string | null;
  media_storage_key: string | null;
  status: TranscriptMessageStatus;
  provider_message_id: string | null;
  occurred_at: Date;
};

type Cursor = { occurredAt: string; id: string };

function encodeCursor(message: TranscriptMessage): string {
  return Buffer.from(
    JSON.stringify({
      occurredAt: message.occurredAt.toISOString(),
      id: message.id,
    }),
  ).toString('base64url');
}

function decodeCursor(value: string): Cursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('occurredAt' in parsed) ||
      !('id' in parsed) ||
      typeof parsed.occurredAt !== 'string' ||
      Number.isNaN(Date.parse(parsed.occurredAt)) ||
      typeof parsed.id !== 'string'
    ) {
      throw new Error('invalid');
    }
    return { occurredAt: parsed.occurredAt, id: parsed.id };
  } catch {
    throw new Error('Invalid conversation message cursor');
  }
}

function mapMessage(row: MessageRow): TranscriptMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    source: row.source,
    messageType: row.message_type,
    text: row.text_body,
    mediaUrl:
      row.media_storage_key === null
        ? null
        : `/api/admin/conversations/${row.conversation_id}/messages/${row.id}/media`,
    status: row.status,
    providerMessageId: row.provider_message_id,
    occurredAt: new Date(row.occurred_at),
  };
}

export class PostgresConversationTranscriptRepository implements ConversationTranscriptRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async listMessages(
    conversationId: string,
    limit = 50,
    cursor?: string,
  ): Promise<TranscriptPage> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const decoded = cursor === undefined ? null : decodeCursor(cursor);
    const rows = await this.database.orm.execute<MessageRow>(sql`
      SELECT id, conversation_id, source, message_type, text_body,
        media_storage_key, status, provider_message_id, occurred_at
      FROM whatsapp_conversation_messages
      WHERE conversation_id = ${conversationId}
        AND (
          ${decoded?.occurredAt ?? null}::timestamptz IS NULL
          OR (occurred_at, id) < (${decoded?.occurredAt ?? null}::timestamptz, ${decoded?.id ?? null}::uuid)
        )
      ORDER BY occurred_at DESC, id DESC
      LIMIT ${safeLimit + 1}
    `);
    const items = rows.slice(0, safeLimit).map(mapMessage).reverse();
    return {
      items,
      nextCursor:
        rows.length > safeLimit && items.length > 0
          ? encodeCursor(items[0]!)
          : null,
    };
  }

  async updateProviderStatus(
    providerMessageId: string,
    status: 'delivered' | 'read',
  ): Promise<void> {
    await this.database.orm.execute(sql`
      UPDATE whatsapp_conversation_messages
      SET status = ${status}, updated_at = clock_timestamp()
      WHERE provider_message_id = ${providerMessageId}
        AND source <> 'customer'
        AND status NOT IN ('failed', 'cancelled')
        AND CASE status
          WHEN 'queued' THEN 0 WHEN 'sent' THEN 1
          WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 ELSE -1
        END < ${status === 'delivered' ? 2 : 3}
    `);
  }
}
