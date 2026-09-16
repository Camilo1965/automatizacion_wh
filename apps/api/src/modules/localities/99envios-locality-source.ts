export type LocalityKind = 'municipality' | 'population_center';

export type NinetyNineEnviosLocalityRow = Readonly<{
  daneCode: string;
  department: string;
  locality: string;
  kind: LocalityKind;
  sourceLabel: string;
  normalizedDepartment: string;
  normalizedLocality: string;
}>;

export type NinetyNineEnviosLocalityIssue = Readonly<{
  row: number;
  code: 'invalid_dane' | 'duplicate_dane' | 'ambiguous_label';
  message: string;
}>;

export type NinetyNineEnviosLocalitySourceResult = Readonly<{
  rows: readonly NinetyNineEnviosLocalityRow[];
  issues: readonly NinetyNineEnviosLocalityIssue[];
}>;

export function toColombianLocalities(
  rows: readonly NinetyNineEnviosLocalityRow[],
) {
  return rows.map((row) => ({
    carrierCode: row.daneCode,
    department: row.department,
    locality: row.locality,
    country: 'CO' as const,
    normalizedName: row.normalizedLocality,
  }));
}

function normalize(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-CO');
}

const displayNames = new Map<string, string>([
  ['medellin', 'Medellín'],
  ['bogota d.c.', 'Bogotá D.C.'],
]);

function displayName(value: string): string {
  const normalized = normalize(value);
  const known = displayNames.get(normalized);
  if (known !== undefined) return known;
  return value
    .toLocaleLowerCase('es-CO')
    .replace(/(?:^|\s)\S/gu, (letter) => letter.toLocaleUpperCase('es-CO'));
}

function parseLabel(label: string):
  | Readonly<{ locality: string; department: string }>
  | undefined {
  const parts = label
    .split(' - ')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length !== 2) return undefined;
  return { locality: parts[0]!, department: parts[1]! };
}

export function parse99EnviosLocalitySource(
  source: string,
): NinetyNineEnviosLocalitySourceResult {
  const rows: NinetyNineEnviosLocalityRow[] = [];
  const issues: NinetyNineEnviosLocalityIssue[] = [];
  const seenCodes = new Set<string>();
  const entries = [...source.matchAll(/\[\s*["']value["']\s*=>\s*["']([^"']+)["']\s*,\s*["']label["']\s*=>\s*["']([^"']+)["']\s*\]/gu)];

  for (const [index, entry] of entries.entries()) {
    const row = index + 1;
    const daneCode = entry[1]!.trim();
    const sourceLabel = entry[2]!.trim();
    if (!/^\d{8}$/.test(daneCode)) {
      issues.push({ row, code: 'invalid_dane', message: 'Código DANE inválido' });
      continue;
    }
    if (seenCodes.has(daneCode)) {
      issues.push({ row, code: 'duplicate_dane', message: 'Código DANE repetido' });
      continue;
    }
    const parsed = parseLabel(sourceLabel);
    if (parsed === undefined) {
      issues.push({ row, code: 'ambiguous_label', message: 'Etiqueta de localidad ambigua' });
      continue;
    }
    seenCodes.add(daneCode);
    rows.push({
      daneCode,
      department: displayName(parsed.department),
      locality: displayName(parsed.locality),
      kind: daneCode.endsWith('000') ? 'municipality' : 'population_center',
      sourceLabel,
      normalizedDepartment: normalize(parsed.department),
      normalizedLocality: normalize(parsed.locality),
    });
  }
  return { rows, issues };
}
