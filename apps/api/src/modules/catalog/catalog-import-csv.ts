import {
  normalizeReferenceCode,
  parseShoeSize,
  validatePriceCop,
  validateQuantity,
} from './catalog-validation.js';

export type CatalogImportRowError = Readonly<{
  row: number;
  field: string;
  code: string;
  message: string;
}>;

export type ParsedCatalogImportReference = Readonly<{
  code: string;
  modelName: string;
  color: string;
  priceCop: number;
  stock: readonly Readonly<{ size: string; physicalQuantity: number }>[];
}>;

export type ParsedCatalogImport = Readonly<{
  references: readonly ParsedCatalogImportReference[];
  errors: readonly CatalogImportRowError[];
}>;

const HEADER = [
  'reference_code',
  'model_name',
  'color',
  'price_cop',
  'size',
  'physical_quantity',
] as const;

function parseRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]!;
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (quoted) {
    throw new Error('CSV contains an unclosed quoted field');
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }

  return rows;
}

function parseStrictInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseCatalogImportCsv(input: string): ParsedCatalogImport {
  const rows = parseRows(input);
  if (rows.length === 0 || rows[0] === undefined) {
    return {
      references: [],
      errors: [
        {
          row: 1,
          field: 'file',
          code: 'empty_file',
          message: 'El archivo CSV está vacío',
        },
      ],
    };
  }

  const header = rows[0];
  if (
    header.length !== HEADER.length ||
    header.some((value, index) => value !== HEADER[index])
  ) {
    return {
      references: [],
      errors: [
        {
          row: 1,
          field: 'header',
          code: 'invalid_header',
          message: `El encabezado debe ser: ${HEADER.join(',')}`,
        },
      ],
    };
  }

  const errors: CatalogImportRowError[] = [];
  const grouped = new Map<
    string,
    {
      code: string;
      modelName: string;
      color: string;
      priceCop: number;
      stock: { size: string; physicalQuantity: number }[];
      sizes: Set<string>;
    }
  >();

  for (const [index, row] of rows.slice(1).entries()) {
    const rowNumber = index + 2;
    if (row.length !== HEADER.length) {
      errors.push({
        row: rowNumber,
        field: 'row',
        code: 'invalid_column_count',
        message: 'La fila debe tener exactamente seis columnas',
      });
      continue;
    }

    const [rawCode, rawModelName, rawColor, rawPrice, rawSize, rawQuantity] =
      row as [string, string, string, string, string, string];
    try {
      const code = normalizeReferenceCode(rawCode);
      const modelName = rawModelName.trim();
      const color = rawColor.trim();
      const parsedPrice = parseStrictInteger(rawPrice);
      const parsedQuantity = parseStrictInteger(rawQuantity);
      if (modelName.length < 1 || modelName.length > 120) {
        throw new Error('invalid_model_name');
      }
      if (color.length < 1 || color.length > 80) {
        throw new Error('invalid_color');
      }
      if (parsedPrice === null) {
        throw new Error('invalid_price');
      }
      if (parsedQuantity === null) {
        throw new Error('invalid_quantity');
      }
      const priceCop = validatePriceCop(parsedPrice);
      const physicalQuantity = validateQuantity(parsedQuantity);
      const size = parseShoeSize(rawSize);
      const existing = grouped.get(code);
      if (existing !== undefined) {
        if (
          existing.modelName !== modelName ||
          existing.color !== color ||
          existing.priceCop !== priceCop
        ) {
          throw new Error('inconsistent_reference');
        }
        if (existing.sizes.has(size)) {
          throw new Error('duplicate_reference_size');
        }
        existing.sizes.add(size);
        existing.stock.push({ size, physicalQuantity });
      } else {
        grouped.set(code, {
          code,
          modelName,
          color,
          priceCop,
          stock: [{ size, physicalQuantity }],
          sizes: new Set([size]),
        });
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : 'invalid_row';
      errors.push({
        row: rowNumber,
        field: 'row',
        code,
        message: 'La fila contiene datos inválidos',
      });
    }
  }

  return {
    references: [...grouped.values()].map(({ sizes: _sizes, ...reference }) =>
      Object.freeze(reference),
    ),
    errors,
  };
}
