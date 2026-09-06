export type PhotoMetadata = Readonly<{
  storageKey: string;
  mimeType: 'image/jpeg' | 'image/png';
  byteSize: number;
  sha256: string;
}>;

export type CreateReferenceInput = Readonly<{
  code: string;
  modelName: string;
  color: string;
  priceCop: number;
}>;

export type UpdateReferenceInput = Readonly<{
  referenceId: string;
  modelName?: string;
  color?: string;
  priceCop?: number;
}>;

export type CatalogReference = Readonly<{
  id: string;
  code: string;
  modelName: string;
  color: string;
  priceCop: number;
  active: boolean;
  photo: PhotoMetadata | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type SetPhysicalStockInput = Readonly<{
  referenceId: string;
  size: string | number;
  physicalQuantity: number;
  note?: string;
}>;

export type StockRecord = Readonly<{
  referenceId: string;
  size: string;
  physicalQuantity: number;
  reservedQuantity: number;
  createdAt: Date;
  updatedAt: Date;
}>;

export type StockAvailability = Readonly<{
  size: string;
  physicalQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  updatedAt: Date;
}>;

export type InventoryMovement = Readonly<{
  id: string;
  referenceId: string;
  size: string;
  previousQuantity: number;
  newQuantity: number;
  delta: number;
  reason: 'initial' | 'manual_adjustment';
  note: string | null;
  createdAt: Date;
}>;

export type AvailableCatalogItem = Readonly<{
  referenceId: string;
  code: string;
  modelName: string;
  color: string;
  priceCop: number;
  confirmedSize: string;
  availableQuantity: number;
  photoStorageKey: string;
  photoMimeType: 'image/jpeg' | 'image/png';
}>;

export type AvailableCatalogPage = Readonly<{
  items: readonly AvailableCatalogItem[];
  nextAfterCode: string | null;
}>;

export type ListAvailableInput = Readonly<{
  confirmedSize: string | number;
  afterCode?: string;
}>;

export type AdminReferenceListStatus = 'active' | 'inactive' | 'all';

export type ListAdminReferencesInput = Readonly<{
  query?: string;
  status: AdminReferenceListStatus;
  afterCode?: string;
  limit: number;
}>;

export type AdminReferenceListItem = Readonly<{
  id: string;
  code: string;
  modelName: string;
  color: string;
  priceCop: number;
  active: boolean;
  photo: PhotoMetadata | null;
  availableSizes: readonly string[];
  updatedAt: Date;
}>;

export type AdminReferencesPage = Readonly<{
  items: readonly AdminReferenceListItem[];
  nextAfterCode: string | null;
}>;

export type AdminReferenceDetail = Readonly<{
  reference: CatalogReference;
  stock: readonly StockAvailability[];
}>;

export type ListAdminMovementsInput = Readonly<{
  referenceId: string;
  size?: string;
  cursor?: Readonly<{ createdAt: Date; id: string }>;
  limit: number;
}>;

export type AdminMovementsPage = Readonly<{
  items: readonly InventoryMovement[];
  nextCursor: Readonly<{ createdAt: Date; id: string }> | null;
}>;

export type ReplacePhotoResult = Readonly<{
  reference: CatalogReference;
  warnings: readonly 'old_photo_cleanup_failed'[];
}>;
