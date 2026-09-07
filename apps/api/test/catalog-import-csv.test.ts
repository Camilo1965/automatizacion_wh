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
});
