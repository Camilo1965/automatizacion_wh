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
