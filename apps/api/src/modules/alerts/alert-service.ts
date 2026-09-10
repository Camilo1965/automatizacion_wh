export type AlertInput = Readonly<{
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  entityUrl: string;
  entityId: string;
  retrySafe: boolean;
}>;

export type AlertRepository = Readonly<{
  open(input: AlertInput & { deduplicationKey: string }): Promise<unknown>;
  list(): Promise<readonly unknown[]>;
  markRead(id: string): Promise<unknown>;
  resolve(id: string): Promise<unknown>;
}>;

export class AlertService {
  constructor(private readonly repository: AlertRepository) {}
  open(input: AlertInput) {
    return this.repository.open({
      ...input,
      deduplicationKey: `${input.type}:${input.entityId}`,
    });
  }
  list() {
    return this.repository.list();
  }
  markRead(id: string) {
    return this.repository.markRead(id);
  }
  resolve(id: string) {
    return this.repository.resolve(id);
  }
}
