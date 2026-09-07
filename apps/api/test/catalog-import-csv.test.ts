import { describe, expect, it } from 'vitest';

import { parseCatalogImportCsv } from '../src/modules/catalog/catalog-import-csv.js';

describe('parseCatalogImportCsv', () => {
  it('preserves leading-zero codes and groups valid half-size rows', () => {
    const result = parseCatalogImportCsv(
      [
        'reference_code,model_name,color,price_cop,size,physical_quantity',
        '01,Tenis urbano,Negro,120000,37,2',
        '01,Tenis urbano,Negro,120000,37.5,1',
      ].join('\n'),
    );

    expect(result.errors).toEqual([]);
    expect(result.references).toEqual([
      {
        code: '01',
        modelName: 'Tenis urbano',
        color: 'Negro',
        priceCop: 120000,
        stock: [
          { size: '37', physicalQuantity: 2 },
          { size: '37.5', physicalQuantity: 1 },
        ],
      },
    ]);
  });

  it('rejects imports with more than 500 data rows', () => {
    const header =
      'reference_code,model_name,color,price_cop,size,physical_quantity';
    const rows = Array.from(
      { length: 501 },
      (_, index) =>
        `REF-${String(index + 1).padStart(3, '0')},Tenis,Negro,120000,37,1`,
    );

    const result = parseCatalogImportCsv([header, ...rows].join('\n'));

    expect(result.references).toEqual([]);
    expect(result.errors).toContainEqual({
      row: 502,
      field: 'file',
      code: 'too_many_rows',
      message: 'El archivo CSV admite máximo 500 filas de datos',
    });
  });

  it('returns a file error for an unclosed quoted field', () => {
    const result = parseCatalogImportCsv(
      'reference_code,model_name,color,price_cop,size,physical_quantity\n01,"Tenis,Negro,120000,37,1',
    );

    expect(result.references).toEqual([]);
    expect(result.errors).toContainEqual({
      row: 2,
      field: 'file',
      code: 'malformed_csv',
      message: 'El archivo CSV contiene comillas sin cerrar',
    });
  });
});
