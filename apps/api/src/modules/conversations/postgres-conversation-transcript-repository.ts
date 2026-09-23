import { sql } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import type {
  ConversationTranscriptRepository,
  TranscriptMessage,
  TranscriptGuideEvent,
  TranscriptMessageSource,
  TranscriptMessageStatus,
  TranscriptPage,
} from './conversation-transcript-repository.js';

type MessageRow = {
  id: string;
  conversation_id: string;
  source: TranscriptMessageSource | 'system';
  message_type: 'text' | 'image' | 'template' | 'document' | 'event';
  text_body: string | null;
  media_storage_key: string | null;
  status: TranscriptMessageStatus | 'internal';
  provider_message_id: string | null;
  occurred_at: Date;
  cursor_occurred_at: string;
  guide_order_id: string | null;
  order_number: string | null;
  guide_job_id: string | null;
  pre_shipment_number: string | null;
  carrier: string | null;
};

type Cursor = { occurredAt: string; id: string };

function encodeCursor(occurredAt: string, id: string): string {
  return Buffer.from(
    JSON.stringify({
      occurredAt,
      id,
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
  if (row.source === 'system') {
    if (
      row.message_type !== 'event' ||
      row.status !== 'internal' ||
      row.guide_order_id === null ||
      row.order_number === null ||
      row.guide_job_id === null ||
      row.pre_shipment_number === null ||
      row.carrier === null
    ) {
      throw new Error('Internal guide event is missing required metadata');
    }
    const guideEvent: TranscriptGuideEvent = {
      id: row.id,
      conversationId: row.conversation_id,
      source: 'system',
      messageType: 'event',
      text: null,
      mediaUrl: null,
      status: 'internal',
      providerMessageId: null,
      occurredAt: new Date(row.occurred_at),
      orderId: row.guide_order_id,
      orderNumber: `PED-${row.order_number.padStart(6, '0')}`,
      guideJobId: row.guide_job_id,
      preShipmentNumber: row.pre_shipment_number,
      carrier: row.carrier,
    };
    return guideEvent;
  }

  if (row.status === 'internal') {
    throw new Error('WhatsApp message cannot have internal status');
  }

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
      SELECT message.id, message.conversation_id, message.source,
        message.message_type, message.text_body, message.media_storage_key,
        message.status, message.provider_message_id, message.occurred_at,
        to_char(message.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_occurred_at,
        message.guide_order_id, message.guide_job_id,
        job.pre_shipment_number, job.carrier,
        sales_order.order_number::text AS order_number
      FROM whatsapp_conversation_messages AS message
      LEFT JOIN shipping_guide_jobs AS job ON job.id = message.guide_job_id
      LEFT JOIN sales_orders AS sales_order ON sales_order.id = message.guide_order_id
      WHERE message.conversation_id = ${conversationId}
        AND (
          ${decoded?.occurredAt ?? null}::timestamptz IS NULL
          OR (message.occurred_at, message.id) < (${decoded?.occurredAt ?? null}::timestamptz, ${decoded?.id ?? null}::uuid)
        )
      ORDER BY message.occurred_at DESC, message.id DESC
      LIMIT ${safeLimit + 1}
    `);
    const items = rows.slice(0, safeLimit).map(mapMessage).reverse();
    const cursorRow = rows[safeLimit - 1];
    return {
      items,
      nextCursor:
        rows.length > safeLimit && cursorRow !== undefined
          ? encodeCursor(cursorRow.cursor_occurred_at, cursorRow.id)
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
