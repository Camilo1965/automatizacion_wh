#!/usr/bin/env node
/**
 * Verify an encrypted backup artifact (local files or S3 object pair).
 *
 * Local:
 *   VERIFY_ENC_PATH=... VERIFY_MANIFEST_PATH=... BACKUP_ENCRYPTION_KEY=...
 * Remote:
 *   BACKUP_ID=... BACKUP_ENCRYPTION_KEY=... BACKUP_S3_*
 */
import console from 'node:console';
import { readFile } from 'node:fs/promises';
import process from 'node:process';

import {
  BackupError,
  objectKeys,
  requireBackupUploadEnv,
  verifyBackupArtifact,
} from './lib/backup-core.mjs';
import { createBackupS3Client } from './lib/backup-s3.mjs';

async function main() {
  const env = process.env;
  try {
    let encryptedBytes;
    let manifest;

    if (env.VERIFY_ENC_PATH && env.VERIFY_MANIFEST_PATH) {
      encryptedBytes = await readFile(env.VERIFY_ENC_PATH);
      manifest = JSON.parse(await readFile(env.VERIFY_MANIFEST_PATH, 'utf8'));
    } else {
      const backupId = env.BACKUP_ID;
      if (!backupId?.trim()) {
        throw new BackupError(
          'missing_credentials',
          'BACKUP_ID or VERIFY_ENC_PATH+VERIFY_MANIFEST_PATH required',
        );
      }
      const s3cfg = requireBackupUploadEnv(env);
      const s3 = createBackupS3Client(s3cfg);
      const keys = objectKeys(s3cfg.keyPrefix, backupId.trim());
      encryptedBytes = await s3.getObject(keys.encKey);
      manifest = JSON.parse(
        (await s3.getObject(keys.manifestKey)).toString('utf8'),
      );
    }

    const result = await verifyBackupArtifact({
      encryptedBytes,
      manifest,
      encryptionKey: env.BACKUP_ENCRYPTION_KEY,
    });
    console.log(JSON.stringify({ ok: true, ...result }));
    process.exit(0);
  } catch (err) {
    console.error(err instanceof BackupError ? err.message : err);
    process.exit(
      err instanceof BackupError && err.code === 'checksum_mismatch' ? 5 : 1,
    );
  }
}

main();
