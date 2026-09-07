import { describe, expect, it, vi } from 'vitest';

import { CatalogImportService } from '../src/modules/catalog/catalog-import-service.js';
import type { CatalogImportRepository } from '../src/modules/catalog/catalog-import-repository.js';

describe('CatalogImportService', () => {
  it('persists a valid preview without confirming it', async () => {
    const repository: CatalogImportRepository = {
      findExistingCodes: vi.fn(async () => []),
      createPreview: vi.fn(async (input) => ({
        id: '11111111-1111-4111-8111-111111111111',
        status: 'previewed' as const,
        createdAt: new Date('2026-09-06T00:00:00.000Z'),
        ...input,
      })),
      confirm: vi.fn(),
    };
    const service = new CatalogImportService(repository);

    const preview = await service.preview(
      new TextEncoder().encode(
        'reference_code,model_name,color,price_cop,size,physical_quantity\n01,Tenis,Negro,120000,37,2',
      ),
    );

    expect(preview.status).toBe('previewed');
    expect(preview.errors).toEqual([]);
    expect(repository.createPreview).toHaveBeenCalledOnce();
    expect(repository.confirm).not.toHaveBeenCalled();
  });

  it('marks references already present in the catalog during preview', async () => {
    const createPreview = vi.fn(async (input) => ({
      id: '11111111-1111-4111-8111-111111111111',
      status: 'invalid' as const,
      createdAt: new Date('2026-09-06T00:00:00.000Z'),
      ...input,
    }));
    const repository: CatalogImportRepository = {
      findExistingCodes: vi.fn(async () => ['01']),
      createPreview,
      confirm: vi.fn(),
    };
    const service = new CatalogImportService(repository);

    const preview = await service.preview(
      new TextEncoder().encode(
        'reference_code,model_name,color,price_cop,size,physical_quantity\n01,Tenis,Negro,120000,37,2',
      ),
    );

    expect(preview.status).toBe('invalid');
    expect(preview.errors).toContainEqual({
      row: 2,
      field: 'reference_code',
      code: 'reference_exists',
      message: 'La referencia 01 ya existe en el catálogo',
    });
    expect(createPreview).toHaveBeenCalledOnce();
  });
});
