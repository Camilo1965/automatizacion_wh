import { describe, expect, it } from 'vitest';

import { parseColombianLocalitiesCsv } from '../src/modules/localities/locality-import.js';

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
