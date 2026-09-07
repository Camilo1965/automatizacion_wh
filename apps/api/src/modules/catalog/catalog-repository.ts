import type {
  AdminMovementsPage,
  AdminReferenceDetail,
  AdminReferencesPage,
  AvailableCatalogItem,
  CatalogReference,
  CatalogReadiness,
  CreateReferenceInput,
  InventoryMovement,
  ListAdminMovementsInput,
  ListAdminReferencesInput,
  PhotoMetadata,
  SetPhysicalStockInput,
  StockRecord,
  UpdateReferenceInput,
} from './catalog-types.js';

export interface CatalogRepository {
  getReadiness(): Promise<CatalogReadiness>;
  createReference(input: CreateReferenceInput): Promise<CatalogReference>;
  findReferenceById(referenceId: string): Promise<CatalogReference | null>;
  updateReference(input: UpdateReferenceInput): Promise<CatalogReference>;
  activateReference(referenceId: string): Promise<CatalogReference>;
  deactivateReference(referenceId: string): Promise<CatalogReference>;
  replacePhotoMetadata(
    referenceId: string,
    photo: PhotoMetadata,
  ): Promise<PhotoMetadata | null>;
  setPhysicalStock(input: SetPhysicalStockInput): Promise<StockRecord>;
  listStockForReference(
    referenceId: string,
  ): Promise<AdminReferenceDetail['stock']>;
  listAdminReferences(
    input: ListAdminReferencesInput,
  ): Promise<readonly AdminReferencesPage['items'][number][]>;
  listInventoryMovements(
    referenceId: string,
    size: string,
  ): Promise<readonly InventoryMovement[]>;
  listAdminMovements(
    input: ListAdminMovementsInput,
  ): Promise<AdminMovementsPage>;
  listAvailableForConfirmedSize(input: {
    confirmedSize: string;
    afterCode?: string;
    limit: number;
  }): Promise<readonly AvailableCatalogItem[]>;
}
