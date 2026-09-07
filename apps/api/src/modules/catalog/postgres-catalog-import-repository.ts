import { eq, inArray, sql } from 'drizzle-orm';

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
import type {
  CatalogImport,
  CatalogImportPreviewInput,
  CatalogImportRepository,
  CatalogImportStatus,
} from './catalog-import-repository.js';

type ImportRow = typeof catalogImports.$inferSelect;

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
      const existing =
        codes.length === 0
          ? []
          : await tx
              .select({ code: catalogReferences.code })
              .from(catalogReferences)
              .where(inArray(catalogReferences.code, codes));
      if (existing.length > 0) {
        throw new CatalogConflictError(
          'catalog_import_reference_exists',
          'A catalog reference already exists',
        );
      }

      const insertedReferences = await tx
        .insert(catalogReferences)
        .values(
          references.map((reference) => ({
            code: reference.code,
            modelName: reference.modelName,
            color: reference.color,
            priceCop: reference.priceCop,
            active: false,
          })),
        )
        .returning({ id: catalogReferences.id, code: catalogReferences.code });
      const idByCode = new Map(
        insertedReferences.map((reference) => [reference.code, reference.id]),
      );

      const stockRows = references.flatMap((reference) => {
        const referenceId = idByCode.get(reference.code);
        if (referenceId === undefined) {
          throw new Error('Imported reference was not returned by PostgreSQL');
        }
        return reference.stock.map((stock) => ({
          referenceId,
          size: stock.size,
          physicalQuantity: stock.physicalQuantity,
          reservedQuantity: 0,
        }));
      });
      if (stockRows.length > 0) {
        await tx.insert(catalogStock).values(stockRows);
        await tx.insert(inventoryMovements).values(
          stockRows.map((stock) => ({
            referenceId: stock.referenceId,
            size: stock.size,
            previousQuantity: 0,
            newQuantity: stock.physicalQuantity,
            delta: stock.physicalQuantity,
            reason: 'initial',
            note: 'Importación de catálogo',
            createdAt: sql`clock_timestamp()`,
          })),
        );
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
