import {
  NinetyNineEnviosClient,
  type CreatePreShipmentInput,
  type QuoteInput,
} from '../shipping/99envios-client.js';
import { MetaWhatsAppClient } from '../whatsapp/meta-whatsapp-client.js';
import type { IntegrationSettingsService } from './integration-settings-service.js';

export class IntegrationNotConfiguredError extends Error {
  constructor(provider: 'WhatsApp' | '99envíos') {
    super(`${provider} is not configured`);
    this.name = 'IntegrationNotConfiguredError';
  }
}

type WhatsAppFallback = Readonly<{
  accessToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
}>;
type ShippingFallback = Readonly<{
  email: string;
  password: string;
  integrationToken?: string;
  integrationId?: string;
}>;

export class ConfiguredWhatsAppClient {
  constructor(
    private readonly settings: IntegrationSettingsService | undefined,
    private readonly fallback: WhatsAppFallback | undefined,
  ) {}

  private async client() {
    const current = (await this.settings?.getWhatsApp()) ?? this.fallback;
    if (current === undefined) throw new IntegrationNotConfiguredError('WhatsApp');
    return new MetaWhatsAppClient({
      accessToken: current.accessToken,
      phoneNumberId: current.phoneNumberId,
      graphApiVersion: current.graphApiVersion,
    });
  }

  async sendText(customerPhone: string, body: string) {
    return (await this.client()).sendText(customerPhone, body);
  }

  async sendImage(
    customerPhone: string,
    bytes: Uint8Array,
    mimeType: 'image/jpeg' | 'image/png',
    caption: string,
  ) {
    return (await this.client()).sendImage(customerPhone, bytes, mimeType, caption);
  }
}

export class ConfiguredNinetyNineEnviosClient {
  constructor(
    private readonly settings: IntegrationSettingsService | undefined,
    private readonly fallback: ShippingFallback | undefined,
  ) {}

  private async client() {
    const saved = await this.settings?.getShipping();
    const current = saved ?? this.fallback;
    if (current === undefined) throw new IntegrationNotConfiguredError('99envíos');
    return new NinetyNineEnviosClient({
      email: saved?.accountEmail ?? this.fallback!.email,
      password: current.password,
      ...(current.integrationToken === undefined
        ? {}
        : { integrationToken: current.integrationToken }),
      ...(current.integrationId === undefined
        ? {}
        : { integrationId: current.integrationId }),
    });
  }

  async quote(input: QuoteInput) {
    return (await this.client()).quote(input);
  }

  async createPreShipment(input: CreatePreShipmentInput) {
    return (await this.client()).createPreShipment(input);
  }

  async getGuidePdf(preShipmentNumber: string, carrier: string) {
    return (await this.client()).getGuidePdf(preShipmentNumber, carrier);
  }
}
