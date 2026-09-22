import { z } from 'zod';

export type StorageDriver = 'local' | 's3';

export type S3StorageConfig = Readonly<{
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  tlsRejectUnauthorized: boolean;
}>;

export type AppConfig = Readonly<{
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  databaseUrl: string;
  adminOrigin: string;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  mediaRoot: string;
  storageDriver: StorageDriver;
  s3?: S3StorageConfig;
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
  /** Absolute session lifetime in hours (default 12). */
  sessionAbsoluteTtlHours?: number;
  /** Idle timeout in minutes (default 60 in production, 720 elsewhere). */
  sessionIdleTtlMinutes?: number;
  /** Minimum seconds between lastSeenAt writes (default 300). */
  sessionLastSeenThrottleSeconds?: number;
  /**
   * When false (default), retention execute/resume is refused.
   * Dry-run always allowed for owners with security:manage.
   */
  retentionExecutionEnabled?: boolean;
  /** When false, /metrics returns 404. Default true. */
  metricsEnabled?: boolean;
  /** Optional bearer token protecting /metrics (internal network still required). */
  metricsToken?: string;
  /** Worker-only metrics listen port (internal network). Default 9091. */
  workerMetricsPort?: number;
  /** Optional error-tracking DSN URL. Never commit the real value. */
  errorTrackingDsn?: string;
  /** Release / git SHA attached to sanitized error reports. */
  releaseSha?: string;
  /** Path to backup heartbeat JSON for metrics gauges. */
  backupMetricsPath?: string;
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

const EXAMPLE_SECRET_VALUES = new Set([
  'change_me',
  'change-me',
  'changeme',
  'change_me_use_long_random_secret',
  'replace_me',
  'your_password_here',
  'password',
  'secret',
  'admin',
  'postgres',
  'example',
  'kairo_test',
  'kairo_test_secret',
]);

function looksLikeExampleSecret(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') {
    return true;
  }
  const normalized = trimmed.toLowerCase();
  if (EXAMPLE_SECRET_VALUES.has(normalized)) {
    return true;
  }
  if (/change[_-]?me/i.test(normalized)) {
    return true;
  }
  return false;
}

