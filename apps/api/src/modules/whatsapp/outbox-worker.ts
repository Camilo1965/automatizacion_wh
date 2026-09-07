export type ClaimedOutboundMessage = Readonly<
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

export class OutboxWorker {
  constructor(
    private readonly repository: OutboxWorkerRepository,
    private readonly client: WhatsAppClient,
    private readonly photoStorage?: OutboxPhotoStorage,
  ) {}

  async runOnce(): Promise<boolean> {
    const message = await this.repository.claimNext();
    if (message === null) return false;
    try {
      const sent =
        message.messageType === 'text'
          ? await this.client.sendText(message.customerPhone, message.textBody)
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
    }
    return true;
  }

  private requirePhotoStorage(): OutboxPhotoStorage {
    if (this.photoStorage === undefined) {
      throw new Error('Photo storage is required for image messages');
    }
    return this.photoStorage;
  }
}
