import { and, eq, inArray, sql } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import {
  catalogImports,
  catalogReferences,
  catalogStock,
  inventoryMovements,
} from '../../database/schema.js';
import {
  CatalogConflictError,
  CatalogNotFoundError,
} from './catalog-errors.js';
import { parseShoeSize } from './catalog-validation.js';
import type {
  CatalogImport,
  CatalogImportPreviewInput,
  CatalogImportRepository,
  CatalogImportStatus,
} from './catalog-import-repository.js';

type ImportRow = typeof catalogImports.$inferSelect;

function stockKey(referenceId: string, size: string | number): string {
  return `${referenceId}:${parseShoeSize(size)}`;
}

function mapImport(row: ImportRow): CatalogImport {
  return {
    id: row.id,
    sha256: row.sha256,
    status: row.status as CatalogImportStatus,
    references: row.referencesData,
    errors: row.errorsData,
    createdAt: row.createdAt,
  };
}

export class PostgresCatalogImportRepository implements CatalogImportRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async findExistingCodes(codes: readonly string[]): Promise<string[]> {
    if (codes.length === 0) return [];
    const rows = await this.database.orm
      .select({ code: catalogReferences.code })
      .from(catalogReferences)
      .where(inArray(catalogReferences.code, [...codes]));
    return rows.map((row) => row.code);
  }

  async createPreview(
    input: CatalogImportPreviewInput,
  ): Promise<CatalogImport> {
    const status: CatalogImportStatus =
      input.errors.length === 0 ? 'previewed' : 'invalid';
    const [row] = await this.database.orm
      .insert(catalogImports)
      .values({
        sha256: input.sha256,
        status,
        referencesData: input.references,
        errorsData: input.errors,
      })
      .returning();
    if (row === undefined) {
      throw new Error('Failed to create catalog import preview');
    }
    return mapImport(row);
  }

  async confirm(importId: string): Promise<CatalogImport> {
    return this.database.orm.transaction(async (tx) => {
      const [importRow] = await tx
        .select()
        .from(catalogImports)
        .where(eq(catalogImports.id, importId))
        .limit(1)
        .for('update');
      if (importRow === undefined) {
        throw new CatalogNotFoundError('Catalog import was not found');
      }
      if (importRow.status !== 'previewed') {
        throw new CatalogConflictError(
          'catalog_import_not_confirmable',
          'Catalog import is not available for confirmation',
        );
      }

      const references = importRow.referencesData;
      const codes = references.map((reference) => reference.code);
      const existingReferences =
        codes.length === 0
          ? []
          : await tx
              .select({
                id: catalogReferences.id,
                code: catalogReferences.code,
              })
              .from(catalogReferences)
              .where(inArray(catalogReferences.code, codes))
              .for('update');
      const idByCode = new Map(
        existingReferences.map((reference) => [reference.code, reference.id]),
      );
      const newReferences = references.filter(
        (reference) => !idByCode.has(reference.code),
      );
      if (newReferences.length > 0) {
        const insertedReferences = await tx
          .insert(catalogReferences)
          .values(
            newReferences.map((reference) => ({
              code: reference.code,
              modelName: reference.modelName,
              color: reference.color,
              priceCop: reference.priceCop,
              active: false,
            })),
          )
          .returning({
            id: catalogReferences.id,
            code: catalogReferences.code,
          });
        for (const reference of insertedReferences) {
          idByCode.set(reference.code, reference.id);
        }
      }
      const newCodes = new Set(
        newReferences.map((reference) => reference.code),
      );
      for (const reference of references) {
        if (newCodes.has(reference.code)) continue;
        await tx
          .update(catalogReferences)
          .set({
            modelName: reference.modelName,
            color: reference.color,
            priceCop: reference.priceCop,
            updatedAt: sql`clock_timestamp()`,
          })
          .where(eq(catalogReferences.code, reference.code));
      }

      const stockRows = references.flatMap((reference) => {
        const referenceId = idByCode.get(reference.code);
        if (referenceId === undefined) {
          throw new Error('Imported reference was not returned by PostgreSQL');
        }
        return reference.stock.map((stock) => ({
          referenceId,
          size: parseShoeSize(stock.size),
          physicalQuantity: stock.physicalQuantity,
          reservedQuantity: 0,
        }));
      });
      if (stockRows.length > 0) {
        const referenceIds = [
          ...new Set(stockRows.map((stock) => stock.referenceId)),
        ];
        const existingStockRows = await tx
          .select({
            referenceId: catalogStock.referenceId,
            size: catalogStock.size,
            physicalQuantity: catalogStock.physicalQuantity,
            reservedQuantity: catalogStock.reservedQuantity,
          })
          .from(catalogStock)
          .where(inArray(catalogStock.referenceId, referenceIds))
          .for('update');
        const existingStock = new Map(
          existingStockRows.map((row) => [
            stockKey(row.referenceId, row.size),
            row,
          ]),
        );
        const newStockRows = stockRows.filter(
          (stock) =>
            !existingStock.has(stockKey(stock.referenceId, stock.size)),
        );
        if (newStockRows.length > 0) {
          await tx.insert(catalogStock).values(newStockRows);
        }
        const stockMovements = newStockRows.map((stock) => ({
          referenceId: stock.referenceId,
          size: stock.size,
          previousQuantity: 0,
          newQuantity: stock.physicalQuantity,
          delta: stock.physicalQuantity,
          reason: 'initial',
          note: 'Importación de catálogo',
          createdAt: sql`clock_timestamp()`,
        }));
        for (const stock of stockRows) {
          const existing = existingStock.get(
            stockKey(stock.referenceId, stock.size),
          );
          if (existing === undefined) continue;
          if (stock.physicalQuantity < existing.reservedQuantity) {
            throw new CatalogConflictError(
              'catalog_import_reserved_exceeds_physical',
              'Imported quantity cannot be lower than reserved stock',
            );
          }
          if (stock.physicalQuantity === existing.physicalQuantity) continue;
          await tx
            .update(catalogStock)
            .set({
              physicalQuantity: stock.physicalQuantity,
              updatedAt: sql`clock_timestamp()`,
            })
            .where(
              and(
                eq(catalogStock.referenceId, stock.referenceId),
                eq(catalogStock.size, stock.size),
              ),
            );
          stockMovements.push({
            referenceId: stock.referenceId,
            size: stock.size,
            previousQuantity: existing.physicalQuantity,
            newQuantity: stock.physicalQuantity,
            delta: stock.physicalQuantity - existing.physicalQuantity,
            reason: 'manual_adjustment',
            note: 'Importación de catálogo',
            createdAt: sql`clock_timestamp()`,
          });
        }
        if (stockMovements.length > 0) {
          await tx.insert(inventoryMovements).values(stockMovements);
        }
      }

      const [committed] = await tx
        .update(catalogImports)
        .set({ status: 'committed', committedAt: sql`clock_timestamp()` })
        .where(eq(catalogImports.id, importId))
        .returning();
      if (committed === undefined) {
        throw new Error('Failed to mark catalog import as committed');
      }
      return mapImport(committed);
    });
  }
}
