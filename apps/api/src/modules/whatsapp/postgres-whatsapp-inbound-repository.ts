import { whatsappInboundMessages } from '../../database/schema.js';
import type { PostgresDatabase } from '../../database/client.js';

import type { InboundWhatsAppMessage } from './whatsapp-event.js';
import type { WhatsAppInboundRepository } from './whatsapp-inbound-repository.js';

export class PostgresWhatsAppInboundRepository implements WhatsAppInboundRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async storeMany(messages: readonly InboundWhatsAppMessage[]): Promise<void> {
    if (messages.length === 0) return;
    await this.database.orm
      .insert(whatsappInboundMessages)
      .values(
        messages.map((message) => ({
          whatsappMessageId: message.whatsappMessageId,
          businessPhoneNumberId: message.businessPhoneNumberId,
          customerPhone: message.customerPhone,
          messageType: message.messageType,
          textBody: message.textBody,
          receivedAt: message.receivedAt,
          payload: message.payload,
        })),
      )
      .onConflictDoNothing({
        target: whatsappInboundMessages.whatsappMessageId,
      });
  }
}
