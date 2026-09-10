import type { IntegrationHealth } from '@camila/contracts';

type Dependencies = Readonly<{
  database(): Promise<void>;
  mediaStorage(): Promise<void>;
  whatsappConfigured: boolean;
  shippingConfigured: boolean;
  schedulerHealthy: boolean;
}>;

export class IntegrationHealthService {
  constructor(
    private readonly dependencies: Dependencies,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async check(): Promise<IntegrationHealth> {
    const checkedAt = this.now().toISOString();
    const probe = async (operation: () => Promise<void>) => {
      try {
        await operation();
        return { status: 'up' as const, checkedAt, detail: null };
      } catch {
        return {
          status: 'down' as const,
          checkedAt,
          detail: 'La comprobación local falló',
        };
      }
    };
    return {
      database: await probe(this.dependencies.database),
      mediaStorage: await probe(this.dependencies.mediaStorage),
      whatsapp: {
        status: this.dependencies.whatsappConfigured ? 'up' : 'degraded',
        checkedAt,
        detail: this.dependencies.whatsappConfigured
          ? null
          : 'Credenciales o webhook pendientes',
      },
      shipping: {
        status: this.dependencies.shippingConfigured ? 'up' : 'degraded',
        checkedAt,
        detail: this.dependencies.shippingConfigured
          ? null
          : 'Credenciales de 99envíos pendientes',
      },
      scheduler: {
        status: this.dependencies.schedulerHealthy ? 'up' : 'down',
        checkedAt,
        detail: this.dependencies.schedulerHealthy
          ? null
          : 'Scheduler sin latido reciente',
      },
    };
  }
}
