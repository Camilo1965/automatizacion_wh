import type { IntegrationHealth } from '@camila/contracts';

type Dependencies = Readonly<{
  database(): Promise<void>;
  mediaStorage(): Promise<void>;
  whatsappConfigured: boolean | (() => Promise<boolean>);
  shippingConfigured: boolean | (() => Promise<boolean>);
  schedulerHealthy: boolean;
}>;

export class IntegrationHealthService {
  constructor(
    private readonly dependencies: Dependencies,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async check(): Promise<IntegrationHealth> {
    const checkedAt = this.now().toISOString();
    const whatsappConfigured =
      typeof this.dependencies.whatsappConfigured === 'boolean'
        ? this.dependencies.whatsappConfigured
        : await this.dependencies.whatsappConfigured();
    const shippingConfigured =
      typeof this.dependencies.shippingConfigured === 'boolean'
        ? this.dependencies.shippingConfigured
        : await this.dependencies.shippingConfigured();
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
        status: whatsappConfigured ? 'up' : 'degraded',
        checkedAt,
        detail: whatsappConfigured ? null : 'Credenciales o webhook pendientes',
      },
      shipping: {
        status: shippingConfigured ? 'up' : 'degraded',
        checkedAt,
        detail: shippingConfigured
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
