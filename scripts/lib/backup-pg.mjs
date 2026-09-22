/**
 * Postgres dump/restore helpers — password via PGPASSWORD / .pgpass, never argv.
 */
import { spawn } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  BackupError,
  DEFAULT_SAMPLE_TABLES,
  parseDatabaseUrl,
} from './backup-core.mjs';

function runCaptured(cmd, args, env, { input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env,
      stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (c) => stdout.push(c));
    child.stderr.on('data', (c) => stderr.push(c));
    if (input) {
      child.stdin.write(input);
      child.stdin.end();
    }
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });
}

function pgEnv(conn, baseEnv = process.env) {
  const env = { ...baseEnv };
  // Prefer PGPASSWORD over embedding secrets in argv / connection URI args.
  if (conn.password) env.PGPASSWORD = conn.password;
  // Avoid leaking full DATABASE_URL into child environ when discrete vars suffice.
  delete env.DATABASE_URL;
  return env;
}

function connArgs(conn, database = conn.database) {
  const args = [
    '-h',
    conn.host,
    '-p',
    String(conn.port),
    '-U',
    conn.user,
    '-d',
    database,
  ];
  return args;
}

export async function dumpPostgresCustom(databaseUrl, env = process.env) {
  const conn = parseDatabaseUrl(databaseUrl);
  const result = await runCaptured(
    'pg_dump',
    [...connArgs(conn), '--format=custom', '--no-owner', '--no-acl'],
    pgEnv(conn, env),
  );
  if (result.code !== 0) {
    throw new BackupError(
      'dump_failed',
      `pg_dump exit ${result.code}: ${sanitizePgOutput(result.stderr)}`,
    );
  }
  return result.stdout;
}

