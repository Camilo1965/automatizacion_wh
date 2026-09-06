import { CatalogNotFoundError, PhotoCleanupError } from './catalog-errors.js';
import type { CatalogRepository } from './catalog-repository.js';
import type {
  AvailableCatalogPage,
  CatalogReference,
  CreateReferenceInput,
  ListAvailableInput,
  PhotoMetadata,
  SetPhysicalStockInput,
  StockRecord,
} from './catalog-types.js';
import { parseShoeSize } from './catalog-validation.js';
import type { PhotoStorage } from './photo-storage.js';

const PAGE_SIZE = 4;

export interface CatalogService {
  createReference(input: CreateReferenceInput): Promise<CatalogReference>;
  setPhysicalStock(input: SetPhysicalStockInput): Promise<StockRecord>;
  replacePhoto(
    referenceId: string,
    bytes: Uint8Array,
  ): Promise<CatalogReference>;
  deactivateReference(referenceId: string): Promise<CatalogReference>;
  listAvailableForConfirmedSize(
    input: ListAvailableInput,
  ): Promise<AvailableCatalogPage>;
}

export class DefaultCatalogService implements CatalogService {
  constructor(
    private readonly repository: CatalogRepository,
    private readonly photoStorage: PhotoStorage,
  ) {}

  async createReference(
    input: CreateReferenceInput,
  ): Promise<CatalogReference> {
    return this.repository.createReference(input);
  }

  async setPhysicalStock(input: SetPhysicalStockInput): Promise<StockRecord> {
    return this.repository.setPhysicalStock(input);
  }

  async replacePhoto(
    referenceId: string,
    bytes: Uint8Array,
  ): Promise<CatalogReference> {
    const existing = await this.repository.findReferenceById(referenceId);
    if (existing === null) {
      throw new CatalogNotFoundError('Catalog reference was not found');
    }

    const stored = await this.photoStorage.save(bytes);

    let previous: PhotoMetadata | null;
    try {
      previous = await this.repository.replacePhotoMetadata(referenceId, {
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        byteSize: stored.byteSize,
        sha256: stored.sha256,
      });
    } catch (error) {
      await this.photoStorage.delete(stored.storageKey);
      throw error;
    }

    const previousPhotoKey = previous?.storageKey ?? null;
    if (previousPhotoKey !== null) {
      try {
        await this.photoStorage.delete(previousPhotoKey);
      } catch {
        throw new PhotoCleanupError(
          previousPhotoKey,
          'Photo replacement was applied but the previous file could not be removed',
        );
      }
    }

    const updated = await this.repository.findReferenceById(referenceId);
    if (updated === null) {
      throw new CatalogNotFoundError('Catalog reference was not found');
    }

    return updated;
  }

  async deactivateReference(referenceId: string): Promise<CatalogReference> {
    return this.repository.deactivateReference(referenceId);
  }

  async listAvailableForConfirmedSize(
    input: ListAvailableInput,
  ): Promise<AvailableCatalogPage> {
    const confirmedSize = parseShoeSize(input.confirmedSize);
    const afterCode =
      input.afterCode === undefined
        ? undefined
        : input.afterCode.trim().toUpperCase();

    const rows = await this.repository.listAvailableForConfirmedSize({
      confirmedSize,
      ...(afterCode === undefined ? {} : { afterCode }),
      limit: PAGE_SIZE + 1,
    });

    const items = rows.slice(0, PAGE_SIZE);
    const lastItem = items.at(-1);
    const nextAfterCode =
      rows.length > PAGE_SIZE && lastItem !== undefined ? lastItem.code : null;

    return {
      items,
      nextAfterCode,
    };
  }
}
