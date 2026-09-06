import type { AdminUserPublic } from '@camila/contracts';

import type {
  InventoryMovementPublic,
  ReferenceDetail,
  ReferenceSummary,
} from '../api/catalog-api';

export const adminUser: AdminUserPublic = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'camila',
};

export const referenceSummary: ReferenceSummary = {
  id: '22222222-2222-4222-8222-222222222222',
  code: '01',
  modelName: 'Ballerina',
  color: 'Negro',
  priceCop: 120_000,
  active: true,
  photo: null,
  availableSizes: ['37'],
  updatedAt: '2026-09-06T12:00:00.000Z',
};

export const referenceDetail: ReferenceDetail = {
  id: referenceSummary.id,
  code: referenceSummary.code,
  modelName: referenceSummary.modelName,
  color: referenceSummary.color,
  priceCop: referenceSummary.priceCop,
  active: true,
  photo: null,
  createdAt: '2026-09-01T12:00:00.000Z',
  updatedAt: referenceSummary.updatedAt,
  stock: [
    {
      size: '37',
      physicalQuantity: 3,
      reservedQuantity: 0,
      availableQuantity: 3,
      updatedAt: '2026-09-06T12:00:00.000Z',
    },
  ],
};

export const movementFixture: InventoryMovementPublic = {
  id: '33333333-3333-4333-8333-333333333333',
  size: '37',
  previousQuantity: 3,
  newQuantity: 5,
  delta: 2,
  reason: 'manual_adjustment',
  note: 'Ajuste de conteo',
  createdAt: '2026-09-06T13:00:00.000Z',
};

export function tinyPngFile(name = 'sample.png'): File {
  const bytes = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00,
    0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  return new File([bytes], name, { type: 'image/png' });
}
