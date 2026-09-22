/**
 * Encrypted Postgres backup / restore-drill core (injectable for unit tests).
 * Credentials never appear in child process argv when safer env/.pgpass paths exist.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const BACKUP_MAGIC = Buffer.from('KAIROBKP1');
export const DEFAULT_RETENTION_DAYS = 14;
export const DEFAULT_SAMPLE_TABLES = Object.freeze([
  'admin_users',
  'sales_orders',
  'whatsapp_conversations',
]);

export class BackupError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = 'BackupError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function decodeEncryptionKey(raw) {
  if (!raw?.trim()) {
    throw new BackupError(
      'missing_credentials',
      'BACKUP_ENCRYPTION_KEY is required',
    );
  }
  const key = Buffer.from(raw.trim(), 'base64');
  if (key.length !== 32) {
    throw new BackupError(
      'missing_credentials',
      'BACKUP_ENCRYPTION_KEY must be 32 bytes base64-encoded',
    );
  }
  return key;
}

/** AES-256-GCM: magic(8) + iv(12) + tag(16) + ciphertext */
export function encryptDump(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([BACKUP_MAGIC, iv, tag, ciphertext]);
}

export function decryptDump(payload, key) {
  const headerLen = BACKUP_MAGIC.length + 12 + 16;
  if (payload.length < headerLen) {
    throw new BackupError('checksum_mismatch', 'Encrypted payload too short');
  }
  const magic = payload.subarray(0, BACKUP_MAGIC.length);
  if (!magic.equals(BACKUP_MAGIC)) {
    throw new BackupError(
      'checksum_mismatch',
      'Encrypted payload magic mismatch',
    );
  }
  const ivStart = BACKUP_MAGIC.length;
  const tagStart = ivStart + 12;
  const dataStart = tagStart + 16;
  const iv = payload.subarray(ivStart, tagStart);
  const tag = payload.subarray(tagStart, dataStart);
  const ciphertext = payload.subarray(dataStart);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    throw new BackupError(
      'checksum_mismatch',
      'Decryption failed (key or tamper)',
      err,
    );
  }
}

