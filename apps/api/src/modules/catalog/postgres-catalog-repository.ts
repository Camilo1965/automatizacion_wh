import { and, asc, desc, eq, gt, inArray, lt, or, sql } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import {
  catalogReferences,
  catalogStock,
  inventoryMovements,
} from '../../database/schema/index.js';
import {
  CatalogConflictError,
  CatalogNotFoundError,
  CatalogValidationError,
} from './catalog-errors.js';
import type { CatalogRepository } from './catalog-repository.js';
import type {
  AdminMovementsPage,
  AdminReferenceListItem,
  AvailableCatalogItem,
  CatalogReference,
  CatalogReadiness,
  CreateReferenceInput,
  InventoryMovement,
  ListAdminMovementsInput,
  ListAdminReferencesInput,
  PhotoMetadata,
  SetPhysicalStockInput,
  StockAvailability,
  StockRecord,
  UpdateReferenceInput,
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

function mapStockAvailability(row: StockRow): StockAvailability {
  return {
    size: formatSize(row.size),
    physicalQuantity: row.physicalQuantity,
    reservedQuantity: row.reservedQuantity,
    availableQuantity: row.physicalQuantity - row.reservedQuantity,
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

function escapeLikePattern(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
}

function validateModelName(value: string): string {
  const modelName = value.trim();
  if (modelName.length < 1 || modelName.length > 120) {
    throw new CatalogValidationError(
      'modelName',
      'invalid_model_name',
      'Model name is invalid',
    );
  }
  return modelName;
}

function validateColor(value: string): string {
  const color = value.trim();
  if (color.length < 1 || color.length > 80) {
    throw new CatalogValidationError(
      'color',
      'invalid_color',
      'Color is invalid',
    );
  }
  return color;
}

export class PostgresCatalogRepository implements CatalogRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async getReadiness(): Promise<CatalogReadiness> {
    const rows = await this.database.orm.execute(sql<{
      total: number;
      active: number;
      without_photo: number;
      without_stock: number;
      ready: number;
    }>`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE active)::int AS active,
        count(*) FILTER (WHERE photo_storage_key IS NULL)::int AS without_photo,
        count(*) FILTER (WHERE NOT EXISTS (
          SELECT 1 FROM catalog_stock s
          WHERE s.reference_id = catalog_references.id
            AND s.physical_quantity - s.reserved_quantity > 0
        ))::int AS without_stock,
        count(*) FILTER (WHERE active AND photo_storage_key IS NOT NULL AND EXISTS (
          SELECT 1 FROM catalog_stock s
          WHERE s.reference_id = catalog_references.id
            AND s.physical_quantity - s.reserved_quantity > 0
        ))::int AS ready
      FROM catalog_references
    `);
    const row = rows[0];
    if (row === undefined)
      throw new Error('Failed to calculate catalog readiness');
    return {
      total: Number(row.total),
      active: Number(row.active),
      withoutPhoto: Number(row.without_photo),
      withoutAvailableStock: Number(row.without_stock),
      ready: Number(row.ready),
    };
  }

  async createReference(
    input: CreateReferenceInput,
  ): Promise<CatalogReference> {
    const code = normalizeReferenceCode(input.code);
    const priceCop = validatePriceCop(input.priceCop);
    const modelName = validateModelName(input.modelName);
    const color = validateColor(input.color);

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
          'reference_code_conflict',
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

  async updateReference(
    input: UpdateReferenceInput,
  ): Promise<CatalogReference> {
    if (
      input.modelName === undefined &&
      input.color === undefined &&
      input.priceCop === undefined
    ) {
      throw new CatalogValidationError(
        'body',
        'empty_patch',
        'At least one field is required',
      );
    }

    const values: {
      modelName?: string;
      color?: string;
      priceCop?: number;
      updatedAt: ReturnType<typeof sql>;
    } = {
      updatedAt: sql`clock_timestamp()`,
    };

    if (input.modelName !== undefined) {
      values.modelName = validateModelName(input.modelName);
    }
    if (input.color !== undefined) {
      values.color = validateColor(input.color);
    }
    if (input.priceCop !== undefined) {
      values.priceCop = validatePriceCop(input.priceCop);
    }

    const [row] = await this.database.orm
      .update(catalogReferences)
      .set(values)
      .where(eq(catalogReferences.id, input.referenceId))
      .returning();

    if (row === undefined) {
      throw new CatalogNotFoundError('Catalog reference was not found');
    }

    return mapReference(row);
  }

  async activateReference(referenceId: string): Promise<CatalogReference> {
    const existing = await this.findReferenceById(referenceId);
    if (existing === null) {
      throw new CatalogNotFoundError('Catalog reference was not found');
    }
    if (existing.active) {
      return existing;
    }

    const [row] = await this.database.orm
      .update(catalogReferences)
      .set({
        active: true,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(eq(catalogReferences.id, referenceId))
      .returning();

    if (row === undefined) {
      throw new CatalogNotFoundError('Catalog reference was not found');
    }

    return mapReference(row);
  }

  async deactivateReference(referenceId: string): Promise<CatalogReference> {
    const existing = await this.findReferenceById(referenceId);
    if (existing === null) {
      throw new CatalogNotFoundError('Catalog reference was not found');
    }
    if (!existing.active) {
      return existing;
    }

    const [row] = await this.database.orm
      .update(catalogReferences)
      .set({
        active: false,
        updatedAt: sql`clock_timestamp()`,
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
        updatedAt: sql`clock_timestamp()`,
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
          updatedAt: sql`clock_timestamp()`,
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

  async listStockForReference(
    referenceId: string,
  ): Promise<readonly StockAvailability[]> {
    const reference = await this.findReferenceById(referenceId);
    if (reference === null) {
      throw new CatalogNotFoundError('Catalog reference was not found');
    }

    const rows = await this.database.orm
      .select()
      .from(catalogStock)
      .where(eq(catalogStock.referenceId, referenceId))
      .orderBy(asc(catalogStock.size));

    return rows.map(mapStockAvailability);
  }

  async listAdminReferences(
    input: ListAdminReferencesInput,
  ): Promise<AdminReferenceListItem[]> {
    const conditions = [];

    if (input.status === 'active') {
      conditions.push(eq(catalogReferences.active, true));
    } else if (input.status === 'inactive') {
      conditions.push(eq(catalogReferences.active, false));
    }

    if (input.afterCode !== undefined) {
      conditions.push(gt(catalogReferences.code, input.afterCode));
    }

    if (input.query !== undefined && input.query.trim() !== '') {
      const pattern = `%${escapeLikePattern(input.query.trim())}%`;
      conditions.push(
        sql`(
          ${catalogReferences.code} ILIKE ${pattern} ESCAPE '\\'
          OR ${catalogReferences.modelName} ILIKE ${pattern} ESCAPE '\\'
          OR ${catalogReferences.color} ILIKE ${pattern} ESCAPE '\\'
        )`,
      );
    }

    const rows = await this.database.orm
      .select()
      .from(catalogReferences)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(catalogReferences.code), asc(catalogReferences.id))
      .limit(input.limit);

    if (rows.length === 0) {
      return [];
    }

    const referenceIds = rows.map((row) => row.id);
    const stockRows = await this.database.orm
      .select()
      .from(catalogStock)
      .where(inArray(catalogStock.referenceId, referenceIds));

    const sizesByReference = new Map<string, string[]>();
    for (const stock of stockRows) {
      if (stock.physicalQuantity - stock.reservedQuantity <= 0) {
        continue;
      }
      const sizes = sizesByReference.get(stock.referenceId) ?? [];
      sizes.push(formatSize(stock.size));
      sizesByReference.set(stock.referenceId, sizes);
    }

    for (const [referenceId, sizes] of sizesByReference) {
      sizes.sort((a, b) => Number(a) - Number(b));
      sizesByReference.set(referenceId, sizes);
    }

    return rows.map((row) => {
      const mapped = mapReference(row);
      return {
        id: mapped.id,
        code: mapped.code,
        modelName: mapped.modelName,
        color: mapped.color,
        priceCop: mapped.priceCop,
        active: mapped.active,
        photo: mapped.photo,
        availableSizes: sizesByReference.get(mapped.id) ?? [],
        updatedAt: mapped.updatedAt,
      };
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

  async listAdminMovements(
    input: ListAdminMovementsInput,
  ): Promise<AdminMovementsPage> {
    const reference = await this.findReferenceById(input.referenceId);
    if (reference === null) {
      throw new CatalogNotFoundError('Catalog reference was not found');
    }

    const conditions = [eq(inventoryMovements.referenceId, input.referenceId)];

    if (input.size !== undefined) {
      conditions.push(eq(inventoryMovements.size, parseShoeSize(input.size)));
    }

    if (input.cursor !== undefined) {
      conditions.push(
        or(
          lt(inventoryMovements.createdAt, input.cursor.createdAt),
          and(
            eq(inventoryMovements.createdAt, input.cursor.createdAt),
            lt(inventoryMovements.id, input.cursor.id),
          ),
        )!,
      );
    }

    const rows = await this.database.orm
      .select()
      .from(inventoryMovements)
      .where(and(...conditions))
      .orderBy(desc(inventoryMovements.createdAt), desc(inventoryMovements.id))
      .limit(input.limit + 1);

    const pageRows = rows.slice(0, input.limit);
    const items = pageRows.map(mapMovement);
    const last = pageRows.at(-1);
    const nextCursor =
      rows.length > input.limit && last !== undefined
        ? { createdAt: last.createdAt, id: last.id }
        : null;

    return { items, nextCursor };
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
