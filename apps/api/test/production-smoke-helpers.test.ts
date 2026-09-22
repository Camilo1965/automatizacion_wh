/* eslint-disable @typescript-eslint/ban-ts-comment -- smoke helper is a plain JavaScript release module */
// @ts-nocheck
import { describe, expect, it } from 'vitest';

import {
  assertBackupHeartbeat,
  parseBackupId,
  renderStagingEnv,
} from '../../../scripts/lib/production-smoke-helpers.mjs';

function envValue(contents: string, name: string): string {
  const line = contents
    .split(/\r?\n/)
    .find((candidate) => candidate.startsWith(`${name}=`));
  if (line === undefined) throw new Error(`Missing ${name}`);
  return line.slice(name.length + 1);
}

const secrets = {
  postgresPassword: 'stg_postgres_password_123456789',
  integrationEncryptionKey: 'a'.repeat(43) + '=',
  backupEncryptionKey: 'b'.repeat(43) + '=',
  mediaAccessKey: 'stg_media_access',
  mediaSecretKey: 'stg_media_secret_123456789',
  backupAccessKey: 'stg_backup_access',
  backupSecretKey: 'stg_backup_secret_123456789',
  adminUsername: 'smoke-owner',
  adminPassword: 'Adm_smoke_password_9x',
};

describe('production smoke helpers', () => {
  it('renders complete staging configuration with distinct media and backup credentials', () => {
    const contents = renderStagingEnv(secrets);

    expect(envValue(contents, 'S3_ACCESS_KEY_ID')).toBe(secrets.mediaAccessKey);
    expect(envValue(contents, 'BACKUP_S3_ACCESS_KEY_ID')).toBe(
      secrets.backupAccessKey,
    );
    expect(envValue(contents, 'S3_ACCESS_KEY_ID')).not.toBe(
      envValue(contents, 'BACKUP_S3_ACCESS_KEY_ID'),
    );
    expect(envValue(contents, 'S3_SECRET_ACCESS_KEY')).not.toBe(
      envValue(contents, 'BACKUP_S3_SECRET_ACCESS_KEY'),
    );
    expect(envValue(contents, 'BACKUP_ENCRYPTION_KEY')).toBe(
      secrets.backupEncryptionKey,
    );
  });

  it('extracts the uploaded backup identifier from command output', () => {
    expect(
      parseBackupId(
        'Starting dump\nBackup 20260922T170101Z uploaded (123 encrypted bytes)\n',
      ),
    ).toBe('20260922T170101Z');
    expect(() => parseBackupId('backup finished without an id')).toThrow(
      /backup identifier/i,
    );
  });

  it('requires matching successful backup and cleaned restore metrics', () => {
    expect(() =>
      assertBackupHeartbeat({
        lastSuccessfulBackupAt: '2026-09-22T17:01:01.000Z',
        lastBackupId: '20260922T170101Z',
        lastRestoreDrillAt: '2026-09-22T17:02:00.000Z',
        lastRestoreDrillOk: true,
        lastRestoreDrillBackupId: '20260922T170101Z',
        cleaned: true,
      }),
    ).not.toThrow();

    expect(() =>
      assertBackupHeartbeat({
        lastSuccessfulBackupAt: '2026-09-22T17:01:01.000Z',
      }),
    ).toThrow(/restore drill/i);
    expect(() =>
      assertBackupHeartbeat({
        lastSuccessfulBackupAt: '2026-09-22T17:01:01.000Z',
        lastBackupId: 'first',
        lastRestoreDrillAt: '2026-09-22T17:02:00.000Z',
        lastRestoreDrillOk: true,
        lastRestoreDrillBackupId: 'second',
        cleaned: true,
      }),
    ).toThrow(/matching backup/i);
  });
});
