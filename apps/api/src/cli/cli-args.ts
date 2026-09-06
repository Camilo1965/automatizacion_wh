export function readUsernameArg(argv: readonly string[]): string {
  const flagIndex = argv.indexOf('--username');
  if (flagIndex === -1) {
    throw new Error('Missing required --username argument');
  }

  const username = argv[flagIndex + 1];
  if (
    username === undefined ||
    username.trim() === '' ||
    username.startsWith('--')
  ) {
    throw new Error('Missing required --username argument');
  }

  return username;
}

export function requireDatabaseUrl(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const databaseUrl = environment.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required');
  }
  return databaseUrl;
}
