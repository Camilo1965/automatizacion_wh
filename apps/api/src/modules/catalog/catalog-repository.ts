import type {
  AvailableCatalogItem,
  CatalogReference,
  CreateReferenceInput,
  InventoryMovement,
  PhotoMetadata,
  SetPhysicalStockInput,
  StockRecord,
} from './catalog-types.js';

export interface CatalogRepository {
  createReference(input: CreateReferenceInput): Promise<CatalogReference>;
  findReferenceById(referenceId: string): Promise<CatalogReference | null>;
  deactivateReference(referenceId: string): Promise<CatalogReference>;
  replacePhotoMetadata(
    referenceId: string,
    photo: PhotoMetadata,
  ): Promise<PhotoMetadata | null>;
  setPhysicalStock(input: SetPhysicalStockInput): Promise<StockRecord>;
  listInventoryMovements(
    referenceId: string,
    size: string,
  ): Promise<readonly InventoryMovement[]>;
  listAvailableForConfirmedSize(input: {
    confirmedSize: string;
    afterCode?: string;
    limit: number;
  }): Promise<readonly AvailableCatalogItem[]>;
}
