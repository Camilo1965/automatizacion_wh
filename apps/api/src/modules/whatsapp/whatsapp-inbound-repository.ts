import type { InboundWhatsAppMessage } from './whatsapp-event.js';

export interface WhatsAppInboundRepository {
  storeMany(messages: readonly InboundWhatsAppMessage[]): Promise<void>;
}
