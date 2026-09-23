/* eslint-disable @typescript-eslint/ban-ts-comment -- smoke helper is a plain JavaScript release module */
// @ts-nocheck
import { describe, expect, it } from 'vitest';

import * as smokeHelpers from '../../../scripts/lib/production-smoke-helpers.mjs';
import {
  assertBackupHeartbeat,
  parseBackupId,
  projectScopedComposeFiles,
  renderStagingEnv,
  smokeImageTags,
  smokeProjectName,
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
  rootAccessKey: 'stg_root_access',
  rootSecretKey: 'test-root-password',
  adminUsername: 'smoke-owner',
  adminPassword: 'Adm_smoke_password_9x',
};

describe('production smoke helpers', () => {
  it('rejects any staging service with a public published port', () => {
    expect(typeof smokeHelpers.assertStagingNetworkIsolation).toBe('function');
    const safe = {
      services: {
        caddy: {
          ports: [{ host_ip: '127.0.0.1', target: 443, published: '18443' }],
        },
        postgres: {
          ports: [{ host_ip: '127.0.0.1', target: 5432, published: '55432' }],
        },
        api: { ports: [] },
      },
    };
    expect(() =>
      smokeHelpers.assertStagingNetworkIsolation(safe),
    ).not.toThrow();
    expect(() =>
      smokeHelpers.assertStagingNetworkIsolation({
        services: {
          ...safe.services,
          api: { ports: [{ target: 3000, published: '3000' }] },
        },
      }),
    ).toThrow(/api.*non-loopback/i);
    expect(() =>
      smokeHelpers.assertStagingNetworkIsolation({
        services: {
          ...safe.services,
          caddy: {
            ports: [
              ...safe.services.caddy.ports,
              { target: 80, published: '80' },
            ],
          },
        },
      }),
    ).toThrow(/caddy.*non-loopback/i);
  });

  it('isolates every smoke in a unique Compose project', () => {
    const first = smokeProjectName();
    const second = smokeProjectName();
    expect(first).toMatch(/^kairo-smoke-[0-9a-f]{16}$/);
    expect(second).not.toBe(first);
    expect(projectScopedComposeFiles(first)).toEqual([
      '-p',
      first,
      '-f',
      'compose.prod.yaml',
      '-f',
      'compose.staging.yaml',
    ]);
    expect(() => projectScopedComposeFiles('camila-prod')).toThrow(
      /smoke project/i,
    );
    expect(smokeImageTags(first)).toEqual([
      `${first}-api:local`,
      `${first}-worker:local`,
      `${first}-admin:local`,
      `${first}-backup:local`,
    ]);
  });

  it('renders complete staging configuration with distinct media and backup credentials', () => {
    const contents = renderStagingEnv(secrets, `kairo-smoke-${'a'.repeat(16)}`);

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
    expect(envValue(contents, 'MINIO_ROOT_USER')).toBe(secrets.rootAccessKey);
    expect(envValue(contents, 'MINIO_ROOT_PASSWORD')).toBe(
      secrets.rootSecretKey,
    );
    expect(envValue(contents, 'MINIO_ROOT_USER')).not.toBe(
      envValue(contents, 'S3_ACCESS_KEY_ID'),
    );
    expect(envValue(contents, 'SMOKE_API_IMAGE')).toBe(
      `kairo-smoke-${'a'.repeat(16)}-api:local`,
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
