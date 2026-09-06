import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import {
  createPostgresDatabase,
  type PostgresDatabase,
} from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import {
  CatalogConflictError,
  CatalogNotFoundError,
  CatalogValidationError,
  PhotoCleanupError,
} from '../src/modules/catalog/catalog-errors.js';
import { DefaultCatalogService } from '../src/modules/catalog/catalog-service.js';
import { LocalPhotoStorage } from '../src/modules/catalog/local-photo-storage.js';
import { PostgresCatalogRepository } from '../src/modules/catalog/postgres-catalog-repository.js';
import type {
  PhotoStorage,
  StoredPhoto,
} from '../src/modules/catalog/photo-storage.js';
import {
  requireTestDatabaseUrl,
  resetCatalogTables,
} from './helpers/test-database.js';

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x03, 0x00,
  0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

const testDatabaseUrl = requireTestDatabaseUrl();

describe('catalog repository and service integration', () => {
  let database: PostgresDatabase;
  let mediaRoot: string;
  let repository: PostgresCatalogRepository;
  let service: DefaultCatalogService;
  let photoStorage: LocalPhotoStorage;

  beforeAll(async () => {
    await runMigrations(testDatabaseUrl);
    database = createPostgresDatabase(testDatabaseUrl);
    mediaRoot = await mkdtemp(path.join(tmpdir(), 'camila-catalog-'));
    photoStorage = new LocalPhotoStorage(mediaRoot);
    repository = new PostgresCatalogRepository(database);
    service = new DefaultCatalogService(repository, photoStorage);
  });

  afterAll(async () => {
    await database.close();
    await rm(mediaRoot, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await resetCatalogTables(testDatabaseUrl);
  });

  async function seedReference(options: {
    code: string;
    size?: string | number;
    quantity?: number;
    reserved?: number;
    withPhoto?: boolean;
    active?: boolean;
    priceCop?: number;
  }): Promise<string> {
    const reference = await service.createReference({
      code: options.code,
      modelName: `Modelo ${options.code}`,
      color: 'Negro',
      priceCop: options.priceCop ?? 120000,
    });

    if (options.withPhoto !== false) {
      await service.replacePhoto(reference.id, PNG_BYTES);
    }

    if (options.size !== undefined) {
      await service.setPhysicalStock({
        referenceId: reference.id,
        size: options.size,
        physicalQuantity: options.quantity ?? 2,
      });

      if ((options.reserved ?? 0) > 0) {
        const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });
        try {
          await sql`
            UPDATE catalog_stock
            SET reserved_quantity = ${options.reserved ?? 0}
            WHERE reference_id = ${reference.id}
              AND size = ${String(options.size)}
          `;
        } finally {
          await sql.end({ timeout: 5 });
        }
      }
    }

    if (options.active === false) {
      await service.deactivateReference(reference.id);
    }

    return reference.id;
  }

  it('preserves leading zeros in reference codes', async () => {
    const reference = await service.createReference({
      code: '01',
      modelName: 'Clasico',
      color: 'Negro',
      priceCop: 100000,
    });
    expect(reference.code).toBe('01');
  });

  it('maps duplicate codes to CatalogConflictError', async () => {
    await service.createReference({
      code: 'A15',
      modelName: 'Uno',
      color: 'Rojo',
      priceCop: 90000,
    });

    await expect(
      service.createReference({
        code: 'a15',
        modelName: 'Dos',
        color: 'Azul',
        priceCop: 90000,
      }),
    ).rejects.toBeInstanceOf(CatalogConflictError);
  });

  it('lists only purchasable references for a confirmed size with stable pagination', async () => {
    await seedReference({ code: '01', size: 37, quantity: 2 });
    await seedReference({ code: '02', size: 37, quantity: 1 });
    await seedReference({ code: '03', size: 37, quantity: 3 });
    await seedReference({ code: '04', size: 37, quantity: 1 });
    await seedReference({ code: '05', size: 37, quantity: 4 });
    await seedReference({ code: '06', size: 37, quantity: 1 });
    await seedReference({ code: '07', size: 38, quantity: 5 });
    await seedReference({ code: '08', size: 37, quantity: 0 });
    await seedReference({
      code: '09',
      size: 37,
      quantity: 2,
      withPhoto: false,
    });
    await seedReference({
      code: '10',
      size: 37,
      quantity: 2,
      active: false,
    });
    await seedReference({
      code: '11',
      size: 37,
      quantity: 2,
      reserved: 2,
    });

    const firstPage = await service.listAvailableForConfirmedSize({
      confirmedSize: 37,
    });

    expect(firstPage.items).toHaveLength(4);
    expect(firstPage.items.map((item) => item.code)).toEqual([
      '01',
      '02',
      '03',
      '04',
    ]);
    expect(firstPage.nextAfterCode).toBe('04');
    expect(firstPage.items.every((item) => item.confirmedSize === '37')).toBe(
      true,
    );

    const secondPage = await service.listAvailableForConfirmedSize(
      firstPage.nextAfterCode === null
        ? { confirmedSize: '37' }
        : { confirmedSize: '37', afterCode: firstPage.nextAfterCode },
    );

    expect(secondPage.items.map((item) => item.code)).toEqual(['05', '06']);
    expect(
      secondPage.items.some((item) =>
        firstPage.items.some((first) => first.code === item.code),
      ),
    ).toBe(false);
    expect(secondPage.items.some((item) => item.code === '07')).toBe(false);
    expect(secondPage.items.some((item) => item.code === '08')).toBe(false);
    expect(secondPage.items.some((item) => item.code === '09')).toBe(false);
    expect(secondPage.items.some((item) => item.code === '10')).toBe(false);
    expect(secondPage.items.some((item) => item.code === '11')).toBe(false);
  });

  it('subtracts reserved quantity from availability', async () => {
    const referenceId = await seedReference({
      code: 'R1',
      size: 37.5,
      quantity: 5,
      reserved: 2,
    });

    const page = await service.listAvailableForConfirmedSize({
      confirmedSize: '37.5',
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.referenceId).toBe(referenceId);
    expect(page.items[0]?.availableQuantity).toBe(3);
    expect(page.items[0]).not.toHaveProperty('reservedQuantity');
  });

  it('keeps data after reconnecting to PostgreSQL', async () => {
    const reference = await service.createReference({
      code: 'KEEP',
      modelName: 'Persistente',
      color: 'Cafe',
      priceCop: 110000,
    });

    await database.close();
    database = createPostgresDatabase(testDatabaseUrl);
    repository = new PostgresCatalogRepository(database);
    service = new DefaultCatalogService(repository, photoStorage);

    const found = await repository.findReferenceById(reference.id);
    expect(found?.code).toBe('KEEP');
  });

  it('records initial and manual stock movements atomically', async () => {
    const reference = await service.createReference({
      code: 'STK',
      modelName: 'Stock',
      color: 'Verde',
      priceCop: 80000,
    });

    await service.setPhysicalStock({
      referenceId: reference.id,
      size: 36,
      physicalQuantity: 2,
    });

    await service.setPhysicalStock({
      referenceId: reference.id,
      size: 36,
      physicalQuantity: 5,
      note: 'ajuste manual',
    });

    const same = await service.setPhysicalStock({
      referenceId: reference.id,
      size: 36,
      physicalQuantity: 5,
    });
    expect(same.physicalQuantity).toBe(5);

    const movements = await repository.listInventoryMovements(
      reference.id,
      '36',
    );
    expect(movements).toHaveLength(2);
    expect(movements[0]?.reason).toBe('initial');
    expect(movements[1]?.reason).toBe('manual_adjustment');
    expect(movements[1]?.note).toBe('ajuste manual');
  });

  it('rejects lowering physical stock below reserved', async () => {
    const referenceId = await seedReference({
      code: 'RSV',
      size: 37,
      quantity: 3,
      reserved: 2,
    });

    await expect(
      service.setPhysicalStock({
        referenceId,
        size: 37,
        physicalQuantity: 1,
      }),
    ).rejects.toBeInstanceOf(CatalogValidationError);
  });

  it('rolls back stock when movement insert fails', async () => {
    const reference = await service.createReference({
      code: 'TX',
      modelName: 'Txn',
      color: 'Gris',
      priceCop: 70000,
    });

    const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });
    try {
      await sql`
        CREATE OR REPLACE FUNCTION camila_fail_movement()
        RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'forced movement failure';
        END;
        $$ LANGUAGE plpgsql
      `;
      await sql`
        CREATE TRIGGER camila_fail_movement_trigger
        BEFORE INSERT ON inventory_movements
        FOR EACH ROW EXECUTE FUNCTION camila_fail_movement()
      `;

      await expect(
        service.setPhysicalStock({
          referenceId: reference.id,
          size: 37,
          physicalQuantity: 4,
        }),
      ).rejects.toThrow();

      const stock = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM catalog_stock
        WHERE reference_id = ${reference.id}
      `;
      expect(stock[0]?.count).toBe('0');
    } finally {
      await sql`DROP TRIGGER IF EXISTS camila_fail_movement_trigger ON inventory_movements`;
      await sql`DROP FUNCTION IF EXISTS camila_fail_movement()`;
      await sql.end({ timeout: 5 });
    }
  });

  it('prevents concurrent duplicate stock rows for the same size', async () => {
    const reference = await service.createReference({
      code: 'CON',
      modelName: 'Concurrente',
      color: 'Blanco',
      priceCop: 95000,
    });

    const results = await Promise.allSettled([
      service.setPhysicalStock({
        referenceId: reference.id,
        size: 38,
        physicalQuantity: 1,
      }),
      service.setPhysicalStock({
        referenceId: reference.id,
        size: 38,
        physicalQuantity: 2,
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });
    try {
      const rows = await sql<{ count: string }[]>`
        SELECT count(*)::text AS count
        FROM catalog_stock
        WHERE reference_id = ${reference.id} AND size = 38
      `;
      expect(rows[0]?.count).toBe('1');
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('deactivates without deleting stock or photo metadata', async () => {
    const referenceId = await seedReference({
      code: 'OFF',
      size: 37,
      quantity: 2,
    });

    const deactivated = await service.deactivateReference(referenceId);
    expect(deactivated.active).toBe(false);
    expect(deactivated.photo).not.toBeNull();

    const stock = await repository.listInventoryMovements(referenceId, '37');
    expect(stock.length).toBeGreaterThan(0);
  });

  it('replaces photos and cleans up according to the required sequence', async () => {
    const reference = await service.createReference({
      code: 'PIC',
      modelName: 'Foto',
      color: 'Negro',
      priceCop: 99000,
    });

    const first = await service.replacePhoto(reference.id, PNG_BYTES);
    expect(first.photo?.storageKey).toBeTruthy();

    const second = await service.replacePhoto(reference.id, PNG_BYTES);
    expect(second.photo?.storageKey).not.toBe(first.photo?.storageKey);
    expect(second.photo?.sha256).toBe(
      createHash('sha256').update(PNG_BYTES).digest('hex'),
    );

    class FailingSaveStorage implements PhotoStorage {
      async save(): Promise<StoredPhoto> {
        throw new Error('should not save');
      }
      async read(): Promise<Uint8Array> {
        return new Uint8Array();
      }
      async delete(): Promise<void> {
        throw new Error('delete failed');
      }
    }

    const cleanupService = new DefaultCatalogService(
      repository,
      new (class implements PhotoStorage {
        async save(bytes: Uint8Array): Promise<StoredPhoto> {
          return photoStorage.save(bytes);
        }
        async read(storageKey: string): Promise<Uint8Array> {
          return photoStorage.read(storageKey);
        }
        async delete(storageKey: string): Promise<void> {
          if (storageKey === second.photo?.storageKey) {
            throw new Error('cannot delete previous');
          }
          await photoStorage.delete(storageKey);
        }
      })(),
    );

    await expect(
      cleanupService.replacePhoto(reference.id, PNG_BYTES),
    ).rejects.toBeInstanceOf(PhotoCleanupError);

    const afterCleanupError = await repository.findReferenceById(reference.id);
    expect(afterCleanupError?.photo?.storageKey).not.toBe(
      second.photo?.storageKey,
    );

    class FailingDbRepository extends PostgresCatalogRepository {
      override async replacePhotoMetadata(): Promise<null> {
        throw new Error('db write failed');
      }
    }

    const failingDbService = new DefaultCatalogService(
      new FailingDbRepository(database),
      photoStorage,
    );

    const beforeFail = await repository.findReferenceById(reference.id);
    await expect(
      failingDbService.replacePhoto(reference.id, PNG_BYTES),
    ).rejects.toThrow('db write failed');
    const afterFail = await repository.findReferenceById(reference.id);
    expect(afterFail?.photo?.storageKey).toBe(beforeFail?.photo?.storageKey);

    void new FailingSaveStorage();
  });

  it('returns not found for unknown references', async () => {
    await expect(
      service.deactivateReference('00000000-0000-4000-8000-000000000000'),
    ).rejects.toBeInstanceOf(CatalogNotFoundError);
  });
});
