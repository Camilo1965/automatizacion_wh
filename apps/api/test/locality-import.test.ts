import { describe, expect, it } from 'vitest';

import { parseColombianLocalitiesCsv } from '../src/modules/localities/locality-import.js';
import {
  LocalityImportError,
  LocalityService,
} from '../src/modules/localities/locality-service.js';

describe('parseColombianLocalitiesCsv', () => {
  it('keeps carrier codes as text and rejects repeated codes', () => {
    const result = parseColombianLocalitiesCsv(
      [
        'carrier_code,department,locality,country',
        '00123,Antioquia,Medellín,CO',
        '00123,Antioquia,Envigado,CO',
      ].join('\n'),
    );

    expect(result.localities).toEqual([
      {
        carrierCode: '00123',
        department: 'Antioquia',
        locality: 'Medellín',
        country: 'CO',
        normalizedName: 'medellin',
      },
    ]);
    expect(result.errors).toEqual([
      expect.objectContaining({ row: 3, code: 'duplicate_carrier_code' }),
    ]);
  });
});

describe('LocalityService.import99EnviosSource', () => {
  it('imports valid official rows and surfaces source data issues before persistence', async () => {
    const replaceAll = async () => ({ imported: 1, unchanged: false });
    const service = new LocalityService({
      replaceAll,
      list: async () => ({ items: [], nextAfterCode: null }),
      listDepartments: async () => [],
    });

    await expect(
      service.import99EnviosSource(
        [
          '["value" => "05001000", "label" => "MEDELLIN - ANTIOQUIA"],',
          '["value" => "1000001", "label" => "CIUDAD DE MEXICO - MEXICO"],',
        ].join('\n'),
      ),
    ).resolves.toEqual({ imported: 1, unchanged: false });

    await expect(
      service.import99EnviosSource(
        '["value" => "1000001", "label" => "CIUDAD DE MEXICO - MEXICO"],',
      ),
    ).rejects.toBeInstanceOf(LocalityImportError);
  });
});
