import passwordPrompt from '@inquirer/password';

import { createPostgresDatabase } from '../database/client.js';
import { PostgresAdminAuthRepository } from '../modules/auth/postgres-admin-auth-repository.js';
import { AuthService } from '../modules/auth/auth-service.js';
import { readUsernameArg, requireDatabaseUrl } from './cli-args.js';

export async function createAdminUser(options: {
  databaseUrl: string;
  username: string;
  password: string;
  passwordConfirmation: string;
}): Promise<{ id: string; username: string }> {
  const database = createPostgresDatabase(options.databaseUrl);
  try {
    const repository = new PostgresAdminAuthRepository(database);
    const authService = new AuthService(repository);
    return await authService.createUser(
      options.username,
      options.password,
      options.passwordConfirmation,
    );
  } finally {
    await database.close();
  }
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const username = readUsernameArg(argv);
  const databaseUrl = requireDatabaseUrl(environment);
  const password = await passwordPrompt({
    message: 'Password',
    mask: '*',
  });
  const passwordConfirmation = await passwordPrompt({
    message: 'Confirm password',
    mask: '*',
  });

  const user = await createAdminUser({
    databaseUrl,
    username,
    password,
    passwordConfirmation,
  });

  console.log(`Created admin user '${user.username}'`);
}

const executedAsCli =
  /admin-create\.(js|ts)$/.test(process.argv[1] ?? '') === true;

if (executedAsCli) {
  main().catch((error: unknown) => {
    console.error('Failed to create admin user');
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exitCode = 1;
  });
}
