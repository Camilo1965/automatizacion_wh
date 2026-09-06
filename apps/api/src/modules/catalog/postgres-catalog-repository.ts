import { and, asc, eq, gt, sql } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import {
  catalogReferences,
  catalogStock,
  inventoryMovements,
} from '../../database/schema.js';
import {
  CatalogConflictError,
  CatalogNotFoundError,
  CatalogValidationError,
} from './catalog-errors.js';
import type { CatalogRepository } from './catalog-repository.js';
import type {
  AvailableCatalogItem,
  CatalogReference,
  CreateReferenceInput,
  InventoryMovement,
  PhotoMetadata,
  SetPhysicalStockInput,
  StockRecord,
} from './catalog-types.js';
import {
  normalizeReferenceCode,
  parseShoeSize,
  validatePriceCop,
  validateQuantity,
} from './catalog-validation.js';

type ReferenceRow = typeof catalogReferences.$inferSelect;
type StockRow = typeof catalogStock.$inferSelect;
type MovementRow = typeof inventoryMovements.$inferSelect;

function mapReference(row: ReferenceRow): CatalogReference {
  const photo =
    row.photoStorageKey === null ||
    row.photoMimeType === null ||
    row.photoByteSize === null ||
    row.photoSha256 === null
      ? null
      : {
          storageKey: row.photoStorageKey,
          mimeType: row.photoMimeType as 'image/jpeg' | 'image/png',
          byteSize: row.photoByteSize,
          sha256: row.photoSha256,
        };

  return {
    id: row.id,
    code: row.code,
    modelName: row.modelName,
    color: row.color,
    priceCop: row.priceCop,
    active: row.active,
    photo,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function formatSize(value: string): string {
  return parseShoeSize(value);
}

function mapStock(row: StockRow): StockRecord {
  return {
    referenceId: row.referenceId,
    size: formatSize(row.size),
    physicalQuantity: row.physicalQuantity,
    reservedQuantity: row.reservedQuantity,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapMovement(row: MovementRow): InventoryMovement {
  return {
    id: row.id,
    referenceId: row.referenceId,
    size: formatSize(row.size),
    previousQuantity: row.previousQuantity,
    newQuantity: row.newQuantity,
    delta: row.delta,
    reason: row.reason as 'initial' | 'manual_adjustment',
    note: row.note,
    createdAt: row.createdAt,
  };
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  while (typeof current === 'object' && current !== null) {
    if ('code' in current && current.code === '23505') {
      return true;
    }
    if ('cause' in current) {
      current = current.cause;
      continue;
    }
    break;
  }
  return false;
}

export class PostgresCatalogRepository implements CatalogRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async createReference(
    input: CreateReferenceInput,
  ): Promise<CatalogReference> {
    const code = normalizeReferenceCode(input.code);
    const priceCop = validatePriceCop(input.priceCop);
    const modelName = input.modelName.trim();
    const color = input.color.trim();

    if (modelName.length < 1 || modelName.length > 120) {
      throw new CatalogValidationError(
        'modelName',
        'invalid_model_name',
        'Model name is invalid',
      );
    }

    if (color.length < 1 || color.length > 80) {
      throw new CatalogValidationError(
        'color',
        'invalid_color',
        'Color is invalid',
      );
    }

    try {
      const [row] = await this.database.orm
        .insert(catalogReferences)
        .values({
          code,
          modelName,
          color,
          priceCop,
        })
        .returning();

      if (row === undefined) {
        throw new Error('Failed to create catalog reference');
      }

      return mapReference(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new CatalogConflictError(
          'duplicate_code',
          'A reference with this code already exists',
        );
      }
      throw error;
    }
  }

  async findReferenceById(
    referenceId: string,
  ): Promise<CatalogReference | null> {
    const [row] = await this.database.orm
      .select()
      .from(catalogReferences)
      .where(eq(catalogReferences.id, referenceId))
      .limit(1);

    return row === undefined ? null : mapReference(row);
  }

  async deactivateReference(referenceId: string): Promise<CatalogReference> {
    const [row] = await this.database.orm
      .update(catalogReferences)
      .set({
        active: false,
        updatedAt: sql`now()`,
      })
      .where(eq(catalogReferences.id, referenceId))
      .returning();

    if (row === undefined) {
      throw new CatalogNotFoundError('Catalog reference was not found');
    }

    return mapReference(row);
  }

  async replacePhotoMetadata(
    referenceId: string,
    photo: PhotoMetadata,
  ): Promise<PhotoMetadata | null> {
    const existing = await this.findReferenceById(referenceId);
    if (existing === null) {
      throw new CatalogNotFoundError('Catalog reference was not found');
    }

    const previous = existing.photo;

    const [row] = await this.database.orm
      .update(catalogReferences)
      .set({
        photoStorageKey: photo.storageKey,
        photoMimeType: photo.mimeType,
        photoByteSize: photo.byteSize,
        photoSha256: photo.sha256,
        updatedAt: sql`now()`,
      })
      .where(eq(catalogReferences.id, referenceId))
      .returning();

    if (row === undefined) {
      throw new CatalogNotFoundError('Catalog reference was not found');
    }

    return previous;
  }

  async setPhysicalStock(input: SetPhysicalStockInput): Promise<StockRecord> {
    const size = parseShoeSize(input.size);
    const physicalQuantity = validateQuantity(input.physicalQuantity);

    const reference = await this.findReferenceById(input.referenceId);
    if (reference === null) {
      throw new CatalogNotFoundError('Catalog reference was not found');
    }

    return this.database.orm.transaction(async (tx) => {
      const insertedRows = await tx
        .insert(catalogStock)
        .values({
          referenceId: input.referenceId,
          size,
          physicalQuantity,
          reservedQuantity: 0,
        })
        .onConflictDoNothing({
          target: [catalogStock.referenceId, catalogStock.size],
        })
        .returning();

      const inserted = insertedRows[0];
      if (inserted !== undefined) {
        await tx.insert(inventoryMovements).values({
          referenceId: input.referenceId,
          size,
          previousQuantity: 0,
          newQuantity: physicalQuantity,
          delta: physicalQuantity,
          reason: 'initial',
          note: input.note ?? null,
          createdAt: sql`clock_timestamp()`,
        });

        return mapStock(inserted);
      }

      const [existing] = await tx
        .select()
        .from(catalogStock)
        .where(
          and(
            eq(catalogStock.referenceId, input.referenceId),
            eq(catalogStock.size, size),
          ),
        )
        .limit(1)
        .for('update');

      if (existing === undefined) {
        throw new Error('Stock row disappeared after conflict');
      }

      if (physicalQuantity < existing.reservedQuantity) {
        throw new CatalogValidationError(
          'physicalQuantity',
          'below_reserved',
          'Physical quantity cannot be below reserved quantity',
        );
      }

      if (physicalQuantity === existing.physicalQuantity) {
        return mapStock(existing);
      }

      const [updated] = await tx
        .update(catalogStock)
        .set({
          physicalQuantity,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(catalogStock.referenceId, input.referenceId),
            eq(catalogStock.size, size),
          ),
        )
        .returning();

      if (updated === undefined) {
        throw new Error('Failed to update stock record');
      }

      await tx.insert(inventoryMovements).values({
        referenceId: input.referenceId,
        size,
        previousQuantity: existing.physicalQuantity,
        newQuantity: physicalQuantity,
        delta: physicalQuantity - existing.physicalQuantity,
        reason: 'manual_adjustment',
        note: input.note ?? null,
        createdAt: sql`clock_timestamp()`,
      });

      return mapStock(updated);
    });
  }

  async listInventoryMovements(
    referenceId: string,
    size: string,
  ): Promise<readonly InventoryMovement[]> {
    const normalizedSize = parseShoeSize(size);
    const rows = await this.database.orm
      .select()
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.referenceId, referenceId),
          eq(inventoryMovements.size, normalizedSize),
        ),
      )
      .orderBy(asc(inventoryMovements.createdAt));

    return rows.map(mapMovement);
  }

  async listAvailableForConfirmedSize(input: {
    confirmedSize: string;
    afterCode?: string;
    limit: number;
  }): Promise<readonly AvailableCatalogItem[]> {
    const conditions = [
      eq(catalogReferences.active, true),
      sql`${catalogReferences.photoStorageKey} IS NOT NULL`,
      eq(catalogStock.size, input.confirmedSize),
      sql`(${catalogStock.physicalQuantity} - ${catalogStock.reservedQuantity}) > 0`,
    ];

    if (input.afterCode !== undefined) {
      conditions.push(gt(catalogReferences.code, input.afterCode));
    }

    const rows = await this.database.orm
      .select({
        referenceId: catalogReferences.id,
        code: catalogReferences.code,
        modelName: catalogReferences.modelName,
        color: catalogReferences.color,
        priceCop: catalogReferences.priceCop,
        physicalQuantity: catalogStock.physicalQuantity,
        reservedQuantity: catalogStock.reservedQuantity,
        photoStorageKey: catalogReferences.photoStorageKey,
        photoMimeType: catalogReferences.photoMimeType,
      })
      .from(catalogReferences)
      .innerJoin(
        catalogStock,
        eq(catalogStock.referenceId, catalogReferences.id),
      )
      .where(and(...conditions))
      .orderBy(asc(catalogReferences.code))
      .limit(input.limit);

    return rows.map((row) => {
      if (row.photoStorageKey === null || row.photoMimeType === null) {
        throw new Error('Available reference missing photo metadata');
      }

      return {
        referenceId: row.referenceId,
        code: row.code,
        modelName: row.modelName,
        color: row.color,
        priceCop: row.priceCop,
        confirmedSize: input.confirmedSize,
        availableQuantity: row.physicalQuantity - row.reservedQuantity,
        photoStorageKey: row.photoStorageKey,
        photoMimeType: row.photoMimeType as 'image/jpeg' | 'image/png',
      };
    });
  }
}
