import { describe, expect, it, vi } from 'vitest';

import {
  CatalogNotFoundError,
  PhotoCleanupError,
} from '../src/modules/catalog/catalog-errors.js';
import { DefaultCatalogService } from '../src/modules/catalog/catalog-service.js';
import type { CatalogRepository } from '../src/modules/catalog/catalog-repository.js';
import type { CatalogReference } from '../src/modules/catalog/catalog-types.js';
import type {
  PhotoStorage,
  StoredPhoto,
} from '../src/modules/catalog/photo-storage.js';

const reference: CatalogReference = {
  id: '11111111-1111-4111-8111-111111111111',
  code: '01',
  modelName: 'Clasico',
  color: 'Negro',
  priceCop: 100000,
  active: true,
  photo: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function createRepository(
  overrides: Partial<CatalogRepository> = {},
): CatalogRepository {
  return {
    createReference: vi.fn(),
    findReferenceById: vi.fn(async () => reference),
    deactivateReference: vi.fn(),
    replacePhotoMetadata: vi.fn(async () => null),
    setPhysicalStock: vi.fn(),
    listInventoryMovements: vi.fn(async () => []),
    listAvailableForConfirmedSize: vi.fn(async () => []),
    ...overrides,
  };
}

function createPhotoStorage(
  overrides: Partial<PhotoStorage> = {},
): PhotoStorage {
  const stored: StoredPhoto = {
    storageKey: '22222222-2222-4222-8222-222222222222.png',
    mimeType: 'image/png',
    byteSize: 12,
    sha256: 'a'.repeat(64),
  };

  return {
    save: vi.fn(async () => stored),
    read: vi.fn(async () => new Uint8Array([1, 2, 3])),
    delete: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('DefaultCatalogService', () => {
  it('paginates available references by confirmed size without repeating codes', async () => {
    const repository = createRepository({
      listAvailableForConfirmedSize: vi.fn(async ({ afterCode, limit }) => {
        const all = ['01', '02', '03', '04', '05', '06'].filter(
          (code) => afterCode === undefined || code > afterCode,
        );
        return all.slice(0, limit).map((code) => ({
          referenceId: code,
          code,
          modelName: `Modelo ${code}`,
          color: 'Negro',
          priceCop: 100000,
          confirmedSize: '37',
          availableQuantity: 2,
          photoStorageKey: `${code}.png`,
          photoMimeType: 'image/png' as const,
        }));
      }),
    });

    const service = new DefaultCatalogService(repository, createPhotoStorage());

    const firstPage = await service.listAvailableForConfirmedSize({
      confirmedSize: 37,
    });
    expect(firstPage.items.map((item) => item.code)).toEqual([
      '01',
      '02',
      '03',
      '04',
    ]);
    expect(firstPage.nextAfterCode).toBe('04');

    const secondPage = await service.listAvailableForConfirmedSize({
      confirmedSize: '37',
      afterCode: '04',
    });
    expect(secondPage.items.map((item) => item.code)).toEqual(['05', '06']);
    expect(secondPage.nextAfterCode).toBeNull();
  });

  it('deletes the new photo when PostgreSQL metadata replacement fails', async () => {
    const photoStorage = createPhotoStorage();
    const repository = createRepository({
      replacePhotoMetadata: vi.fn(async () => {
        throw new Error('db failed');
      }),
    });
    const service = new DefaultCatalogService(repository, photoStorage);

    await expect(
      service.replacePhoto(reference.id, new Uint8Array([1])),
    ).rejects.toThrow('db failed');

    expect(photoStorage.delete).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222.png',
    );
  });

  it('keeps the new photo when deleting the previous file fails', async () => {
    const previousKey = '33333333-3333-4333-8333-333333333333.png';
    const photoStorage = createPhotoStorage({
      delete: vi.fn(async (storageKey: string) => {
        if (storageKey === previousKey) {
          throw new Error('unlink failed');
        }
      }),
    });
    const repository = createRepository({
      findReferenceById: vi.fn(async () => ({
        ...reference,
        photo: {
          storageKey: previousKey,
          mimeType: 'image/png' as const,
          byteSize: 10,
          sha256: 'b'.repeat(64),
        },
      })),
      replacePhotoMetadata: vi.fn(async () => ({
        storageKey: previousKey,
        mimeType: 'image/png' as const,
        byteSize: 10,
        sha256: 'b'.repeat(64),
      })),
    });

    const service = new DefaultCatalogService(repository, photoStorage);

    await expect(
      service.replacePhoto(reference.id, new Uint8Array([1])),
    ).rejects.toBeInstanceOf(PhotoCleanupError);

    expect(repository.replacePhotoMetadata).toHaveBeenCalled();
  });

  it('rejects photo replacement for unknown references', async () => {
    const repository = createRepository({
      findReferenceById: vi.fn(async () => null),
    });
    const service = new DefaultCatalogService(repository, createPhotoStorage());

    await expect(
      service.replacePhoto(reference.id, new Uint8Array([1])),
    ).rejects.toBeInstanceOf(CatalogNotFoundError);
  });
});
