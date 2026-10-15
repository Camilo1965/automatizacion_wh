import type { IntegrationHealth } from '@camila/contracts';

type Dependencies = Readonly<{
  database(): Promise<void>;
  mediaStorage(): Promise<void>;
  whatsappConfigured: boolean | (() => Promise<boolean>);
  shippingConfigured: boolean | (() => Promise<boolean>);
  schedulerHealthy: boolean | (() => Promise<boolean>);
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
    const schedulerHealthy =
      typeof this.dependencies.schedulerHealthy === 'boolean'
        ? this.dependencies.schedulerHealthy
        : await this.dependencies.schedulerHealthy();
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
        detail: whatsappConfigured
          ? 'Credenciales presentes; esta revisión no consulta Meta en vivo.'
          : 'Credenciales o verificación del webhook pendientes',
      },
      shipping: {
        status: shippingConfigured ? 'up' : 'degraded',
        checkedAt,
        detail: shippingConfigured
          ? 'Credenciales presentes; esta revisión no consulta 99envíos en vivo.'
          : 'Credenciales de 99envíos pendientes',
      },
      scheduler: {
        status: schedulerHealthy ? 'up' : 'down',
        checkedAt,
        detail: schedulerHealthy ? null : 'Scheduler sin latido reciente',
      },
    };
  }
}
