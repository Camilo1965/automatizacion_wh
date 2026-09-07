import type { PhotoPublic } from '@camila/contracts';

import type {
  AdminReferenceDetail,
  AdminReferenceListItem,
  CatalogReference,
  InventoryMovement,
  PhotoMetadata,
  StockAvailability,
  StockRecord,
} from '../modules/catalog/catalog-types.js';
import type {
  OrderRecord,
  OrderSummary,
} from '../modules/orders/order-types.js';

export function toPublicPhoto(
  referenceId: string,
  photo: PhotoMetadata | null,
): PhotoPublic | null {
  if (photo === null) {
    return null;
  }

  return {
    url: `/api/admin/references/${referenceId}/photo`,
    mimeType: photo.mimeType,
    byteSize: photo.byteSize,
    etag: `"${photo.sha256}"`,
  };
}

export function toPublicReference(reference: CatalogReference) {
  return {
    id: reference.id,
    code: reference.code,
    modelName: reference.modelName,
    color: reference.color,
    priceCop: reference.priceCop,
    active: reference.active,
    photo: toPublicPhoto(reference.id, reference.photo),
    createdAt: reference.createdAt.toISOString(),
    updatedAt: reference.updatedAt.toISOString(),
  };
}

export function toPublicReferenceSummary(item: AdminReferenceListItem) {
  return {
    id: item.id,
    code: item.code,
    modelName: item.modelName,
    color: item.color,
    priceCop: item.priceCop,
    active: item.active,
    photo: toPublicPhoto(item.id, item.photo),
    availableSizes: item.availableSizes,
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function toPublicReferenceDetail(detail: AdminReferenceDetail) {
  return {
    ...toPublicReference(detail.reference),
    stock: detail.stock.map(toPublicStockAvailability),
  };
}

export function toPublicStockAvailability(stock: StockAvailability) {
  return {
    size: stock.size,
    physicalQuantity: stock.physicalQuantity,
    reservedQuantity: stock.reservedQuantity,
    availableQuantity: stock.availableQuantity,
    updatedAt: stock.updatedAt.toISOString(),
  };
}

export function toPublicStockRecord(stock: StockRecord) {
  return {
    referenceId: stock.referenceId,
    size: stock.size,
    physicalQuantity: stock.physicalQuantity,
    reservedQuantity: stock.reservedQuantity,
    availableQuantity: stock.physicalQuantity - stock.reservedQuantity,
    updatedAt: stock.updatedAt.toISOString(),
  };
}

export function toPublicMovement(movement: InventoryMovement) {
  return {
    id: movement.id,
    size: movement.size,
    previousQuantity: movement.previousQuantity,
    newQuantity: movement.newQuantity,
    delta: movement.delta,
    reason: movement.reason,
    note: movement.note,
    createdAt: movement.createdAt.toISOString(),
  };
}

export function toPublicOrder(order: OrderRecord) {
  return {
    id: order.id,
    orderNumber: `PED-${String(order.orderNumber).padStart(6, '0')}`,
    status: order.status,
    reference: {
      id: order.referenceId,
      code: order.referenceCode,
      modelName: order.referenceModelName,
      color: order.referenceColor,
    },
    size: order.size,
    quantity: order.quantity,
    customer: order.customer,
    destination: order.destination,
    draftVersion: order.draftVersion,
    latestSummaryVersion: order.latestSummaryVersion,
    confirmedSummaryVersion: order.confirmedSummaryVersion,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

export function toPublicOrderSummary(summary: OrderSummary) {
  return {
    version: summary.version,
    draftVersion: summary.draftVersion,
    snapshot: summary.snapshot,
    createdAt: summary.createdAt.toISOString(),
  };
}
