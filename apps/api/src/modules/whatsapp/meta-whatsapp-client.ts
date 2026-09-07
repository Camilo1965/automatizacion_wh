import { z } from 'zod';

const sendResponseSchema = z
  .object({
    messages: z.array(z.object({ id: z.string().min(1) }).strict()).min(1),
  })
  .strict();
const uploadResponseSchema = z.object({ id: z.string().min(1) }).strict();

export type MetaWhatsAppClientOptions = Readonly<{
  accessToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
  fetch?: typeof globalThis.fetch;
}>;

export class MetaWhatsAppClient {
  private readonly request: typeof globalThis.fetch;

  constructor(private readonly options: MetaWhatsAppClientOptions) {
    this.request = options.fetch ?? globalThis.fetch;
  }

  async sendText(
    customerPhone: string,
    body: string,
  ): Promise<Readonly<{ whatsappMessageId: string }>> {
    const response = await this.request(
      `https://graph.facebook.com/${this.options.graphApiVersion}/${this.options.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: customerPhone.replace(/^\+/, ''),
          type: 'text',
          text: { preview_url: false, body },
        }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `WhatsApp text send failed with status ${response.status}`,
      );
    }
    const parsed = sendResponseSchema.safeParse(await response.json());
    if (!parsed.success)
      throw new Error('WhatsApp text send returned invalid data');
    return { whatsappMessageId: parsed.data.messages[0]!.id };
  }

  async sendImage(
    customerPhone: string,
    bytes: Uint8Array,
    mimeType: 'image/jpeg' | 'image/png',
    caption: string,
  ): Promise<Readonly<{ whatsappMessageId: string }>> {
    const form = new FormData();
    form.set('messaging_product', 'whatsapp');
    form.set('type', mimeType);
    const imageBuffer = bytes.slice().buffer as ArrayBuffer;
    form.set(
      'file',
      new Blob([imageBuffer], { type: mimeType }),
      'catalog-image',
    );
    const uploaded = await this.request(
      `https://graph.facebook.com/${this.options.graphApiVersion}/${this.options.phoneNumberId}/media`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.options.accessToken}` },
        body: form,
      },
    );
    if (!uploaded.ok) {
      throw new Error(
        `WhatsApp media upload failed with status ${uploaded.status}`,
      );
    }
    const media = uploadResponseSchema.safeParse(await uploaded.json());
    if (!media.success)
      throw new Error('WhatsApp media upload returned invalid data');

    const response = await this.request(
      `https://graph.facebook.com/${this.options.graphApiVersion}/${this.options.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: customerPhone.replace(/^\+/, ''),
          type: 'image',
          image: { id: media.data.id, caption },
        }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `WhatsApp image send failed with status ${response.status}`,
      );
    }
    const sent = sendResponseSchema.safeParse(await response.json());
    if (!sent.success)
      throw new Error('WhatsApp image send returned invalid data');
    return { whatsappMessageId: sent.data.messages[0]!.id };
  }
}
