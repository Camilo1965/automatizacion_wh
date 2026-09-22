import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import {
  BackupError,
  buildManifest,
  decryptDump,
  encryptDump,
  parseDatabaseUrl,
  requireBackupUploadEnv,
  runEncryptedBackup,
  runRestoreDrill,
  sha256Hex,
  stampId,
  verifyBackupArtifact,
} from '../../../scripts/lib/backup-core.mjs';

const KEY = randomBytes(32).toString('base64');

function baseEnv(overrides: Record<string, string> = {}) {
  return {
    DATABASE_URL: 'postgresql://camila:secret@127.0.0.1:5432/camila',
    BACKUP_ENCRYPTION_KEY: KEY,
    BACKUP_S3_ENDPOINT: 'http://127.0.0.1:9000',
    BACKUP_S3_BUCKET: 'kairo-backups',
    BACKUP_S3_ACCESS_KEY_ID: 'backup-key',
    BACKUP_S3_SECRET_ACCESS_KEY: 'backup-secret',
    BACKUP_S3_REGION: 'us-east-1',
    BACKUP_RETENTION_DAYS: '7',
    ...overrides,
  };
}

describe('backup-core credentials', () => {
  it('fails when encryption key missing', async () => {
    const env = baseEnv({ BACKUP_ENCRYPTION_KEY: '' });
    await expect(
      runEncryptedBackup(
        {
          dumpPostgres: async () => Buffer.from('x'),
          readSchemaVersion: async () => 'abc',
          uploadObject: async () => {},
          listObjectKeys: async () => [],
          deleteObject: async () => {},
        },
        env,
      ),
    ).rejects.toMatchObject({ code: 'missing_credentials' });
  });

  it('fails when S3 backup credentials missing', () => {
    expect(() =>
      requireBackupUploadEnv({
        BACKUP_S3_ENDPOINT: 'http://x',
        BACKUP_S3_BUCKET: 'b',
      }),
    ).toThrow(BackupError);
  });

  it('never exposes password in redacted database URL', () => {
    const parsed = parseDatabaseUrl(
      'postgresql://user:super-secret@db.example:5432/camila',
    );
    expect(parsed.password).toBe('super-secret');
    expect(parsed.redacted).not.toContain('super-secret');
    expect(parsed.redacted).toContain('user@');
  });
});

describe('backup-core dump/upload failures', () => {
  it('maps dump failure to dump_failed', async () => {
    await expect(
      runEncryptedBackup(
        {
          dumpPostgres: async () => {
            throw new Error('pg_dump boom');
          },
          readSchemaVersion: async () => 'abc',
          uploadObject: async () => {},
          listObjectKeys: async () => [],
          deleteObject: async () => {},
        },
        baseEnv(),
      ),
    ).rejects.toMatchObject({ code: 'dump_failed' });
  });

  it('maps upload failure to upload_failed after successful dump+encrypt', async () => {
    await expect(
      runEncryptedBackup(
        {
          dumpPostgres: async () => Buffer.from('custom-dump-bytes'),
          readSchemaVersion: async () => 'schema-1',
          uploadObject: async () => {
            throw new Error('network');
          },
          listObjectKeys: async () => [],
          deleteObject: async () => {},
        },
        baseEnv(),
      ),
    ).rejects.toMatchObject({ code: 'upload_failed' });
  });

  it('uploads encrypted bytes and manifest with sha256', async () => {
    const uploaded = new Map<string, Buffer>();
    const plaintext = Buffer.from('pg-dump-custom-payload');
    const result = await runEncryptedBackup(
      {
        dumpPostgres: async () => plaintext,
        readSchemaVersion: async () => 'schema-9',
        uploadObject: async (key, bytes) => {
          uploaded.set(key, Buffer.from(bytes));
        },
        listObjectKeys: async () => [],
        deleteObject: async () => {},
        now: () => new Date('2026-09-22T12:00:00.000Z'),
      },
      baseEnv(),
    );

    expect(result.manifest.sha256).toBe(sha256Hex(plaintext));
    expect(result.manifest.schemaVersion).toBe('schema-9');
    expect(result.manifest.timestamp).toBe('2026-09-22T12:00:00.000Z');
    expect(uploaded.size).toBe(2);

    const enc = uploaded.get(result.keys.encKey)!;
    const decrypted = decryptDump(enc, Buffer.from(KEY, 'base64'));
    expect(Buffer.compare(decrypted, plaintext)).toBe(0);
  });
});

