export type LocalityImportError = Readonly<{
  row: number;
  code: string;
  message: string;
}>;

export type ColombianLocality = Readonly<{
  carrierCode: string;
  department: string;
  locality: string;
  country: 'CO';
  normalizedName: string;
}>;

export type LocalityImportResult = Readonly<{
  localities: readonly ColombianLocality[];
  errors: readonly LocalityImportError[];
}>;

const HEADER = 'carrier_code,department,locality,country';

function normalize(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-CO');
}

export function parseColombianLocalitiesCsv(
  source: string,
): LocalityImportResult {
  const lines = source.split(/\r?\n/).filter((line) => line !== '');
  if (lines[0] !== HEADER) {
    return {
      localities: [],
      errors: [
        { row: 1, code: 'invalid_header', message: 'Encabezado inválido' },
      ],
    };
  }

  const localities: ColombianLocality[] = [];
  const errors: LocalityImportError[] = [];
  const codes = new Set<string>();
  for (const [index, line] of lines.slice(1).entries()) {
    const row = index + 2;
    const fields = line.split(',');
    if (fields.length !== 4) {
      errors.push({
        row,
        code: 'invalid_column_count',
        message: 'Fila inválida',
      });
      continue;
    }
    const [carrierCodeRaw, departmentRaw, localityRaw, countryRaw] = fields;
    const carrierCode = carrierCodeRaw!.trim();
    const department = departmentRaw!.trim();
    const locality = localityRaw!.trim();
    const country = countryRaw!.trim();
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(carrierCode)) {
      errors.push({
        row,
        code: 'invalid_carrier_code',
        message: 'Código inválido',
      });
    } else if (codes.has(carrierCode)) {
      errors.push({
        row,
        code: 'duplicate_carrier_code',
        message: 'Código repetido',
      });
    } else if (country !== 'CO') {
      errors.push({
        row,
        code: 'invalid_country',
        message: 'Solo se admite CO',
      });
    } else if (department.length === 0 || department.length > 100) {
      errors.push({
        row,
        code: 'invalid_department',
        message: 'Departamento inválido',
      });
    } else if (locality.length === 0 || locality.length > 120) {
      errors.push({
        row,
        code: 'invalid_locality',
        message: 'Localidad inválida',
      });
    } else {
      codes.add(carrierCode);
      localities.push({
        carrierCode,
        department,
        locality,
        country: 'CO',
        normalizedName: normalize(locality),
      });
    }
  }
  return { localities, errors };
}
