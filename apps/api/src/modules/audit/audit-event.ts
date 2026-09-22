/**
 * Unified admin/business audit events (design §8.4).
 *
 * IP policy: raw client IPs are NOT stored. Optional `ipHash` may hold a
 * one-way hash only if legal/privacy approval later authorizes that field.
 * Until then callers omit it.
 */

export type AuditResult = 'success' | 'failure';

/** Canonical action names for sensitive security and business operations. */
export type AuditAction =
  | 'login.succeeded'
  | 'login.failed'
  | 'mfa.verify_succeeded'
  | 'mfa.verify_failed'
  | 'mfa.enabled'
  | 'mfa.disabled'
  | 'session.revoked'
  | 'session.revoked_others'
  | 'role.changed'
  | 'user.created'
  | 'user.deactivated'
  | 'integration.activated'
  | 'integration.updated'
  | 'bot_flow.published'
  | 'locality_catalog.published'
  | 'shipping_policy.updated'
  | 'inventory.adjusted'
  | 'inventory.closure_generated'
  | 'inventory.closure_acknowledged'
  | 'order.transitioned'
  | 'data.exported'
  | 'data_subject.previewed'
  | 'data_subject.anonymized'
  | 'retention.executed'
  | 'retention.simulated'
  | 'retention.policy_drafted'
  | 'retention.policy_activated';

export type AuditMetadataValue = string | number | boolean | null;
export type AuditMetadata = Record<string, AuditMetadataValue>;

export type AuditRecordInput = {
  actorUserId?: string | null;
  actorUsername?: string | null;
  action: AuditAction | string;
  targetType?: string | null;
  targetId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
  result: AuditResult;
  /** One-way hash only; never raw IP. Omitted until legally approved. */
  ipHash?: string | null;
  at?: Date;
};

export type AuditRecord = {
  id: string;
  actorUserId: string | null;
  actorUsername: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  correlationId: string | null;
  metadata: AuditMetadata;
  result: AuditResult;
  ipHash: string | null;
  createdAt: Date;
};

export type AuditListQuery = {
  limit?: number;
  offset?: number;
  actorUserId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  result?: AuditResult;
  from?: Date;
  to?: Date;
};

export type AuditListResult = {
  items: AuditRecord[];
  total: number;
  limit: number;
  offset: number;
};

const SENSITIVE_KEY =
  /^(password|passwordconfirmation|currentpassword|token|mfotoxin|accesstoken|appsecret|webhookverifytoken|integrationtoken|secret|totp|otp|recovery|recoverycode|code|authorization|cookie|document|address|phone|message|body|content|csvcontent|snapshot)$/i;

const SENSITIVE_SUBSTRING =
  /password|secret|token|totp|recovery|credential|authorization/i;

/**
 * Strip secrets and high-risk PII from audit metadata before persistence.
 * Never store passwords, tokens, TOTP secrets, full documents, addresses, or message bodies.
 */
export function sanitizeAuditMetadata(
  input: Record<string, unknown> | undefined,
): AuditMetadata {
  if (input === undefined) {
    return {};
  }
  const output: AuditMetadata = {};
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY.test(key) || SENSITIVE_SUBSTRING.test(key)) {
      continue;
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      if (typeof value === 'string' && value.length > 500) {
        output[key] = `${value.slice(0, 500)}…`;
        continue;
      }
      output[key] = value;
    }
  }
  return output;
}
