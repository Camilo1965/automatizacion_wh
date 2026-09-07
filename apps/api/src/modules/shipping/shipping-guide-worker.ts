import {
  ShippingUncertainError,
  type CreatePreShipmentInput,
} from './99envios-client.js';

type JobPort = Readonly<{
  claimNext(): Promise<Readonly<{
    id: string;
    orderId: string;
    carrier: string;
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
  ) {}

  async runOnce(): Promise<boolean> {
    const job = await this.jobs.claimNext();
    if (job === null) return false;
    try {
      const order = await this.orders.get(job.orderId);
      if (
        order === null ||
        order.customer.name === null ||
        order.customer.phone === null ||
        order.destination.address === null ||
        order.destination.localityCarrierCode === null
      ) {
        await this.jobs.markFailed(job.id, 'incomplete_order');
        return true;
      }
      const name = recipientName(order.customer.name);
      const guide = await this.client.createPreShipment({
        weightKg: 1,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 12,
        contents: `Calzado REF ${order.referenceCode} · ${order.referenceModelName} · Talla ${order.size}`,
        declaredValueCop: order.unitPriceCop * order.quantity,
        recipient: {
          firstName: name.firstName,
          firstSurname: name.firstSurname,
          phone: order.customer.phone,
          address: order.destination.address,
          localityCode: order.destination.localityCarrierCode,
        },
        carrier: job.carrier,
        notes: order.destination.deliveryNotes,
      });
      await this.jobs.markCreated(
        job.id,
        guide.preShipmentNumber,
        guide.freightCop,
      );
    } catch (error) {
      if (error instanceof ShippingUncertainError) {
        await this.jobs.markUncertain(job.id);
      } else {
        await this.jobs.markFailed(
          job.id,
          error instanceof Error ? error.name : 'unknown',
        );
      }
    }
    return true;
  }
}
