import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = path.join(root, 'apps/api');
const apiRequire = createRequire(path.join(apiDir, 'package.json'));
const suite = process.argv[2];
const tests = process.argv.slice(3);
if (!['api-unit', 'api-integration'].includes(suite)) {
  throw new Error(
    'Usage: node scripts/test-isolated.mjs api-unit|api-integration [test paths]',
  );
}
if (tests.some((test) => !/^test\/[\w./-]+\.test\.ts$/.test(test))) {
  throw new Error('Pass test paths inside apps/api/test only.');
}

const suffix = randomBytes(5).toString('hex');
const role = `kairo_check_${suffix}`;
const databaseName = `${role}_test`;
const password = randomBytes(24).toString('hex');
let createdRole = false;

function psql(statement) {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'camila-postgres-1',
      'psql',
      '-U',
      'camila',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-qAt',
    ],
    { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
}

function dropOwnedTestDatabases() {
  const names = psql(
    `SELECT datname FROM pg_database WHERE datdba=(SELECT oid FROM pg_roles WHERE rolname='${role}') AND datname LIKE '%_test' ORDER BY datname;`,
  )
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  for (const name of names) {
    if (
      !new RegExp(`^(?:${role}|camila_upgrade_[0-9]+_[0-9]+)_test$`).test(name)
    ) {
      throw new Error(
        `Refusing to drop unexpected temporary database owned by ${role}: ${name}`,
      );
    }
    psql(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${name}' AND pid<>pg_backend_pid(); DROP DATABASE "${name}";`,
    );
  }
}

const env = {};
for (const key of [
  'PATH',
  'Path',
  'SystemRoot',
  'WINDIR',
  'ComSpec',
  'TEMP',
  'TMP',
  'USERPROFILE',
]) {
  if (process.env[key] !== undefined) env[key] = process.env[key];
}
Object.assign(env, {
  NODE_ENV: 'test',
  INTEGRATION_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  STORAGE_DRIVER: 'local',
  MEDIA_ROOT: path.join(root, '.superpowers', 'isolated-test-media', suffix),
  LOG_LEVEL: 'error',
});
let exitCode;
try {
  if (suite === 'api-integration') {
    psql(
      `CREATE ROLE "${role}" LOGIN PASSWORD '${password}' CREATEDB NOSUPERUSER;`,
    );
    createdRole = true;
    psql(`CREATE DATABASE "${databaseName}" OWNER "${role}";`);
    const url = `postgresql://${role}:${password}@127.0.0.1:5432/${databaseName}`;
    env.DATABASE_URL = url;
    env.TEST_DATABASE_URL = url;
  }
  const vitest = path.join(
    path.dirname(apiRequire.resolve('vitest')),
    'vitest.mjs',
  );
  const args = [
    vitest,
    'run',
    '--project',
    suite === 'api-unit' ? 'unit' : 'integration',
    ...(suite === 'api-integration' ? ['--fileParallelism=false'] : []),
    ...tests,
  ];
  exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: apiDir,
      env,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
} finally {
  if (createdRole) {
    dropOwnedTestDatabases();
    psql(`DROP ROLE "${role}";`);
  }
}
process.exitCode = exitCode;
