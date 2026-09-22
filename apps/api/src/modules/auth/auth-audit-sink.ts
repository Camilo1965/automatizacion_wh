export type AuthAuditAction =
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
  | 'user.deactivated';

export type AuthAuditEvent = {
  action: AuthAuditAction;
  result: 'success' | 'failure';
  actorUserId?: string;
  actorUsername?: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, string | number | boolean | null>;
  at: Date;
};

export interface AuthAuditSink {
  record(event: AuthAuditEvent): void | Promise<void>;
}

export class NoopAuthAuditSink implements AuthAuditSink {
  record(): void {}
}

export class InMemoryAuthAuditSink implements AuthAuditSink {
  private readonly _events: AuthAuditEvent[] = [];

  record(event: AuthAuditEvent): void {
    this._events.push(event);
  }

  events(): readonly AuthAuditEvent[] {
    return this._events;
  }

  clear(): void {
    this._events.length = 0;
  }
}
