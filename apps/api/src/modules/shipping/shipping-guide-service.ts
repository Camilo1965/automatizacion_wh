import type { StoredGuidePdf } from './local-guide-pdf-storage.js';
import { ShippingDomainError } from './shipping-quote-service.js';

type GuideJob = Readonly<{
  id: string;
  status: string;
  carrier: string;
  preShipmentNumber: string | null;
  guidePdfStorageKey: string | null;
  guidePdfSha256?: string | null;
}>;

type Repository = Readonly<{
  findByOrderId(orderId: string): Promise<GuideJob | null>;
  attachPdf(jobId: string, pdf: StoredGuidePdf): Promise<boolean>;
  reviewUncertain(jobId: string, preShipmentNumber: string): Promise<boolean>;
}>;

type Client = Readonly<{
  getGuidePdf(preShipmentNumber: string, carrier: string): Promise<Uint8Array>;
}>;

type Storage = Readonly<{
  save(bytes: Uint8Array): Promise<StoredGuidePdf>;
  read(storageKey: string): Promise<Uint8Array>;
  delete(storageKey: string): Promise<void>;
}>;

export class ShippingGuideService {
  constructor(
    private readonly repository: Repository,
    private readonly client: Client,
    private readonly storage: Storage,
  ) {}

  async fetchPdf(
    orderId: string,
  ): Promise<Readonly<{ bytes: Uint8Array; sha256: string | null }>> {
    const job = await this.requireJob(orderId);
    if (job.guidePdfStorageKey !== null) {
      return {
        bytes: await this.storage.read(job.guidePdfStorageKey),
        sha256: job.guidePdfSha256 ?? null,
      };
    }
    if (job.status !== 'created' || job.preShipmentNumber === null) {
      throw new ShippingDomainError(
        'guide_not_created',
        'The shipping guide has not been created',
      );
    }
    const bytes = await this.client.getGuidePdf(
      job.preShipmentNumber,
      job.carrier,
    );
    const stored = await this.storage.save(bytes);
    try {
      const attached = await this.repository.attachPdf(job.id, stored);
      if (!attached) {
        await Promise.resolve(this.storage.delete(stored.storageKey)).catch(
          () => undefined,
        );
        const winner = await this.requireJob(orderId);
        if (winner.guidePdfStorageKey !== null) {
          return {
            bytes: await this.storage.read(winner.guidePdfStorageKey),
            sha256: winner.guidePdfSha256 ?? null,
          };
        }
        throw new ShippingDomainError(
          'guide_changed',
          'The shipping guide changed while fetching its PDF',
        );
      }
    } catch (error) {
      await Promise.resolve(this.storage.delete(stored.storageKey)).catch(
        () => undefined,
      );
      throw error;
    }
    return { bytes, sha256: stored.sha256 };
  }

  async reviewUncertain(
    orderId: string,
    preShipmentNumber: string,
  ): Promise<void> {
    const job = await this.requireJob(orderId);
    if (!(await this.repository.reviewUncertain(job.id, preShipmentNumber))) {
      throw new ShippingDomainError(
        'guide_not_uncertain',
        'Only an uncertain guide can be reviewed',
      );
    }
  }

  private async requireJob(orderId: string): Promise<GuideJob> {
    const job = await this.repository.findByOrderId(orderId);
    if (job === null)
      throw new ShippingDomainError(
        'guide_not_found',
        'Shipping guide was not found',
      );
    return job;
  }
}

export type ShippingGuideOperations = Pick<
  ShippingGuideService,
  'fetchPdf' | 'reviewUncertain'
>;
