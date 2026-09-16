import type { z } from 'zod';
import {
  OwnerServiceHoursSchema,
  type IntegrationSettingsUpdateSchema,
} from '@camila/contracts';

import { IntegrationSecretCrypto } from './integration-secret-crypto.js';

type Update = z.infer<typeof IntegrationSettingsUpdateSchema>;
type Provider = 'whatsapp' | 'shipping';

type WhatsAppSettings = Readonly<{
  phoneNumberId: string;
  graphApiVersion: string;
  accessToken: string;
  timezone?: 'America/Bogota';
  serviceHours?: z.infer<typeof OwnerServiceHoursSchema> | null;
  wabaId?: string;
  ownerAlertPhone?: string;
  ownerAlertTemplate?: string;
  appSecret?: string;
  webhookVerifyToken?: string;
}>;
type ShippingSettings = Readonly<{
  originLocalityCode?: string;
  branchCode?: string;
  pdfType?: 1 | 2;
  accountEmail: string;
  password: string;
  integrationToken?: string;
  integrationId?: string;
}>;

type Repository = Readonly<{
  draft?(
    provider: Provider,
  ): Promise<{ encryptedPayload: string; revision: number } | null>;
  stage?(
    provider: Provider,
    encryptedPayload: string,
    author: string,
    publicConfiguration?: Record<string, unknown>,
  ): Promise<void>;
  tested?(provider: Provider, revision: number): Promise<boolean>;
  activate?(
    provider: Provider,
    revision: number,
    author: string,
  ): Promise<boolean>;
  lifecycle?(): Promise<unknown>;
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
    ...(record.timezone === 'America/Bogota'
      ? { timezone: 'America/Bogota' as const }
      : {}),
    ...(record.serviceHours === undefined
      ? {}
      : {
          serviceHours:
            record.serviceHours === null
              ? null
              : OwnerServiceHoursSchema.parse(record.serviceHours),
        }),
    ...(stringValue(record.wabaId)
      ? { wabaId: stringValue(record.wabaId)! }
      : {}),
    ...(stringValue(record.ownerAlertPhone)
      ? { ownerAlertPhone: stringValue(record.ownerAlertPhone)! }
      : {}),
    ...(stringValue(record.ownerAlertTemplate)
      ? { ownerAlertTemplate: stringValue(record.ownerAlertTemplate)! }
      : {}),
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
    ...(stringValue(record.originLocalityCode)
      ? { originLocalityCode: stringValue(record.originLocalityCode)! }
      : {}),
    ...(stringValue(record.branchCode)
      ? { branchCode: stringValue(record.branchCode)! }
      : {}),
    ...(record.pdfType === 1 || record.pdfType === 2
      ? { pdfType: record.pdfType }
      : {}),
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
  async lifecycle() {
    return this.repository.lifecycle?.() ?? { drafts: [], versions: [] };
  }
  private async store(provider: Provider, settings: object, author: string) {
    const encrypted = this.crypto.encrypt(JSON.stringify(settings));
    const publicConfiguration = Object.fromEntries(
      Object.entries(settings).filter(
        ([key]) =>
          ![
            'accessToken',
            'appSecret',
            'webhookVerifyToken',
            'accountEmail',
            'password',
            'integrationToken',
            'integrationId',
          ].includes(key),
      ),
    );
    if (this.repository.stage)
      await this.repository.stage(
        provider,
        encrypted,
        author,
        publicConfiguration,
      );
    else await this.repository.upsert(provider, encrypted);
  }
  async test(provider: Provider) {
    const draft = await this.repository.draft?.(provider);
    if (!draft || !this.repository.tested)
      throw new IntegrationSettingsError(
        'Guarda un borrador antes de probar la conexión.',
      );
    const decrypted = this.crypto.decrypt(draft.encryptedPayload);
    let response: Response;
    if (provider === 'shipping') {
      const settings = parseShipping(decrypted);
      response = await fetch(
        'https://integration.99envios.app/api/integration/v1/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: settings.accountEmail,
            password: settings.password,
          }),
          signal: AbortSignal.timeout(20000),
        },
      );
      if (
        !response.ok ||
        typeof ((await response.json()) as { token?: unknown }).token !==
          'string'
      )
        throw new IntegrationSettingsError(
          '99envíos no validó las credenciales. No se creó ninguna guía.',
        );
    } else {
      const settings = parseWhatsApp(decrypted);
      response = await fetch(
        `https://graph.facebook.com/${settings.graphApiVersion}/${encodeURIComponent(settings.phoneNumberId)}?fields=id,display_phone_number`,
        {
          headers: { Authorization: `Bearer ${settings.accessToken}` },
          signal: AbortSignal.timeout(20000),
        },
      );
      if (
        !response.ok ||
        ((await response.json()) as { id?: unknown }).id !==
          settings.phoneNumberId
      )
        throw new IntegrationSettingsError(
          'Meta no validó el acceso al número. No se envió ningún mensaje.',
        );
    }
    if (!(await this.repository.tested(provider, draft.revision)))
      throw new IntegrationSettingsError(
        'El borrador cambió durante la prueba. Vuelve a probar.',
      );
    return this.lifecycle();
  }
  async activate(provider: Provider, revision: number, author: string) {
    if (!(await this.repository.activate?.(provider, revision, author)))
      throw new IntegrationSettingsError(
        'Prueba el borrador actual antes de activarlo. La prueba vence en 15 minutos.',
      );
    return this.lifecycle();
  }

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
    const [activeWhatsApp, activeShipping, whatsappDraft, shippingDraft] =
      await Promise.all([
        this.getWhatsApp(),
        this.getShipping(),
        this.repository.draft?.('whatsapp'),
        this.repository.draft?.('shipping'),
      ]);
    const whatsapp = whatsappDraft
      ? parseWhatsApp(this.crypto.decrypt(whatsappDraft.encryptedPayload))
      : activeWhatsApp;
    const shipping = shippingDraft
      ? parseShipping(this.crypto.decrypt(shippingDraft.encryptedPayload))
      : activeShipping;
    return {
      whatsapp: {
        configured: activeWhatsApp !== null,
        phoneNumberId: whatsapp?.phoneNumberId ?? null,
        graphApiVersion: whatsapp?.graphApiVersion ?? null,
        ...(whatsapp?.timezone ? { timezone: whatsapp.timezone } : {}),
        ...(whatsapp?.serviceHours === undefined
          ? {}
          : { serviceHours: whatsapp.serviceHours }),
        ...(whatsapp?.wabaId ? { wabaId: whatsapp.wabaId } : {}),
        ...(whatsapp?.ownerAlertPhone
          ? { ownerAlertPhone: whatsapp.ownerAlertPhone }
          : {}),
        ...(whatsapp?.ownerAlertTemplate
          ? { ownerAlertTemplate: whatsapp.ownerAlertTemplate }
          : {}),
      },
      shipping: {
        configured: activeShipping !== null,
        accountEmail: shipping?.accountEmail ?? null,
        integrationId: null,
        ...(shipping?.branchCode ? { branchCode: shipping.branchCode } : {}),
        ...(shipping?.pdfType ? { pdfType: shipping.pdfType } : {}),
        ...(shipping?.originLocalityCode
          ? { originLocalityCode: shipping.originLocalityCode }
          : {}),
      },
    };
  }

  async update(input: Update, author = 'owner'): Promise<void> {
    if (input.whatsapp !== undefined) {
      const draft = await this.repository.draft?.('whatsapp');
      const existing = draft
        ? parseWhatsApp(this.crypto.decrypt(draft.encryptedPayload))
        : await this.getWhatsApp();
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
      await this.store('whatsapp', next, author);
    }
    if (input.shipping !== undefined) {
      const draft = await this.repository.draft?.('shipping');
      const existing = draft
        ? parseShipping(this.crypto.decrypt(draft.encryptedPayload))
        : await this.getShipping();
      const next = { ...existing, ...input.shipping };
      if (!next.accountEmail || !next.password) {
        throw new IntegrationSettingsError(
          '99envíos requiere correo de cuenta y contraseña',
        );
      }
      await this.store('shipping', next, author);
    }
  }
}

export type IntegrationSettingsOperations = Pick<
  IntegrationSettingsService,
  'getPublic' | 'update'
> &
  Partial<
    Pick<
      IntegrationSettingsService,
      'getWhatsApp' | 'lifecycle' | 'test' | 'activate'
    >
  >;
