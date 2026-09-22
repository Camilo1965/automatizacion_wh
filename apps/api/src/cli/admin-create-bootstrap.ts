import { createAdminUser } from './admin-create.js';
import { requireDatabaseUrl } from './cli-args.js';

async function main(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const databaseUrl = requireDatabaseUrl(environment);
  const username = environment.ADMIN_BOOTSTRAP_USERNAME?.trim();
  const password = environment.ADMIN_BOOTSTRAP_PASSWORD;
  if (username === undefined || username === '') {
    throw new Error('ADMIN_BOOTSTRAP_USERNAME is required');
  }
  if (password === undefined || password === '') {
    throw new Error('ADMIN_BOOTSTRAP_PASSWORD is required');
  }

  const user = await createAdminUser({
    databaseUrl,
    username,
    password,
    passwordConfirmation: password,
  });
  console.log(`Created admin user '${user.username}'`);
}

const executedAsCli =
  process.argv[1]?.includes('admin-create-bootstrap') === true;

if (executedAsCli) {
  main().catch((error: unknown) => {
    console.error('Failed to bootstrap admin user');
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exitCode = 1;
  });
}
