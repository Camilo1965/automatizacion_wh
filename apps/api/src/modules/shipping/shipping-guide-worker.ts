import {
  ShippingUncertainError,
  type CreatePreShipmentInput,
} from './99envios-client.js';

type JobPort = Readonly<{
  claimNext(): Promise<Readonly<{
    id: string;
    orderId: string;
    carrier: string;
    insuranceMode: 'none' | 'standard' | 'plus';
    collectionValueCop: number;
    packageDefaults?: {
      weightKg: number;
      lengthCm: number;
      widthCm: number;
      heightCm: number;
      contents?: string;
    };
  }> | null>;
  markCreated(
    id: string,
    preShipmentNumber: string,
    freightCop: number,
  ): Promise<void>;
  markUncertain(id: string): Promise<void>;
  markFailed(id: string, errorCode: string): Promise<void>;
}>;

type OrderPort = Readonly<{
  get(orderId: string): Promise<Readonly<{
    status?: string;
    referenceModelName: string;
    referenceCode: string;
    unitPriceCop: number;
    size: string;
    quantity: number;
    customer: Readonly<{ name: string | null; phone: string | null }>;
    destination: Readonly<{
      address: string | null;
      localityCarrierCode: string | null;
      deliveryNotes: string | null;
    }>;
  }> | null>;
}>;

type ShippingClient = Readonly<{
  createPreShipment(input: CreatePreShipmentInput): Promise<
    Readonly<{
      preShipmentNumber: string;
      freightCop: number;
    }>
  >;
}>;

type IncidentSink = Readonly<{
  open(
    input: Readonly<{
      type: string;
      severity: 'critical' | 'info';
      title: string;
      detail: string;
      entityUrl: string;
      entityId: string;
      retrySafe: boolean;
    }>,
  ): Promise<unknown>;
}>;

function recipientName(name: string): {
  firstName: string;
  firstSurname: string;
} {
  const parts = name.trim().split(/\s+/);
  return {
    firstName: parts[0] ?? '',
    firstSurname: parts.slice(1).join(' ') || 'N/A',
  };
}

export class ShippingGuideWorker {
  constructor(
    private readonly jobs: JobPort,
    private readonly orders: OrderPort,
    private readonly client: ShippingClient,
    private readonly incidents?: IncidentSink,
    private readonly metrics?: Readonly<{
      recordJob(input: {
        queue: 'shipping_guide';
        outcome: 'attempt' | 'failure';
      }): void;
      recordGuideOutcome(
        outcome: 'created' | 'uncertain' | 'failed' | 'skipped',
      ): void;
      recordProviderFailure(provider: 'shipping'): void;
    }>,
  ) {}

  async runOnce(): Promise<boolean> {
    const job = await this.jobs.claimNext();
    if (job === null) return false;
    this.metrics?.recordJob({ queue: 'shipping_guide', outcome: 'attempt' });
    try {
      const order = await this.orders.get(job.orderId);
      if (
        order === null ||
        order.status !== 'confirmed' ||
        order.customer.name === null ||
        order.customer.phone === null ||
        order.destination.address === null ||
        order.destination.localityCarrierCode === null
      ) {
        await this.jobs.markFailed(
          job.id,
          order?.status !== 'confirmed'
            ? 'order_not_confirmed'
            : 'incomplete_order',
        );
        this.metrics?.recordGuideOutcome('failed');
        this.metrics?.recordJob({
          queue: 'shipping_guide',
          outcome: 'failure',
        });
        return true;
      }
      const name = recipientName(order.customer.name);
      const guide = await this.client.createPreShipment({
        ...(job.packageDefaults ?? {
          weightKg: 1,
          lengthCm: 30,
          widthCm: 20,
          heightCm: 12,
        }),
        contents:
          job.packageDefaults?.contents ??
          `Calzado REF ${order.referenceCode} · ${order.referenceModelName} · Talla ${order.size}`,
        declaredValueCop: job.collectionValueCop,
        recipient: {
          firstName: name.firstName,
          firstSurname: name.firstSurname,
          phone: order.customer.phone,
          address: order.destination.address,
          localityCode: order.destination.localityCarrierCode,
        },
        carrier: job.carrier,
        insurance: job.insuranceMode,
        notes: order.destination.deliveryNotes,
      });
      await this.jobs.markCreated(
        job.id,
        guide.preShipmentNumber,
        guide.freightCop,
      );
      this.metrics?.recordGuideOutcome('created');
      await this.incidents
        ?.open({
          type: 'guide_created',
          severity: 'info',
          title: 'Guía lista para despachar',
          detail: `REF ${order.referenceCode} · talla ${order.size} · guía ${guide.preShipmentNumber}. Abre el pedido para consultar el PDF.`,
          entityUrl: `/orders/${job.orderId}`,
          entityId: job.orderId,
          retrySafe: false,
        })
        .catch(() => undefined);
    } catch (error) {
      if (error instanceof ShippingUncertainError) {
        await this.jobs.markUncertain(job.id);
        this.metrics?.recordGuideOutcome('uncertain');
        this.metrics?.recordProviderFailure('shipping');
        await this.incidents?.open({
          type: 'guide_uncertain',
          severity: 'critical',
          title: 'Guía con resultado incierto',
          detail:
            '99envíos no confirmó si la guía fue creada. Debe revisarse antes de reintentar.',
          entityUrl: `/orders/${job.orderId}`,
          entityId: job.orderId,
          retrySafe: false,
        });
      } else {
        await this.jobs.markFailed(
          job.id,
          error instanceof Error ? error.name : 'unknown',
        );
        this.metrics?.recordGuideOutcome('failed');
        this.metrics?.recordJob({
          queue: 'shipping_guide',
          outcome: 'failure',
        });
        this.metrics?.recordProviderFailure('shipping');
        await this.incidents?.open({
          type: 'guide_failed',
          severity: 'critical',
          title: 'No se pudo crear la guía',
          detail:
            error instanceof Error
              ? error.message
              : 'Error desconocido de 99envíos',
          entityUrl: `/orders/${job.orderId}`,
          entityId: job.orderId,
          retrySafe: true,
        });
      }
    }
    return true;
  }
}
