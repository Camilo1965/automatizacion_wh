/**
 * Build a child-process env for Playwright E2E without NO_COLOR/FORCE_COLOR clashes.
 * Always strips NO_COLOR so Playwright's FORCE_COLOR does not warn.
 */
export function sanitizeE2eEnv(
  input: Record<string, string | undefined>,
): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'NO_COLOR') {
      continue;
    }
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}

/** Mutates process.env for the current E2E parent process. */
export function clearProcessNoColor(): void {
  delete process.env.NO_COLOR;
}
