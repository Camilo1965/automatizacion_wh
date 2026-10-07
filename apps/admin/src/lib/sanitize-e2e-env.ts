const processRuntimeKeys = [
  'PATH',
  'Path',
  'SystemRoot',
  'WINDIR',
  'ComSpec',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'FORCE_COLOR',
] as const;

const testRuntimeKeys = [
  'NODE_ENV',
  'HOST',
  'PORT',
  'INTEGRATION_ENCRYPTION_KEY',
  'STORAGE_DRIVER',
  'MEDIA_ROOT',
  'LOG_LEVEL',
  'DATABASE_URL',
  'TEST_DATABASE_URL',
  'ADMIN_ORIGIN',
  'CAMILA_API_BASE_URL',
  'CAMILA_E2E_API_PORT',
  'CAMILA_E2E_ENV_DIR',
  'CAMILA_E2E_ADMIN_PORT',
  'CAMILA_E2E_USERNAME',
  'CAMILA_E2E_PASSWORD',
] as const;

export function sanitizeE2eEnv(
  input: Record<string, string | undefined>,
): Record<string, string> {
  const output: Record<string, string> = {};
  const allowed = new Set<string>([...processRuntimeKeys, ...testRuntimeKeys]);
  for (const [key, value] of Object.entries(input)) {
    if (key === 'NO_COLOR') continue;
    if (!allowed.has(key)) continue;
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
