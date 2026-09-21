import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { asc } from 'drizzle-orm';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import {
  catalogReferences,
  catalogStock,
  inventoryMovements,
} from '../src/database/schema.js';
import { PostgresCatalogImportRepository } from '../src/modules/catalog/postgres-catalog-import-repository.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const testDatabaseUrl = requireTestDatabaseUrl();

describe('catalog imports integration', () => {
  const database = createPostgresDatabase(testDatabaseUrl);
  const repository = new PostgresCatalogImportRepository(database);

  beforeAll(async () => {
    await runMigrations(testDatabaseUrl);
  });

  beforeEach(async () => {
    await database.orm.execute(
      'TRUNCATE TABLE inventory_movements, catalog_stock, catalog_references, catalog_imports RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await database.close();
  });

  it('confirms a valid preview atomically with initial stock movements', async () => {
    const preview = await repository.createPreview({
      sha256: 'a'.repeat(64),
      errors: [],
      references: [
        {
          code: '01',
          modelName: 'Tenis',
          color: 'Negro',
          priceCop: 120000,
          stock: [
            { size: '37', physicalQuantity: 2 },
            { size: '37.5', physicalQuantity: 1 },
          ],
        },
      ],
    });

    const committed = await repository.confirm(preview.id);

    expect(committed.status).toBe('committed');
    const references = await database.orm
      .select({
        code: catalogReferences.code,
        active: catalogReferences.active,
      })
      .from(catalogReferences);
    expect(references).toEqual([{ code: '01', active: false }]);
    const movements = await database.orm
      .select({
        reason: inventoryMovements.reason,
        delta: inventoryMovements.delta,
      })
      .from(inventoryMovements);
    expect(movements).toEqual([
      { reason: 'initial', delta: 2 },
      { reason: 'initial', delta: 1 },
    ]);
  });

  it('updates existing references and records stock deltas', async () => {
    const [reference] = await database.orm
      .insert(catalogReferences)
      .values({
        code: '01',
        modelName: 'Tenis anterior',
        color: 'Negro',
        priceCop: 100000,
        active: true,
      })
      .returning({ id: catalogReferences.id });
    await database.orm.insert(catalogStock).values({
      referenceId: reference!.id,
      size: '37',
      physicalQuantity: 5,
      reservedQuantity: 1,
    });
    const preview = await repository.createPreview({
      sha256: 'b'.repeat(64),
      errors: [],
      references: [
        {
          code: '01',
          modelName: 'Tenis actualizado',
          color: 'Negro',
          priceCop: 130000,
          stock: [
            { size: '37', physicalQuantity: 7 },
            { size: '38', physicalQuantity: 2 },
          ],
        },
      ],
    });

    await repository.confirm(preview.id);

    const [updated] = await database.orm
      .select({
        code: catalogReferences.code,
        modelName: catalogReferences.modelName,
        priceCop: catalogReferences.priceCop,
        active: catalogReferences.active,
      })
      .from(catalogReferences);
    expect(updated).toEqual({
      code: '01',
      modelName: 'Tenis actualizado',
      priceCop: 130000,
      active: true,
    });
    const stock = await database.orm
      .select({
        size: catalogStock.size,
        physicalQuantity: catalogStock.physicalQuantity,
        reservedQuantity: catalogStock.reservedQuantity,
      })
      .from(catalogStock)
      .orderBy(asc(catalogStock.size));
    expect(stock).toEqual([
      { size: '37.0', physicalQuantity: 7, reservedQuantity: 1 },
      { size: '38.0', physicalQuantity: 2, reservedQuantity: 0 },
    ]);
    const movements = await database.orm
      .select({
        reason: inventoryMovements.reason,
        delta: inventoryMovements.delta,
      })
      .from(inventoryMovements)
      .orderBy(asc(inventoryMovements.createdAt), asc(inventoryMovements.id));
    expect(movements).toEqual([
      { reason: 'initial', delta: 2 },
      { reason: 'manual_adjustment', delta: 2 },
    ]);
  });
});
