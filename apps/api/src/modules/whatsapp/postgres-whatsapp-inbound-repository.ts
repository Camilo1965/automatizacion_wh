import { whatsappInboundMessages } from '../../database/schema/index.js';
import type { PostgresDatabase } from '../../database/client.js';
import { lockCustomerPhones } from '../customers/customer-contact.js';

import type { InboundWhatsAppMessage } from './whatsapp-event.js';
import type { WhatsAppInboundRepository } from './whatsapp-inbound-repository.js';

export class PostgresWhatsAppInboundRepository implements WhatsAppInboundRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async storeMany(messages: readonly InboundWhatsAppMessage[]): Promise<void> {
    if (messages.length === 0) return;
    await this.database.orm.transaction(async (tx) => {
      await lockCustomerPhones(
        tx,
        messages.map((message) => message.customerPhone),
      );
      await tx
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
    });
  }
}
