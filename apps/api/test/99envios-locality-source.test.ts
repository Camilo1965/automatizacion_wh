import { describe, expect, it } from 'vitest';

import {
  parse99EnviosLocalitySource,
  toColombianLocalities,
} from '../src/modules/localities/99envios-locality-source.js';

describe('parse99EnviosLocalitySource', () => {
  it('normalizes documented 99envios labels and preserves eight-digit DANE codes', () => {
    const result = parse99EnviosLocalitySource(
      [
        '["value" => "05001000", "label" => "MEDELLIN - ANTIOQUIA"],',
        '["value" => "05837001", "label" => "CURRULAO - ANTIOQUIA"],',
      ].join('\n'),
    );

    expect(result.rows).toEqual([
      {
        daneCode: '05001000',
        department: 'Antioquia',
        locality: 'Medellín',
        kind: 'municipality',
        sourceLabel: 'MEDELLIN - ANTIOQUIA',
        normalizedDepartment: 'antioquia',
        normalizedLocality: 'medellin',
      },
      {
        daneCode: '05837001',
        department: 'Antioquia',
        locality: 'Currulao',
        kind: 'population_center',
        sourceLabel: 'CURRULAO - ANTIOQUIA',
        normalizedDepartment: 'antioquia',
        normalizedLocality: 'currulao',
      },
    ]);
    expect(result.issues).toEqual([]);
  });

  it('reports non-Colombian or malformed provider codes without publishing them', () => {
    const result = parse99EnviosLocalitySource(
      [
        '["value" => "1000001", "label" => "Ciudad de Mexico"],',
        '["value" => "05001000", "label" => "MEDELLIN - ANTIOQUIA"],',
        '["value" => "05001000", "label" => "MEDELLIN - ANTIOQUIA"],',
      ].join('\n'),
    );

    expect(result.rows).toHaveLength(1);
    expect(result.issues).toEqual([
      expect.objectContaining({ row: 1, code: 'invalid_dane' }),
      expect.objectContaining({ row: 3, code: 'duplicate_dane' }),
    ]);
  });

  it('converts only validated Colombian rows into the canonical locality import shape', () => {
    const result = parse99EnviosLocalitySource(
      [
        '["value" => "05001000", "label" => "MEDELLIN - ANTIOQUIA"],',
        '["value" => "1000001", "label" => "CIUDAD DE MEXICO - MEXICO"],',
      ].join('\n'),
    );

    expect(toColombianLocalities(result.rows)).toEqual([
      {
        carrierCode: '05001000',
        department: 'Antioquia',
        locality: 'Medellín',
        country: 'CO',
        normalizedName: 'medellin',
      },
    ]);
  });
});