export function parseDatabaseUrl(databaseUrl) {
  if (!databaseUrl?.trim()) {
    throw new BackupError('missing_credentials', 'DATABASE_URL is required');
  }
  let url;
  try {
    url = new URL(databaseUrl);
  } catch (err) {
    throw new BackupError(
      'missing_credentials',
      'DATABASE_URL is invalid',
      err,
    );
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new BackupError(
      'missing_credentials',
      'DATABASE_URL must be postgresql',
    );
  }
  const database = decodeURIComponent(
    url.pathname.replace(/^\//, '') || 'postgres',
  );
  return {
    host: url.hostname || '127.0.0.1',
    port: url.port || '5432',
    user: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    database,
    /** Safe for logs — password stripped */
    redacted: `postgresql://${url.username || ''}@${url.hostname}:${url.port || '5432'}/${database}`,
  };
}

export function requireBackupUploadEnv(env) {
  const required = [
    'BACKUP_S3_ENDPOINT',
    'BACKUP_S3_BUCKET',
    'BACKUP_S3_ACCESS_KEY_ID',
    'BACKUP_S3_SECRET_ACCESS_KEY',
  ];
  const missing = required.filter((k) => !env[k]?.trim());
  if (missing.length > 0) {
    throw new BackupError(
      'missing_credentials',
      `Missing backup credentials: ${missing.join(', ')}`,
    );
  }
  return {
    endpoint: env.BACKUP_S3_ENDPOINT.trim(),
    bucket: env.BACKUP_S3_BUCKET.trim(),
    region: (env.BACKUP_S3_REGION || 'us-east-1').trim(),
    accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID.trim(),
    secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY.trim(),
    forcePathStyle: (env.BACKUP_S3_FORCE_PATH_STYLE ?? 'true') !== 'false',
    keyPrefix: (env.BACKUP_S3_PREFIX || 'postgres').replace(/^\/+|\/+$/g, ''),
  };
}

export function buildManifest({
  id,
  timestamp,
  schemaVersion,
  sha256,
  plaintextBytes,
  encryptedBytes,
  retentionDays,
}) {
  return {
    version: 1,
    id,
    timestamp,
    schemaVersion,
    sha256,
    plaintextBytes,
    encryptedBytes,
    format: 'pg_dump_custom',
    encryption: 'aes-256-gcm',
    retentionDays,
  };
}

export function stampId(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
}

export function objectKeys(prefix, id) {
  const base = prefix ? `${prefix}/` : '';
  return {
    encKey: `${base}camila-${id}.dump.enc`,
    manifestKey: `${base}camila-${id}.manifest.json`,
  };
}

/**
 * @param {object} deps
 * @param {() => Promise<Buffer>} deps.dumpPostgres — custom-format dump bytes
 * @param {(key: string, bytes: Uint8Array, contentType: string) => Promise<void>} deps.uploadObject
 * @param {(prefix: string) => Promise<string[]>} deps.listObjectKeys
 * @param {(key: string) => Promise<void>} deps.deleteObject
 * @param {() => Promise<string>} deps.readSchemaVersion
 * @param {(metrics: object) => Promise<void>} [deps.writeMetrics]
 * @param {(event: string, payload: object) => Promise<void>} [deps.sendHeartbeat]
 * @param {() => Date} [deps.now]
 * @param {(msg: string) => void} [deps.log]
 */
export async function runEncryptedBackup(deps, env) {
  const now = deps.now?.() ?? new Date();
  const log = deps.log ?? (() => {});

  decodeEncryptionKey(env.BACKUP_ENCRYPTION_KEY);
  const upload = requireBackupUploadEnv(env);
  parseDatabaseUrl(env.DATABASE_URL);

  const retentionDays = Number(
    env.BACKUP_RETENTION_DAYS || DEFAULT_RETENTION_DAYS,
  );
  if (!Number.isFinite(retentionDays) || retentionDays < 1) {
    throw new BackupError(
      'invalid_config',
      'BACKUP_RETENTION_DAYS must be >= 1',
    );
  }

  const id = stampId(now);
  let plaintext;
  try {
    plaintext = await deps.dumpPostgres();
  } catch (err) {
    if (err instanceof BackupError) throw err;
    throw new BackupError('dump_failed', 'pg_dump failed', err);
  }
  if (!plaintext?.length) {
    throw new BackupError('dump_failed', 'pg_dump produced empty output');
  }

  const schemaVersion = await deps.readSchemaVersion();
  const digest = sha256Hex(plaintext);
  const key = decodeEncryptionKey(env.BACKUP_ENCRYPTION_KEY);
  const encrypted = encryptDump(plaintext, key);
  const manifest = buildManifest({
    id,
    timestamp: now.toISOString(),
    schemaVersion,
    sha256: digest,
    plaintextBytes: plaintext.length,
    encryptedBytes: encrypted.length,
    retentionDays,
  });

  const keys = objectKeys(upload.keyPrefix, id);
  try {
    await deps.uploadObject(keys.encKey, encrypted, 'application/octet-stream');
    await deps.uploadObject(
      keys.manifestKey,
      Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
      'application/json',
    );
  } catch (err) {
    throw new BackupError('upload_failed', 'Off-server upload failed', err);
  }

  const deleted = await applyRetention({
    listObjectKeys: deps.listObjectKeys,
    deleteObject: deps.deleteObject,
    prefix: upload.keyPrefix,
    retentionDays,
    now,
  });

  const metrics = {
    lastSuccessfulBackupAt: manifest.timestamp,
    lastBackupId: id,
    lastBackupSizeBytes: encrypted.length,
    lastBackupPlaintextBytes: plaintext.length,
    lastBackupSha256: digest,
    schemaVersion,
    retentionDays,
    objectsDeletedByRetention: deleted,
    lastBackupAgeSeconds: 0,
  };
  await deps.writeMetrics?.(metrics);
  await deps.sendHeartbeat?.('backup_success', metrics);

  log(`Backup ${id} uploaded (${encrypted.length} encrypted bytes)`);
  return { id, manifest, keys, metrics };
}

export async function applyRetention({
  listObjectKeys,
  deleteObject,
  prefix,
  retentionDays,
  now = new Date(),
}) {
  const keys = await listObjectKeys(prefix ? `${prefix}/` : '');
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  const stampRe = /camila-(\d{8}T\d{6}Z)\.(?:dump\.enc|manifest\.json)$/;
  let deleted = 0;
  for (const key of keys) {
    const match = stampRe.exec(key);
    if (!match) continue;
    const stamp = match[1];
    const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`;
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts) || ts >= cutoff) continue;
    await deleteObject(key);
    deleted += 1;
  }
  return deleted;
}

/**
 * @param {object} deps
 * @param {(key: string) => Promise<Buffer>} deps.downloadObject
 * @param {(dbName: string) => Promise<void>} deps.createDatabase
 * @param {(dbName: string, dumpPath: string) => Promise<void>} deps.restoreDump
 * @param {(dbName: string) => Promise<{ ok: boolean, details: object }>} deps.validateRestore
 * @param {(dbName: string) => Promise<void>} deps.dropDatabase
 * @param {(metrics: object) => Promise<void>} [deps.writeMetrics]
 * @param {(event: string, payload: object) => Promise<void>} [deps.sendHeartbeat]
 * @param {(dir: string) => Promise<void>} [deps.ensureTempDir]
 * @param {(file: string, bytes: Buffer) => Promise<void>} [deps.writeTempFile]
 * @param {(file: string) => Promise<void>} [deps.removeTempFile]
 */
export async function runRestoreDrill(deps, env, options = {}) {
  const log = deps.log ?? (() => {});
  const key = decodeEncryptionKey(env.BACKUP_ENCRYPTION_KEY);
  const upload = requireBackupUploadEnv(env);
  parseDatabaseUrl(env.DATABASE_URL);

  const backupId = options.backupId || env.BACKUP_ID;
  if (!backupId?.trim()) {
    throw new BackupError(
      'missing_credentials',
      'BACKUP_ID is required for restore drill',
    );
  }

  const keys = objectKeys(upload.keyPrefix, backupId.trim());
  const encBytes = await deps.downloadObject(keys.encKey);
  const manifestRaw = await deps.downloadObject(keys.manifestKey);
  let manifest;
  try {
    manifest = JSON.parse(manifestRaw.toString('utf8'));
  } catch (err) {
    throw new BackupError('checksum_mismatch', 'Manifest JSON invalid', err);
  }

  let plaintext;
  try {
    plaintext = decryptDump(encBytes, key);
  } catch (err) {
    if (err instanceof BackupError) throw err;
    throw new BackupError('checksum_mismatch', 'Decrypt failed', err);
  }

  const actual = sha256Hex(plaintext);
  if (actual !== manifest.sha256) {
    throw new BackupError(
      'checksum_mismatch',
      `Checksum mismatch: expected ${manifest.sha256}, got ${actual}`,
    );
  }

  const drillDb =
    options.drillDb ||
    env.DRILL_DB ||
    `camila_restore_drill_${backupId.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40)}`;

  const tempDir = options.tempDir || path.join('backups', 'tmp');
  await deps.ensureTempDir?.(tempDir);
  const dumpPath = path.join(tempDir, `${drillDb}.dump`);
  await deps.writeTempFile?.(dumpPath, plaintext);

  let validation;
  let cleaned = false;
  try {
    await deps.createDatabase(drillDb);
    await deps.restoreDump(drillDb, dumpPath);
    validation = await deps.validateRestore(drillDb);
    if (!validation?.ok) {
      throw new BackupError(
        'restore_validation_failed',
        `Restore validation failed: ${JSON.stringify(validation?.details ?? {})}`,
      );
    }

    // Destructive cleanup ONLY after successful validation.
    await deps.dropDatabase(drillDb);
    cleaned = true;

    const metrics = {
      lastRestoreDrillAt: (deps.now?.() ?? new Date()).toISOString(),
      lastRestoreDrillOk: true,
      lastRestoreDrillBackupId: backupId,
      lastRestoreDrillDb: drillDb,
      cleaned: true,
      sampleCounts: validation.details?.sampleCounts ?? {},
      schemaVersion:
        validation.details?.schemaVersion ?? manifest.schemaVersion,
    };
    await deps.writeMetrics?.(metrics);
    await deps.sendHeartbeat?.('restore_drill_success', metrics);
    log(`Restore drill ${backupId} OK; cleaned ${drillDb}`);
    return { backupId, drillDb, cleaned, validation, manifest };
  } catch (err) {
    const metrics = {
      lastRestoreDrillAt: (deps.now?.() ?? new Date()).toISOString(),
      lastRestoreDrillOk: false,
      lastRestoreDrillBackupId: backupId,
      lastRestoreDrillDb: drillDb,
      cleaned: false,
      errorCode: err instanceof BackupError ? err.code : 'restore_failed',
    };
    await deps.writeMetrics?.(metrics);
    await deps.sendHeartbeat?.('restore_drill_failure', metrics);
    // Intentionally do NOT drop the drill DB on validation/restore failure.
    if (err instanceof BackupError) throw err;
    throw new BackupError('restore_failed', 'Restore drill failed', err);
  } finally {
    await deps.removeTempFile?.(dumpPath);
    void cleaned;
  }
}

export async function verifyBackupArtifact({
  encryptedBytes,
  manifest,
  encryptionKey,
}) {
  const key = decodeEncryptionKey(encryptionKey);
  if (!manifest?.sha256) {
    throw new BackupError('checksum_mismatch', 'Manifest missing sha256');
  }
  const plaintext = decryptDump(encryptedBytes, key);
  const actual = sha256Hex(plaintext);
  if (actual !== manifest.sha256) {
    throw new BackupError(
      'checksum_mismatch',
      `Checksum mismatch: expected ${manifest.sha256}, got ${actual}`,
    );
  }
  return {
    ok: true,
    sha256: actual,
    plaintextBytes: plaintext.length,
    schemaVersion: manifest.schemaVersion,
    timestamp: manifest.timestamp,
  };
}

export function ageSeconds(iso, now = new Date()) {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.floor((now.getTime() - ts) / 1000));
}

export async function readMetricsFile(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function writeMetricsFile(filePath, patch, now = new Date()) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const prev = await readMetricsFile(filePath);
  const next = {
    ...prev,
    ...patch,
    updatedAt: now.toISOString(),
  };
  if (next.lastSuccessfulBackupAt) {
    next.lastBackupAgeSeconds = ageSeconds(next.lastSuccessfulBackupAt, now);
  }
  await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

export async function postHeartbeat(
  url,
  event,
  payload,
  fetchImpl = globalThis.fetch,
) {
  if (!url?.trim()) return { skipped: true };
  const res = await fetchImpl(url.trim(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      event,
      source: 'kairo-backup',
      ...payload,
    }),
  });
  if (!res.ok) {
    throw new BackupError('heartbeat_failed', `Heartbeat HTTP ${res.status}`);
  }
  return { ok: true, status: res.status };
}

export { mkdir, readFile, writeFile, rm, path };
