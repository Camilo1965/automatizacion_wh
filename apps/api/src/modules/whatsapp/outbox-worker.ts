export type ClaimedOutboundMessage = Readonly<
  | {
      id: string;
      customerPhone: string;
      messageType: 'document';
      textBody: string;
      mediaStorageKey: string;
      mediaMimeType: 'application/pdf';
    }
  | {
      id: string;
      customerPhone: string;
      messageType: 'text';
      textBody: string;
    }
  | {
      id: string;
      customerPhone: string;
      messageType: 'image';
      textBody: string;
      mediaStorageKey: string;
      mediaMimeType: 'image/jpeg' | 'image/png';
    }
>;

export interface OutboxWorkerRepository {
  claimNext(): Promise<ClaimedOutboundMessage | null>;
  markSent(id: string, whatsappMessageId: string): Promise<void>;
  markFailed(id: string, errorCode: string): Promise<void>;
}

export interface WhatsAppClient {
  sendDocument?(
    customerPhone: string,
    bytes: Uint8Array,
    filename: string,
    caption: string,
  ): Promise<Readonly<{ whatsappMessageId: string }>>;
  sendText(
    customerPhone: string,
    body: string,
  ): Promise<Readonly<{ whatsappMessageId: string }>>;
  sendImage(
    customerPhone: string,
    bytes: Uint8Array,
    mimeType: 'image/jpeg' | 'image/png',
    caption: string,
  ): Promise<Readonly<{ whatsappMessageId: string }>>;
}

export interface OutboxPhotoStorage {
  read(storageKey: string): Promise<Uint8Array>;
}

type IncidentSink = Readonly<{
  open(
    input: Readonly<{
      type: string;
      severity: 'critical';
      title: string;
      detail: string;
      entityUrl: string;
      entityId: string;
      retrySafe: boolean;
    }>,
  ): Promise<unknown>;
}>;

export class OutboxWorker {
  constructor(
    private readonly repository: OutboxWorkerRepository,
    private readonly client: WhatsAppClient,
    private readonly photoStorage?: OutboxPhotoStorage,
    private readonly incidents?: IncidentSink,
    private readonly documentStorage?: OutboxPhotoStorage,
  ) {}

  async runOnce(): Promise<boolean> {
    const message = await this.repository.claimNext();
    if (message === null) return false;
    try {
      const sent =
        message.messageType === 'text'
          ? await this.client.sendText(message.customerPhone, message.textBody)
          : message.messageType === 'document'
            ? await this.sendDocument(message)
            : await this.client.sendImage(
                message.customerPhone,
                await this.requirePhotoStorage().read(message.mediaStorageKey),
                message.mediaMimeType,
                message.textBody,
              );
      await this.repository.markSent(message.id, sent.whatsappMessageId);
    } catch (error) {
      const code = error instanceof Error ? error.name : 'UnknownError';
      await this.repository.markFailed(message.id, code);
      await this.incidents?.open({
        type: 'whatsapp_send_failed',
        severity: 'critical',
        title: 'Mensaje de WhatsApp no enviado',
        detail:
          error instanceof Error ? error.message : 'Error desconocido de Meta',
        entityUrl: '/conversations',
        entityId: message.id,
        retrySafe: false,
      });
    }
    return true;
  }

  private requirePhotoStorage(): OutboxPhotoStorage {
    if (this.photoStorage === undefined) {
      throw new Error('Photo storage is required for image messages');
    }
    return this.photoStorage;
  }
  private async sendDocument(
    message: Extract<ClaimedOutboundMessage, { messageType: 'document' }>,
  ) {
    if (!this.documentStorage || !this.client.sendDocument)
      throw new Error('Document delivery is not configured');
    return this.client.sendDocument(
      message.customerPhone,
      await this.documentStorage.read(message.mediaStorageKey),
      'guia-de-envio.pdf',
      message.textBody,
    );
  }
}
