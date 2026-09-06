import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { createAdminUser } from '../src/cli/admin-create.js';
import { resetAdminPassword } from '../src/cli/admin-reset-password.js';
import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { AuthService } from '../src/modules/auth/auth-service.js';
import { UsernameConflictError } from '../src/modules/auth/auth-errors.js';
import { PostgresAdminAuthRepository } from '../src/modules/auth/postgres-admin-auth-repository.js';
import { hashSessionToken } from '../src/modules/auth/session-token.js';
import {
  assertTestDatabaseName,
  requireTestDatabaseUrl,
} from './helpers/test-database.js';

const testDatabaseUrl = requireTestDatabaseUrl();

async function resetAdminTables(): Promise<void> {
  const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });
  try {
    await sql`TRUNCATE TABLE admin_sessions, admin_users RESTART IDENTITY CASCADE`;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

describe('admin create and reset password CLI logic', () => {
  beforeAll(async () => {
    assertTestDatabaseName(testDatabaseUrl);
    await runMigrations(testDatabaseUrl);
  });

  beforeEach(async () => {
    await resetAdminTables();
  });

  it('creates an admin user and rejects duplicates without changing the existing hash', async () => {
    const created = await createAdminUser({
      databaseUrl: testDatabaseUrl,
      username: 'Camila',
      password: 'password1234',
      passwordConfirmation: 'password1234',
    });
    expect(created.username).toBe('camila');

    const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });
    try {
      const rows = await sql<{ username: string; password_hash: string }[]>`
        SELECT username, password_hash FROM admin_users
      `;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.username).toBe('camila');
      expect(rows[0]?.password_hash.startsWith('scrypt$')).toBe(true);
      expect(rows[0]?.password_hash.includes('password1234')).toBe(false);
      const originalHash = rows[0]!.password_hash;

      await expect(
        createAdminUser({
          databaseUrl: testDatabaseUrl,
          username: 'camila',
          password: 'different-pass',
          passwordConfirmation: 'different-pass',
        }),
      ).rejects.toBeInstanceOf(UsernameConflictError);

      const after = await sql<{ password_hash: string }[]>`
        SELECT password_hash FROM admin_users WHERE username = 'camila'
      `;
      expect(after[0]?.password_hash).toBe(originalHash);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('resets password and revokes open sessions in the same transaction', async () => {
    await createAdminUser({
      databaseUrl: testDatabaseUrl,
      username: 'camila',
      password: 'password1234',
      passwordConfirmation: 'password1234',
    });

    const database = createPostgresDatabase(testDatabaseUrl);
    try {
      const repository = new PostgresAdminAuthRepository(database);
      const authService = new AuthService(repository);
      const login = await authService.login('camila', 'password1234');

      const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });
      try {
        const before = await sql<
          { token_hash: string; revoked_at: Date | null }[]
        >`
          SELECT token_hash, revoked_at FROM admin_sessions
        `;
        expect(before).toHaveLength(1);
        expect(before[0]?.token_hash).toBe(hashSessionToken(login.token));
        expect(before[0]?.revoked_at).toBeNull();
        expect(before[0]?.token_hash).not.toBe(login.token);
      } finally {
        await sql.end({ timeout: 5 });
      }

      await resetAdminPassword({
        databaseUrl: testDatabaseUrl,
        username: 'camila',
        password: 'new-password-99',
        passwordConfirmation: 'new-password-99',
      });

      const afterSql = postgres(testDatabaseUrl, { max: 1, prepare: false });
      try {
        const sessions = await afterSql<{ revoked_at: Date | null }[]>`
          SELECT revoked_at FROM admin_sessions
        `;
        expect(sessions[0]?.revoked_at).not.toBeNull();

        const users = await afterSql<{ password_hash: string }[]>`
          SELECT password_hash FROM admin_users WHERE username = 'camila'
        `;
        expect(users[0]?.password_hash.includes('new-password-99')).toBe(false);
      } finally {
        await afterSql.end({ timeout: 5 });
      }

      await expect(authService.getSession(login.token)).rejects.toMatchObject({
        code: 'authentication_required',
      });
      await expect(
        authService.login('camila', 'password1234'),
      ).rejects.toMatchObject({ code: 'invalid_credentials' });
      await expect(
        authService.login('camila', 'new-password-99'),
      ).resolves.toMatchObject({ user: { username: 'camila' } });
    } finally {
      await database.close();
    }
  });

  it('exposes reproducible CLI entrypoints', async () => {
    const createModule = await import('../src/cli/admin-create.js');
    const resetModule = await import('../src/cli/admin-reset-password.js');
    expect(typeof createModule.main).toBe('function');
    expect(typeof resetModule.main).toBe('function');
    expect(typeof createModule.createAdminUser).toBe('function');
    expect(typeof resetModule.resetAdminPassword).toBe('function');
  });
});