function databasePasswordFromUrl(databaseUrl: string): string | undefined {
  try {
    const password = new URL(databaseUrl).password;
    return password === '' ? undefined : password;
  } catch {
    return undefined;
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
    if (
      nodeEnvResult.success &&
      nodeEnvResult.data === 'production' &&
      parsed.protocol !== 'https:'
    ) {
      issues.push('ADMIN_ORIGIN');
    }
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

  const nodeEnvValue = nodeEnvResult.success
    ? nodeEnvResult.data
    : 'development';

  const storageDriverRaw =
    environment.STORAGE_DRIVER === undefined ||
    environment.STORAGE_DRIVER.trim() === ''
      ? nodeEnvValue === 'production'
        ? ''
        : 'local'
      : environment.STORAGE_DRIVER.trim();
  let storageDriver: StorageDriver | undefined;
  if (storageDriverRaw === 'local' || storageDriverRaw === 's3') {
    storageDriver = storageDriverRaw;
  } else {
    issues.push('STORAGE_DRIVER');
  }
  if (nodeEnvValue === 'production' && storageDriver !== 's3') {
    issues.push('STORAGE_DRIVER');
  }
  if (nodeEnvValue === 'production' && storageDriver === 'local') {
    issues.push('STORAGE_DRIVER');
  }

  let s3: S3StorageConfig | undefined;
  if (storageDriver === 's3') {
    const endpoint = environment.S3_ENDPOINT?.trim() ?? '';
    const bucket = environment.S3_BUCKET?.trim() ?? '';
    const region = environment.S3_REGION?.trim() ?? '';
    const accessKeyId = environment.S3_ACCESS_KEY_ID?.trim() ?? '';
    const secretAccessKey = environment.S3_SECRET_ACCESS_KEY?.trim() ?? '';
    if (endpoint === '') issues.push('S3_ENDPOINT');
    if (bucket === '') issues.push('S3_BUCKET');
    if (region === '') issues.push('S3_REGION');
    if (accessKeyId === '') issues.push('S3_ACCESS_KEY_ID');
    if (secretAccessKey === '') issues.push('S3_SECRET_ACCESS_KEY');

    const forcePathStyleRaw =
      environment.S3_FORCE_PATH_STYLE?.trim().toLowerCase() ?? 'true';
    if (forcePathStyleRaw !== 'true' && forcePathStyleRaw !== 'false') {
      issues.push('S3_FORCE_PATH_STYLE');
    }
    const tlsRaw =
      environment.S3_TLS_REJECT_UNAUTHORIZED?.trim().toLowerCase() ?? 'true';
    if (tlsRaw !== 'true' && tlsRaw !== 'false') {
      issues.push('S3_TLS_REJECT_UNAUTHORIZED');
    }

    if (
      endpoint !== '' &&
      bucket !== '' &&
      region !== '' &&
      accessKeyId !== '' &&
      secretAccessKey !== '' &&
      (forcePathStyleRaw === 'true' || forcePathStyleRaw === 'false') &&
      (tlsRaw === 'true' || tlsRaw === 'false')
    ) {
      s3 = {
        endpoint,
        bucket,
        region,
        accessKeyId,
        secretAccessKey,
        forcePathStyle: forcePathStyleRaw === 'true',
        tlsRejectUnauthorized: tlsRaw === 'true',
      };
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
    nodeEnvValue === 'production' &&
    integrationEncryptionKey !== undefined &&
    looksLikeExampleSecret(integrationEncryptionKey)
  ) {
    issues.push('INTEGRATION_ENCRYPTION_KEY');
  }
  if (nodeEnvValue === 'production' && databaseUrl !== undefined) {
    const dbPassword = databasePasswordFromUrl(databaseUrl);
    if (dbPassword !== undefined && looksLikeExampleSecret(dbPassword)) {
      issues.push('DATABASE_URL');
    }
  }
  if (nodeEnvValue === 'production' && s3 !== undefined) {
    if (looksLikeExampleSecret(s3.accessKeyId)) {
      issues.push('S3_ACCESS_KEY_ID');
    }
    if (looksLikeExampleSecret(s3.secretAccessKey)) {
      issues.push('S3_SECRET_ACCESS_KEY');
    }
  }
  if (
    nodeEnvValue === 'production' &&
    ninetyNineEnviosPassword !== undefined &&
    looksLikeExampleSecret(ninetyNineEnviosPassword)
  ) {
    issues.push('NINETYNINE_ENVIOS_PASSWORD');
  }
  if (
    (ninetyNineEnviosEmail === undefined) !==
    (ninetyNineEnviosPassword === undefined)
  ) {
    issues.push('NINETYNINE_ENVIOS_CREDENTIALS');
  }

  const defaultIdleMinutes = nodeEnvValue === 'production' ? 60 : 720;

  let sessionAbsoluteTtlHours = 12;
  if (environment.SESSION_ABSOLUTE_TTL_HOURS !== undefined) {
    if (!/^\d+$/.test(environment.SESSION_ABSOLUTE_TTL_HOURS.trim())) {
      issues.push('SESSION_ABSOLUTE_TTL_HOURS');
    } else {
      sessionAbsoluteTtlHours = Number.parseInt(
        environment.SESSION_ABSOLUTE_TTL_HOURS,
        10,
      );
      if (sessionAbsoluteTtlHours < 1 || sessionAbsoluteTtlHours > 168) {
        issues.push('SESSION_ABSOLUTE_TTL_HOURS');
      }
    }
  }

  let sessionIdleTtlMinutes = defaultIdleMinutes;
  if (environment.SESSION_IDLE_TTL_MINUTES !== undefined) {
    if (!/^\d+$/.test(environment.SESSION_IDLE_TTL_MINUTES.trim())) {
      issues.push('SESSION_IDLE_TTL_MINUTES');
    } else {
      sessionIdleTtlMinutes = Number.parseInt(
        environment.SESSION_IDLE_TTL_MINUTES,
        10,
      );
      if (sessionIdleTtlMinutes < 1 || sessionIdleTtlMinutes > 10_080) {
        issues.push('SESSION_IDLE_TTL_MINUTES');
      }
    }
  }

  let sessionLastSeenThrottleSeconds = 300;
  if (environment.SESSION_LAST_SEEN_THROTTLE_SECONDS !== undefined) {
    if (!/^\d+$/.test(environment.SESSION_LAST_SEEN_THROTTLE_SECONDS.trim())) {
      issues.push('SESSION_LAST_SEEN_THROTTLE_SECONDS');
    } else {
      sessionLastSeenThrottleSeconds = Number.parseInt(
        environment.SESSION_LAST_SEEN_THROTTLE_SECONDS,
        10,
      );
      if (
        sessionLastSeenThrottleSeconds < 0 ||
        sessionLastSeenThrottleSeconds > 3600
      ) {
        issues.push('SESSION_LAST_SEEN_THROTTLE_SECONDS');
      }
    }
  }

  const retentionExecutionEnabled =
    environment.RETENTION_EXECUTION_ENABLED === 'true';

  const metricsEnabled =
    environment.METRICS_ENABLED === undefined ||
    environment.METRICS_ENABLED.trim() === '' ||
    environment.METRICS_ENABLED.trim().toLowerCase() === 'true';
  if (
    environment.METRICS_ENABLED !== undefined &&
    environment.METRICS_ENABLED.trim() !== '' &&
    !['true', 'false'].includes(
      environment.METRICS_ENABLED.trim().toLowerCase(),
    )
  ) {
    issues.push('METRICS_ENABLED');
  }

  const metricsToken = environment.METRICS_TOKEN?.trim() || undefined;
  if (metricsToken !== undefined && looksLikeExampleSecret(metricsToken)) {
    issues.push('METRICS_TOKEN');
  }

  let workerMetricsPort = 9091;
  if (environment.WORKER_METRICS_PORT !== undefined) {
    const parsed = parsePort(environment.WORKER_METRICS_PORT);
    if (parsed === undefined) {
      issues.push('WORKER_METRICS_PORT');
    } else {
      workerMetricsPort = parsed;
    }
  }

  const errorTrackingDsn = environment.ERROR_TRACKING_DSN?.trim() || undefined;
  if (errorTrackingDsn !== undefined) {
    try {
      const url = new URL(errorTrackingDsn);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        issues.push('ERROR_TRACKING_DSN');
      }
    } catch {
      issues.push('ERROR_TRACKING_DSN');
    }
  }

  const releaseSha =
    environment.KAIRO_RELEASE_SHA?.trim() ||
    environment.GIT_SHA?.trim() ||
    environment.SOURCE_COMMIT?.trim() ||
    undefined;

  const backupMetricsPath =
    environment.BACKUP_METRICS_PATH?.trim() || undefined;

  if (
    issues.length > 0 ||
    !nodeEnvResult.success ||
    port === undefined ||
    databaseUrl === undefined ||
    !logLevelResult.success ||
    storageDriver === undefined
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
    storageDriver,
    ...(s3 === undefined ? {} : { s3 }),
    whatsappGraphApiVersion,
    sessionAbsoluteTtlHours,
    sessionIdleTtlMinutes,
    sessionLastSeenThrottleSeconds,
    retentionExecutionEnabled,
    metricsEnabled,
    workerMetricsPort,
    ...(metricsToken === undefined ? {} : { metricsToken }),
    ...(errorTrackingDsn === undefined ? {} : { errorTrackingDsn }),
    ...(releaseSha === undefined ? {} : { releaseSha }),
    ...(backupMetricsPath === undefined ? {} : { backupMetricsPath }),
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
