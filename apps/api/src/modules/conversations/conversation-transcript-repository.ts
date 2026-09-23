export type TranscriptMessageSource =
  'customer' | 'bot' | 'owner_panel' | 'owner_mobile';

export type TranscriptMessageStatus =
  | 'received'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'cancelled';

export type TranscriptWhatsAppMessage = Readonly<{
  id: string;
  conversationId: string;
  source: TranscriptMessageSource;
  messageType: 'text' | 'image' | 'template' | 'document' | 'event';
  text: string | null;
  mediaUrl: string | null;
  status: TranscriptMessageStatus;
  providerMessageId: string | null;
  occurredAt: Date;
}>;

export type TranscriptGuideEvent = Readonly<{
  id: string;
  conversationId: string;
  source: 'system';
  messageType: 'event';
  text: null;
  mediaUrl: null;
  status: 'internal';
  providerMessageId: null;
  occurredAt: Date;
  orderId: string;
  orderNumber: string;
  guideJobId: string;
  preShipmentNumber: string;
  carrier: string;
}>;

export type TranscriptMessage =
  TranscriptWhatsAppMessage | TranscriptGuideEvent;

export type TranscriptPage = Readonly<{
  items: readonly TranscriptMessage[];
  nextCursor: string | null;
}>;

export interface ConversationTranscriptRepository {
  listMessages(
    conversationId: string,
    limit?: number,
    cursor?: string,
  ): Promise<TranscriptPage>;
  updateProviderStatus(
    providerMessageId: string,
    status: 'delivered' | 'read',
  ): Promise<void>;
}
