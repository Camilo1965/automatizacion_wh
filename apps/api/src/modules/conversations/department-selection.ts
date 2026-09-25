export function canonicalDepartment(
  input: string,
  departments: readonly string[],
): string | null {
  const normalized = normalizeDepartment(input);
  const matches = departments.filter(
    (department) => normalizeDepartment(department) === normalized,
  );
  return matches.length === 1 ? matches[0]! : null;
}

function normalizeDepartment(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-CO')
    .replace(/\s+/g, ' ');
}