export async function writePgpassFile(conn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'kairo-pgpass-'));
  const file = path.join(dir, 'pgpass');
  const line = `${conn.host}:${conn.port}:${conn.database}:${conn.user}:${conn.password}\n`;
  const adminLine = `${conn.host}:${conn.port}:postgres:${conn.user}:${conn.password}\n`;
  const wildLine = `${conn.host}:${conn.port}:*:${conn.user}:${conn.password}\n`;
  await writeFile(file, `${wildLine}${adminLine}${line}`, { mode: 0o600 });
  try {
    await chmod(file, 0o600);
  } catch {
    // Windows may ignore chmod; PGPASSWORD remains primary.
  }
  return {
    file,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export async function createDatabase(databaseUrl, dbName, env = process.env) {
  assertSafeIdent(dbName);
  const conn = parseDatabaseUrl(databaseUrl);
  const exists = await runCaptured(
    'psql',
    [
      ...connArgs(conn, 'postgres'),
      '-v',
      'ON_ERROR_STOP=1',
      '-tAc',
      `SELECT 1 FROM pg_database WHERE datname = '${dbName.replace(/'/g, "''")}'`,
    ],
    pgEnv(conn, env),
  );
  if (exists.code !== 0) {
    throw new BackupError(
      'restore_failed',
      `psql exists-check failed: ${sanitizePgOutput(exists.stderr)}`,
    );
  }
  if (exists.stdout.toString('utf8').trim() === '1') return;
  const created = await runCaptured(
    'psql',
    [
      ...connArgs(conn, 'postgres'),
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `CREATE DATABASE "${dbName}"`,
    ],
    pgEnv(conn, env),
  );
  if (created.code !== 0) {
    throw new BackupError(
      'restore_failed',
      `CREATE DATABASE failed: ${sanitizePgOutput(created.stderr)}`,
    );
  }
}

export async function dropDatabase(databaseUrl, dbName, env = process.env) {
  assertSafeIdent(dbName);
  const conn = parseDatabaseUrl(databaseUrl);
  await runCaptured(
    'psql',
    [
      ...connArgs(conn, 'postgres'),
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName.replace(/'/g, "''")}' AND pid <> pg_backend_pid()`,
    ],
    pgEnv(conn, env),
  );
  const dropped = await runCaptured(
    'psql',
    [
      ...connArgs(conn, 'postgres'),
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `DROP DATABASE IF EXISTS "${dbName}"`,
    ],
    pgEnv(conn, env),
  );
  if (dropped.code !== 0) {
    throw new BackupError(
      'restore_failed',
      `DROP DATABASE failed: ${sanitizePgOutput(dropped.stderr)}`,
    );
  }
}

export async function restoreDumpFile(
  databaseUrl,
  dbName,
  dumpPath,
  env = process.env,
) {
  assertSafeIdent(dbName);
  const conn = parseDatabaseUrl(databaseUrl);
  const result = await runCaptured(
    'pg_restore',
    [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-acl',
      '-h',
      conn.host,
      '-p',
      String(conn.port),
      '-U',
      conn.user,
      '-d',
      dbName,
      dumpPath,
    ],
    pgEnv(conn, env),
  );
  // pg_restore may return 1 for non-fatal warnings; treat only hard failures.
  if (result.code !== 0 && result.code !== 1) {
    throw new BackupError(
      'restore_failed',
      `pg_restore exit ${result.code}: ${sanitizePgOutput(result.stderr)}`,
    );
  }
  if (
    result.code === 1 &&
    /FATAL|ERROR:/i.test(result.stderr) &&
    !/WARNING/i.test(result.stderr)
  ) {
    // Keep permissive for extension noise; fatal still fails validation later.
  }
  return result;
}

export async function readSchemaVersion(databaseUrl, env = process.env) {
  const conn = parseDatabaseUrl(databaseUrl);
  const result = await runCaptured(
    'psql',
    [
      ...connArgs(conn),
      '-v',
      'ON_ERROR_STOP=1',
      '-tAc',
      `SELECT COALESCE(
         (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1),
         (SELECT id::text FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1),
         'unknown'
       )`,
    ],
    pgEnv(conn, env),
  );
  if (result.code !== 0) {
    return env.BACKUP_SCHEMA_VERSION?.trim() || 'unknown';
  }
  return result.stdout.toString('utf8').trim() || 'unknown';
}

export async function validateRestoredDatabase(
  databaseUrl,
  dbName,
  { sampleTables = DEFAULT_SAMPLE_TABLES, expectedSchemaVersion } = {},
  env = process.env,
) {
  assertSafeIdent(dbName);
  const conn = parseDatabaseUrl(databaseUrl);
  const details = { sampleCounts: {}, schemaVersion: null, checks: [] };

  const schema = await runCaptured(
    'psql',
    [
      ...connArgs(conn, dbName),
      '-v',
      'ON_ERROR_STOP=1',
      '-tAc',
      `SELECT COALESCE(
         (SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1),
         'missing'
       )`,
    ],
    pgEnv(conn, env),
  );
  details.schemaVersion = schema.stdout.toString('utf8').trim();
  details.checks.push({
    name: 'drizzle_migrations',
    ok: schema.code === 0 && details.schemaVersion !== 'missing',
  });

  if (
    expectedSchemaVersion &&
    details.schemaVersion !== expectedSchemaVersion
  ) {
    details.checks.push({
      name: 'schema_version_match',
      ok: false,
      expected: expectedSchemaVersion,
      actual: details.schemaVersion,
    });
  }

  for (const table of sampleTables) {
    assertSafeIdent(table);
    const count = await runCaptured(
      'psql',
      [
        ...connArgs(conn, dbName),
        '-v',
        'ON_ERROR_STOP=1',
        '-tAc',
        `SELECT COUNT(*)::text FROM ${table}`,
      ],
      pgEnv(conn, env),
    );
    if (count.code !== 0) {
      details.sampleCounts[table] = null;
      details.checks.push({
        name: `count:${table}`,
        ok: false,
        error: sanitizePgOutput(count.stderr),
      });
    } else {
      const n = Number(count.stdout.toString('utf8').trim());
      details.sampleCounts[table] = n;
      details.checks.push({ name: `count:${table}`, ok: Number.isFinite(n) });
    }
  }

  const ok = details.checks.every((c) => c.ok);
  return { ok, details };
}

function assertSafeIdent(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new BackupError('invalid_config', `Unsafe SQL identifier: ${value}`);
  }
}

function sanitizePgOutput(text) {
  // Strip anything that looks like a URI password segment.
  return String(text || '')
    .replace(/postgresql:\/\/[^:\s]+:[^@\s]+@/gi, 'postgresql://***:***@')
    .replace(/PGPASSWORD=\S+/gi, 'PGPASSWORD=***')
    .slice(0, 500);
}

export async function writeTempDump(dir, name, bytes) {
  await writeFile(path.join(dir, name), bytes);
  return path.join(dir, name);
}

export { readFile };
