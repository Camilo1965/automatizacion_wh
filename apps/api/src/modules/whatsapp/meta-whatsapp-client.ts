import { z } from 'zod';

const sendResponseSchema = z
  .object({
    messages: z.array(z.object({ id: z.string().min(1) }).passthrough()).min(1),
    messaging_product: z.literal('whatsapp').optional(),
    contacts: z
      .array(z.object({ wa_id: z.string(), input: z.string().optional() }))
      .optional(),
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
  async sendOwnerAlert(phone: string, template: string, text: string) {
    const response = await this.request(
      `https://graph.facebook.com/${this.options.graphApiVersion}/${this.options.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.accessToken}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: template,
            language: { code: 'es_CO' },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: text.slice(0, 1024) }],
              },
            ],
          },
        }),
      },
    );
    if (!response.ok)
      throw new Error(`WhatsApp alert failed with status ${response.status}`);
    return {
      whatsappMessageId: sendResponseSchema.parse(await response.json())
        .messages[0]!.id,
    };
  }
  async sendDocument(
    customerPhone: string,
    bytes: Uint8Array,
    filename: string,
    caption: string,
  ) {
    const form = new FormData();
    form.set('messaging_product', 'whatsapp');
    form.set('type', 'application/pdf');
    form.set(
      'file',
      new Blob([bytes.slice().buffer as ArrayBuffer], {
        type: 'application/pdf',
      }),
      filename,
    );
    const headers = { Authorization: `Bearer ${this.options.accessToken}` };
    const mediaResponse = await this.request(
      `https://graph.facebook.com/${this.options.graphApiVersion}/${this.options.phoneNumberId}/media`,
      {
        method: 'POST',
        headers,
        body: form,
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!mediaResponse.ok)
      throw new Error(
        `WhatsApp document upload failed with status ${mediaResponse.status}`,
      );
    const media = uploadResponseSchema.parse(await mediaResponse.json());
    const response = await this.request(
      `https://graph.facebook.com/${this.options.graphApiVersion}/${this.options.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: customerPhone.replace(/^\+/, ''),
          type: 'document',
          document: { id: media.id, filename, caption },
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok)
      throw new Error(
        `WhatsApp document send failed with status ${response.status}`,
      );
    const sent = sendResponseSchema.parse(await response.json());
    return { whatsappMessageId: sent.messages[0]!.id };
  }

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
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok) {
      let detail = '';
      try {
        const failed = (await response.json()) as {
          error?: { message?: string; code?: number; error_data?: unknown };
        };
        detail = failed.error?.message
          ? `: ${failed.error.message}`
          : `: ${JSON.stringify(failed).slice(0, 240)}`;
      } catch {
        /* response body was not JSON */
      }
      throw new Error(
        `WhatsApp text send failed with status ${response.status}${detail}`,
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
        signal: AbortSignal.timeout(30000),
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
        signal: AbortSignal.timeout(30000),
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
