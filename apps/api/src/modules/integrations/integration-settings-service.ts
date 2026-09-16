import type { z } from 'zod';
import type { IntegrationSettingsUpdateSchema } from '@camila/contracts';

import { IntegrationSecretCrypto } from './integration-secret-crypto.js';

type Update = z.infer<typeof IntegrationSettingsUpdateSchema>;
type Provider = 'whatsapp' | 'shipping';

type WhatsAppSettings = Readonly<{
  phoneNumberId: string;
  graphApiVersion: string;
  accessToken: string;
  appSecret?: string;
  webhookVerifyToken?: string;
}>;
type ShippingSettings = Readonly<{
  accountEmail: string;
  password: string;
  integrationToken?: string;
  integrationId?: string;
}>;

type Repository = Readonly<{
  get(provider: Provider): Promise<string | null>;
  upsert(provider: Provider, encryptedPayload: string): Promise<void>;
}>;

export class IntegrationSettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationSettingsError';
  }
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error('invalid');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new IntegrationSettingsError('La configuración cifrada no es válida');
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function parseWhatsApp(value: string): WhatsAppSettings {
  const record = parseObject(value);
  const phoneNumberId = stringValue(record.phoneNumberId);
  const graphApiVersion = stringValue(record.graphApiVersion);
  const accessToken = stringValue(record.accessToken);
  if (!phoneNumberId || !graphApiVersion || !accessToken) {
    throw new IntegrationSettingsError(
      'La configuración de WhatsApp está incompleta',
    );
  }
  return {
    phoneNumberId,
    graphApiVersion,
    accessToken,
    ...(stringValue(record.appSecret) === undefined
      ? {}
      : { appSecret: stringValue(record.appSecret)! }),
    ...(stringValue(record.webhookVerifyToken) === undefined
      ? {}
      : { webhookVerifyToken: stringValue(record.webhookVerifyToken)! }),
  };
}

function parseShipping(value: string): ShippingSettings {
  const record = parseObject(value);
  const accountEmail = stringValue(record.accountEmail);
  const password = stringValue(record.password);
  if (!accountEmail || !password) {
    throw new IntegrationSettingsError(
      'La configuración de 99envíos está incompleta',
    );
  }
  return {
    accountEmail,
    password,
    ...(stringValue(record.integrationToken) === undefined
      ? {}
      : { integrationToken: stringValue(record.integrationToken)! }),
    ...(stringValue(record.integrationId) === undefined
      ? {}
      : { integrationId: stringValue(record.integrationId)! }),
  };
}

export class IntegrationSettingsService {
  constructor(
    private readonly repository: Repository,
    private readonly crypto: IntegrationSecretCrypto,
  ) {}

  private async getSecret(provider: Provider): Promise<string | null> {
    const encrypted = await this.repository.get(provider);
    return encrypted === null ? null : this.crypto.decrypt(encrypted);
  }

  async getWhatsApp(): Promise<WhatsAppSettings | null> {
    const secret = await this.getSecret('whatsapp');
    return secret === null ? null : parseWhatsApp(secret);
  }

  async getShipping(): Promise<ShippingSettings | null> {
    const secret = await this.getSecret('shipping');
    return secret === null ? null : parseShipping(secret);
  }

  async getPublic() {
    const [whatsapp, shipping] = await Promise.all([
      this.getWhatsApp(),
      this.getShipping(),
    ]);
    return {
      whatsapp: {
        configured: whatsapp !== null,
        phoneNumberId: whatsapp?.phoneNumberId ?? null,
        graphApiVersion: whatsapp?.graphApiVersion ?? null,
      },
      shipping: {
        configured: shipping !== null,
        accountEmail: shipping?.accountEmail ?? null,
        integrationId: shipping?.integrationId ?? null,
      },
    };
  }

  async update(input: Update): Promise<void> {
    if (input.whatsapp !== undefined) {
      const existing = await this.getWhatsApp();
      const next = {
        ...existing,
        ...input.whatsapp,
        graphApiVersion:
          input.whatsapp.graphApiVersion ??
          existing?.graphApiVersion ??
          'v26.0',
      };
      if (!next.phoneNumberId || !next.accessToken) {
        throw new IntegrationSettingsError(
          'WhatsApp requiere identificador del número y token de acceso',
        );
      }
      await this.repository.upsert(
        'whatsapp',
        this.crypto.encrypt(JSON.stringify(next)),
      );
    }
    if (input.shipping !== undefined) {
      const existing = await this.getShipping();
      const next = { ...existing, ...input.shipping };
      if (!next.accountEmail || !next.password) {
        throw new IntegrationSettingsError(
          '99envíos requiere correo de cuenta y contraseña',
        );
      }
      await this.repository.upsert(
        'shipping',
        this.crypto.encrypt(JSON.stringify(next)),
      );
    }
  }
}

export type IntegrationSettingsOperations = Pick<
  IntegrationSettingsService,
  'getPublic' | 'update'
>;
