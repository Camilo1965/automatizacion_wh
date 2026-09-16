import { z } from 'zod';

export type AppConfig = Readonly<{
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databaseUrl: string;
  adminOrigin: string;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  mediaRoot: string;
  whatsappWebhookVerifyToken?: string;
  whatsappAppSecret?: string;
  whatsappAccessToken?: string;
  whatsappPhoneNumberId?: string;
  whatsappGraphApiVersion?: string;
  ninetyNineEnviosEmail?: string;
  ninetyNineEnviosPassword?: string;
  ninetyNineEnviosIntegrationToken?: string;
  ninetyNineEnviosIntegrationId?: string;
  integrationEncryptionKey?: string;
}>;

export class ConfigurationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    const uniqueIssues = [...new Set(issues)];
    super(`Invalid configuration: ${uniqueIssues.join(', ')}`);
    this.name = 'ConfigurationError';
    this.issues = uniqueIssues;
  }
}

const nodeEnvSchema = z.enum(['development', 'test', 'production']);
const logLevelSchema = z.enum([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]);

function isDatabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'postgresql:' || url.protocol === 'postgres:';
  } catch {
    return false;
  }
}

function isAdminOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    if (url.username !== '' || url.password !== '') {
      return false;
    }
    if (url.pathname !== '/' && url.pathname !== '') {
      return false;
    }
    if (url.search !== '' || url.hash !== '') {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function parsePort(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') {
    return 3000;
  }

  if (!/^\d+$/.test(value)) {
    return undefined;
  }

  const port = Number.parseInt(value, 10);
  if (port < 1 || port > 65535) {
    return undefined;
  }

  return port;
}

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const issues: string[] = [];

  const nodeEnvResult = nodeEnvSchema.safeParse(
    environment.NODE_ENV ?? 'development',
  );
  if (!nodeEnvResult.success) {
    issues.push('NODE_ENV');
  }

  const host =
    environment.HOST === undefined || environment.HOST.trim() === ''
      ? '127.0.0.1'
      : environment.HOST;

  const port = parsePort(environment.PORT);
  if (port === undefined) {
    issues.push('PORT');
  }

  const databaseUrl = environment.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    issues.push('DATABASE_URL');
  } else if (!isDatabaseUrl(databaseUrl)) {
    issues.push('DATABASE_URL');
  }

  const adminOriginRaw =
    environment.ADMIN_ORIGIN === undefined ||
    environment.ADMIN_ORIGIN.trim() === ''
      ? 'http://127.0.0.1:5173'
      : environment.ADMIN_ORIGIN;

  let adminOrigin = adminOriginRaw;
  if (!isAdminOrigin(adminOriginRaw)) {
    issues.push('ADMIN_ORIGIN');
  } else {
    const parsed = new URL(adminOriginRaw);
    adminOrigin = parsed.origin;
  }

  const logLevelResult = logLevelSchema.safeParse(
    environment.LOG_LEVEL ?? 'info',
  );
  if (!logLevelResult.success) {
    issues.push('LOG_LEVEL');
  }

  let mediaRoot = './var/media';
  if (environment.MEDIA_ROOT !== undefined) {
    if (environment.MEDIA_ROOT.trim() === '') {
      issues.push('MEDIA_ROOT');
    } else {
      mediaRoot = environment.MEDIA_ROOT;
    }
  }

  const whatsappWebhookVerifyToken =
    environment.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() || undefined;
  const whatsappAppSecret =
    environment.WHATSAPP_APP_SECRET?.trim() || undefined;
  const whatsappAccessToken =
    environment.WHATSAPP_ACCESS_TOKEN?.trim() || undefined;
  const whatsappPhoneNumberId =
    environment.WHATSAPP_PHONE_NUMBER_ID?.trim() || undefined;
  const whatsappGraphApiVersion =
    environment.WHATSAPP_GRAPH_API_VERSION?.trim() || 'v26.0';
  if (
    (whatsappAccessToken === undefined) !==
    (whatsappPhoneNumberId === undefined)
  ) {
    issues.push('WHATSAPP_SENDING_CREDENTIALS');
  }
  if (!/^v\d+\.\d+$/.test(whatsappGraphApiVersion)) {
    issues.push('WHATSAPP_GRAPH_API_VERSION');
  }
  const ninetyNineEnviosEmail =
    environment.NINETYNINE_ENVIOS_EMAIL?.trim() || undefined;
  const ninetyNineEnviosPassword =
    environment.NINETYNINE_ENVIOS_PASSWORD?.trim() || undefined;
  const ninetyNineEnviosIntegrationToken =
    environment.NINETYNINE_ENVIOS_INTEGRATION_TOKEN?.trim() || undefined;
  const ninetyNineEnviosIntegrationId =
    environment.NINETYNINE_ENVIOS_INTEGRATION_ID?.trim() || undefined;
  const integrationEncryptionKey =
    environment.KAIRO_CONFIG_ENCRYPTION_KEY?.trim() ||
    environment.INTEGRATION_ENCRYPTION_KEY?.trim() ||
    undefined;
  if (
    environment.NODE_ENV === 'production' &&
    integrationEncryptionKey === undefined
  )
    issues.push('INTEGRATION_ENCRYPTION_KEY');
  if (
    integrationEncryptionKey !== undefined &&
    Buffer.from(integrationEncryptionKey, 'base64').length !== 32
  ) {
    issues.push('INTEGRATION_ENCRYPTION_KEY');
  }
  if (
    (ninetyNineEnviosEmail === undefined) !==
    (ninetyNineEnviosPassword === undefined)
  ) {
    issues.push('NINETYNINE_ENVIOS_CREDENTIALS');
  }

  if (
    issues.length > 0 ||
    !nodeEnvResult.success ||
    port === undefined ||
    databaseUrl === undefined ||
    !logLevelResult.success
  ) {
    throw new ConfigurationError(issues);
  }

  return {
    nodeEnv: nodeEnvResult.data,
    host,
    port,
    databaseUrl,
    adminOrigin,
    logLevel: logLevelResult.data,
    mediaRoot,
    whatsappGraphApiVersion,
    ...(whatsappWebhookVerifyToken === undefined
      ? {}
      : { whatsappWebhookVerifyToken }),
    ...(whatsappAppSecret === undefined ? {} : { whatsappAppSecret }),
    ...(whatsappAccessToken === undefined ? {} : { whatsappAccessToken }),
    ...(whatsappPhoneNumberId === undefined ? {} : { whatsappPhoneNumberId }),
    ...(ninetyNineEnviosEmail === undefined ? {} : { ninetyNineEnviosEmail }),
    ...(ninetyNineEnviosPassword === undefined
      ? {}
      : { ninetyNineEnviosPassword }),
    ...(ninetyNineEnviosIntegrationToken === undefined
      ? {}
      : { ninetyNineEnviosIntegrationToken }),
    ...(ninetyNineEnviosIntegrationId === undefined
      ? {}
      : { ninetyNineEnviosIntegrationId }),
    ...(integrationEncryptionKey === undefined
      ? {}
      : { integrationEncryptionKey }),
  };
}
