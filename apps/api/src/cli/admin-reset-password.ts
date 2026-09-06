import passwordPrompt from '@inquirer/password';

import { createPostgresDatabase } from '../database/client.js';
import { PostgresAdminAuthRepository } from '../modules/auth/postgres-admin-auth-repository.js';
import { AuthService } from '../modules/auth/auth-service.js';
import { readUsernameArg, requireDatabaseUrl } from './cli-args.js';

export async function resetAdminPassword(options: {
  databaseUrl: string;
  username: string;
  password: string;
  passwordConfirmation: string;
}): Promise<void> {
  const database = createPostgresDatabase(options.databaseUrl);
  try {
    const repository = new PostgresAdminAuthRepository(database);
    const authService = new AuthService(repository);
    await authService.resetPassword(
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
    message: 'New password',
    mask: '*',
  });
  const passwordConfirmation = await passwordPrompt({
    message: 'Confirm new password',
    mask: '*',
  });

  await resetAdminPassword({
    databaseUrl,
    username,
    password,
    passwordConfirmation,
  });

  console.log(
    `Reset password for admin user '${username.trim().toLowerCase()}'`,
  );
}

const executedAsCli =
  process.argv[1]?.includes('admin-reset-password') === true;

if (executedAsCli) {
  main().catch((error: unknown) => {
    console.error('Failed to reset admin password');
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exitCode = 1;
  });
}
