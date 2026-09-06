import { CatalogNotFoundError } from './catalog-errors.js';
import type { CatalogRepository } from './catalog-repository.js';
import type {
  AdminMovementsPage,
  AdminReferenceDetail,
  AdminReferencesPage,
  AvailableCatalogPage,
  CatalogReference,
  CreateReferenceInput,
  ListAdminMovementsInput,
  ListAdminReferencesInput,
  ListAvailableInput,
  PhotoMetadata,
  ReplacePhotoResult,
  SetPhysicalStockInput,
  StockRecord,
  UpdateReferenceInput,
} from './catalog-types.js';
import { parseShoeSize } from './catalog-validation.js';
import type { PhotoStorage } from './photo-storage.js';

const PAGE_SIZE = 4;

export interface CatalogService {
  createReference(input: CreateReferenceInput): Promise<CatalogReference>;
  getAdminReference(referenceId: string): Promise<AdminReferenceDetail>;
  listAdminReferences(
    input: ListAdminReferencesInput,
  ): Promise<AdminReferencesPage>;
  updateReference(input: UpdateReferenceInput): Promise<CatalogReference>;
  activateReference(referenceId: string): Promise<CatalogReference>;
  setPhysicalStock(input: SetPhysicalStockInput): Promise<StockRecord>;
  listAdminMovements(
    input: ListAdminMovementsInput,
  ): Promise<AdminMovementsPage>;
  replacePhoto(
    referenceId: string,
    bytes: Uint8Array,
  ): Promise<ReplacePhotoResult>;
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

  async getAdminReference(referenceId: string): Promise<AdminReferenceDetail> {
    const reference = await this.repository.findReferenceById(referenceId);
    if (reference === null) {
      throw new CatalogNotFoundError('Catalog reference was not found');
    }

    const stock = await this.repository.listStockForReference(referenceId);
    return { reference, stock };
  }

  async listAdminReferences(
    input: ListAdminReferencesInput,
  ): Promise<AdminReferencesPage> {
    const rows = await this.repository.listAdminReferences({
      ...input,
      limit: input.limit + 1,
    });
    const items = rows.slice(0, input.limit);
    const lastItem = items.at(-1);
    const nextAfterCode =
      rows.length > input.limit && lastItem !== undefined
        ? lastItem.code
        : null;

    return { items, nextAfterCode };
  }

  async updateReference(
    input: UpdateReferenceInput,
  ): Promise<CatalogReference> {
    return this.repository.updateReference(input);
  }

  async activateReference(referenceId: string): Promise<CatalogReference> {
    return this.repository.activateReference(referenceId);
  }

  async setPhysicalStock(input: SetPhysicalStockInput): Promise<StockRecord> {
    return this.repository.setPhysicalStock(input);
  }

  async listAdminMovements(
    input: ListAdminMovementsInput,
  ): Promise<AdminMovementsPage> {
    return this.repository.listAdminMovements(input);
  }

  async replacePhoto(
    referenceId: string,
    bytes: Uint8Array,
  ): Promise<ReplacePhotoResult> {
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

    const warnings: 'old_photo_cleanup_failed'[] = [];
    const previousPhotoKey = previous?.storageKey ?? null;
    if (previousPhotoKey !== null) {
      try {
        await this.photoStorage.delete(previousPhotoKey);
      } catch {
        warnings.push('old_photo_cleanup_failed');
      }
    }

    const updated = await this.repository.findReferenceById(referenceId);
    if (updated === null) {
      throw new CatalogNotFoundError('Catalog reference was not found');
    }

    return {
      reference: updated,
      warnings,
    };
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
