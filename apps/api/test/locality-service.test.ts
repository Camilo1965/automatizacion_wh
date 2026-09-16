import { describe, expect, it, vi } from 'vitest';

import { LocalityService } from '../src/modules/localities/locality-service.js';
import type { LocalityRepository } from '../src/modules/localities/locality-repository.js';

describe('LocalityService', () => {
  it('imports a valid source idempotently through its repository', async () => {
    const repository: LocalityRepository = {
      replaceAll: vi.fn(async () => ({ imported: 1, unchanged: false })),
      list: vi.fn(async () => ({ items: [], nextAfterCode: null })),
      listDepartments: vi.fn(async () => []),
    };
    const service = new LocalityService(repository);
    const csv = new TextEncoder().encode(
      'carrier_code,department,locality,country\n00123,Antioquia,Medellín,CO',
    );

    await expect(service.importCsv(csv)).resolves.toEqual({
      imported: 1,
      unchanged: false,
    });
    expect(repository.replaceAll).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('rejects an empty dataset before replacing persisted localities', async () => {
    const repository: LocalityRepository = {
      replaceAll: vi.fn(),
      list: vi.fn(async () => ({ items: [], nextAfterCode: null })),
      listDepartments: vi.fn(async () => []),
    };
    const service = new LocalityService(repository);

    await expect(
      service.importCsv(
        new TextEncoder().encode('carrier_code,department,locality,country'),
      ),
    ).rejects.toMatchObject({ name: 'LocalityImportError' });
    expect(repository.replaceAll).not.toHaveBeenCalled();
  });

  it('normalizes accents in locality searches', async () => {
    const list = vi.fn(async () => ({ items: [], nextAfterCode: null }));
    const repository: LocalityRepository = {
      replaceAll: vi.fn(),
      list,
      listDepartments: vi.fn(async () => []),
    };
    const service = new LocalityService(repository);

    await service.list({ query: '  Medellín ', limit: 25 });

    expect(list).toHaveBeenCalledWith({ query: 'medellin', limit: 25 });
  });
});
