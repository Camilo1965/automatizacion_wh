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

  it('allows existing references to be reconciled during confirmation', async () => {
    const findExistingCodes = vi.fn(async () => ['01']);
    const createPreview = vi.fn(async (input) => ({
      id: '11111111-1111-4111-8111-111111111111',
      status:
        input.errors.length === 0
          ? ('previewed' as const)
          : ('invalid' as const),
      createdAt: new Date('2026-09-06T00:00:00.000Z'),
      ...input,
    }));
    const repository: CatalogImportRepository = {
      findExistingCodes,
      createPreview,
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
    expect(findExistingCodes).not.toHaveBeenCalled();
    expect(createPreview).toHaveBeenCalledOnce();
  });
});