describe('backup-core checksum + restore validation', () => {
  it('detects checksum mismatch on verify', async () => {
    const plaintext = Buffer.from('good-dump');
    const enc = encryptDump(plaintext, Buffer.from(KEY, 'base64'));
    const manifest = buildManifest({
      id: stampId(),
      timestamp: new Date().toISOString(),
      schemaVersion: 's1',
      sha256: createHash('sha256').update('other').digest('hex'),
      plaintextBytes: plaintext.length,
      encryptedBytes: enc.length,
      retentionDays: 7,
    });

    await expect(
      verifyBackupArtifact({
        encryptedBytes: enc,
        manifest,
        encryptionKey: KEY,
      }),
    ).rejects.toMatchObject({ code: 'checksum_mismatch' });
  });

  it('keeps drill DB when restore validation fails (no drop)', async () => {
    const plaintext = Buffer.from('restorable-dump');
    const digest = sha256Hex(plaintext);
    const enc = encryptDump(plaintext, Buffer.from(KEY, 'base64'));
    const id = '20260922T120000Z';
    const manifest = buildManifest({
      id,
      timestamp: '2026-09-22T12:00:00.000Z',
      schemaVersion: 's1',
      sha256: digest,
      plaintextBytes: plaintext.length,
      encryptedBytes: enc.length,
      retentionDays: 7,
    });

    const dropDatabase = vi.fn(async () => {});
    const createDatabase = vi.fn(async () => {});
    const restoreDump = vi.fn(async () => {});

    await expect(
      runRestoreDrill(
        {
          downloadObject: async (key: string) => {
            if (key.endsWith('.manifest.json')) {
              return Buffer.from(JSON.stringify(manifest), 'utf8');
            }
            return enc;
          },
          createDatabase,
          restoreDump,
          validateRestore: async () => ({
            ok: false,
            details: { sampleCounts: { admin_users: null }, reason: 'empty' },
          }),
          dropDatabase,
          writeTempFile: async () => {},
          removeTempFile: async () => {},
          ensureTempDir: async () => {},
        },
        baseEnv({ BACKUP_ID: id }),
        { drillDb: 'camila_restore_drill_test', tempDir: 'backups/tmp-test' },
      ),
    ).rejects.toMatchObject({ code: 'restore_validation_failed' });

    expect(createDatabase).toHaveBeenCalledWith('camila_restore_drill_test');
    expect(restoreDump).toHaveBeenCalled();
    expect(dropDatabase).not.toHaveBeenCalled();
  });

  it('drops drill DB only after successful validation', async () => {
    const plaintext = Buffer.from('restorable-dump');
    const digest = sha256Hex(plaintext);
    const enc = encryptDump(plaintext, Buffer.from(KEY, 'base64'));
    const id = '20260922T130000Z';
    const manifest = buildManifest({
      id,
      timestamp: '2026-09-22T13:00:00.000Z',
      schemaVersion: 's1',
      sha256: digest,
      plaintextBytes: plaintext.length,
      encryptedBytes: enc.length,
      retentionDays: 7,
    });

    const dropDatabase = vi.fn(async () => {});

    const result = await runRestoreDrill(
      {
        downloadObject: async (key: string) => {
          if (key.endsWith('.manifest.json')) {
            return Buffer.from(JSON.stringify(manifest), 'utf8');
          }
          return enc;
        },
        createDatabase: async () => {},
        restoreDump: async () => {},
        validateRestore: async () => ({
          ok: true,
          details: {
            sampleCounts: { admin_users: 1, sales_orders: 0 },
            schemaVersion: 's1',
          },
        }),
        dropDatabase,
        writeTempFile: async () => {},
        removeTempFile: async () => {},
        ensureTempDir: async () => {},
      },
      baseEnv({ BACKUP_ID: id }),
      { drillDb: 'camila_restore_drill_ok', tempDir: 'backups/tmp-test' },
    );

    expect(result.cleaned).toBe(true);
    expect(dropDatabase).toHaveBeenCalledWith('camila_restore_drill_ok');
  });
});
