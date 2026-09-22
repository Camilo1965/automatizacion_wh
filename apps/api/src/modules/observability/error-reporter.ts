/**
 * Optional production error tracking via DSN webhook.
 * Never embeds secrets; scrubs PII before send; attaches release SHA + correlation ID.
 */

export type ErrorReporterOptions = Readonly<{
  /** HTTP endpoint that accepts JSON error reports. Never commit the real value. */
  dsn?: string;
  releaseSha?: string;
  environment?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  maxMessageLength?: number;
}>;

export type SanitizedErrorReport = Readonly<{
  message: string;
  name: string;
  stack?: string;
  correlationId?: string;
  release?: string;
  environment?: string;
  tags: Readonly<Record<string, string>>;
  timestamp: string;
}>;

const PII_PATTERNS: readonly RegExp[] = [
  /\b\d{10}\b/g, // Colombian mobile-ish
  /\b57\d{10}\b/g,
  /\b[\w.+-]+@[\w.-]+\.\w{2,}\b/gi,
  /\b(?:password|passwd|secret|token|authorization|cookie|api[_-]?key)\s*[:=]\s*\S+/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\bpostgresql:\/\/[^\s]+/gi,
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/g, // long base64-ish blobs
];

const SENSITIVE_KEYS = new Set([
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'cookie',
  'phone',
  'customerphone',
  'email',
  'address',
  'name',
  'customername',
  'accessToken',
  'accesstoken',
  'appsecret',
  'webhookverifytoken',
]);

export function scrubPii(value: string): string {
  let scrubbed = value;
  for (const pattern of PII_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, '[REDACTED]');
  }
  return scrubbed;
}

export function scrubUnknown(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (typeof value === 'string') return scrubPii(value);
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => scrubUnknown(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = scrubUnknown(nested, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

function errorName(error: unknown): string {
  if (error instanceof Error && error.name.trim() !== '') return error.name;
  return 'Error';
}

function errorMessage(error: unknown, maxLength: number): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'unknown_error';
  return scrubPii(raw).slice(0, maxLength);
}

function errorStack(error: unknown, maxLength: number): string | undefined {
  if (!(error instanceof Error) || error.stack === undefined) return undefined;
  return scrubPii(error.stack).slice(0, maxLength);
}

export function sanitizeErrorReport(
  error: unknown,
  options: Readonly<{
    correlationId?: string;
    releaseSha?: string;
    environment?: string;
    tags?: Readonly<Record<string, string>>;
    maxMessageLength?: number;
    now?: () => Date;
  }> = {},
): SanitizedErrorReport {
  const maxLength = options.maxMessageLength ?? 2000;
  const tags: Record<string, string> = {};
  for (const [key, value] of Object.entries(options.tags ?? {})) {
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(key)) continue;
    tags[key] = scrubPii(value).slice(0, 64);
  }
  const stack = errorStack(error, maxLength);
  const report: SanitizedErrorReport = {
    message: errorMessage(error, maxLength),
    name: scrubPii(errorName(error)).slice(0, 120),
    tags,
    timestamp: (options.now ?? (() => new Date()))().toISOString(),
    ...(stack === undefined ? {} : { stack }),
    ...(options.correlationId === undefined
      ? {}
      : { correlationId: options.correlationId }),
    ...(options.releaseSha === undefined || options.releaseSha.trim() === ''
      ? {}
      : { release: options.releaseSha.trim().slice(0, 64) }),
    ...(options.environment === undefined
      ? {}
      : { environment: options.environment }),
  };
  return report;
}

export class ErrorReporter {
  private readonly dsn: string | undefined;
  private readonly releaseSha: string | undefined;
  private readonly environment: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly maxMessageLength: number;

  constructor(options: ErrorReporterOptions = {}) {
    this.dsn = options.dsn?.trim() || undefined;
    this.releaseSha = options.releaseSha?.trim() || undefined;
    this.environment = options.environment;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.maxMessageLength = options.maxMessageLength ?? 2000;
  }

  get enabled(): boolean {
    return this.dsn !== undefined;
  }

  buildReport(
    error: unknown,
    context?: Readonly<{
      correlationId?: string;
      tags?: Readonly<Record<string, string>>;
    }>,
  ): SanitizedErrorReport {
    return sanitizeErrorReport(error, {
      ...(context?.correlationId === undefined
        ? {}
        : { correlationId: context.correlationId }),
      ...(this.releaseSha === undefined ? {} : { releaseSha: this.releaseSha }),
      ...(this.environment === undefined
        ? {}
        : { environment: this.environment }),
      ...(context?.tags === undefined ? {} : { tags: context.tags }),
      maxMessageLength: this.maxMessageLength,
      now: this.now,
    });
  }

  async report(
    error: unknown,
    context?: Readonly<{
      correlationId?: string;
      tags?: Readonly<Record<string, string>>;
    }>,
  ): Promise<SanitizedErrorReport | null> {
    const report = this.buildReport(error, context);
    if (this.dsn === undefined) {
      return null;
    }
    try {
      await this.fetchImpl(this.dsn, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(report),
      });
    } catch {
      // Never throw from telemetry — observability must not break the request path.
    }
    return report;
  }
}

export function createErrorReporterFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ErrorReporter {
  const dsn = env.ERROR_TRACKING_DSN?.trim();
  const releaseSha = (
    env.KAIRO_RELEASE_SHA ??
    env.GIT_SHA ??
    env.SOURCE_COMMIT
  )?.trim();
  const environment = env.NODE_ENV?.trim();
  const options: ErrorReporterOptions = {
    ...(dsn ? { dsn } : {}),
    ...(releaseSha ? { releaseSha } : {}),
    ...(environment ? { environment } : {}),
  };
  return new ErrorReporter(options);
}
