export function resolveOfferedLocality(
  message: string,
  offered: readonly string[],
): string | null {
  const trimmed = message.trim();
  if (!/^\d+$/.test(trimmed)) return trimmed;
  if (!/^[1-3]$/.test(trimmed)) return null;
  return offered[Number(trimmed) - 1] ?? null;
}
