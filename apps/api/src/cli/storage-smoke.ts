#!/usr/bin/env node
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { loadConfig } from '../config.js';
import { createObjectStorage } from '../modules/storage/create-object-storage.js';
import type { ObjectStorage } from '../modules/storage/object-storage.js';

export async function runStorageSmoke(
  storage: ObjectStorage,
  input: { key: string; bytes: Uint8Array } = {
    key: `storage-smoke-${randomUUID()}`,
    bytes: randomBytes(64),
  },
): Promise<void> {
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  let uploaded = false;
  try {
    await storage.put({
      key: input.key,
      bytes: input.bytes,
      contentType: 'application/octet-stream',
      sha256,
    });
    uploaded = true;
    if (!(await storage.exists(input.key))) {
      throw new Error('Storage smoke object is missing after put');
    }
    const stored = await storage.get(input.key);
    if (!Buffer.from(stored).equals(Buffer.from(input.bytes))) {
      throw new Error('Storage smoke byte mismatch after get');
    }
    await storage.delete(input.key);
    if (await storage.exists(input.key)) {
      throw new Error('Storage smoke object still exists after delete');
    }
    uploaded = false;
  } finally {
    if (uploaded) {
      await storage.delete(input.key).catch(() => undefined);
    }
  }
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const storage = createObjectStorage(config, 'photos');
  await runStorageSmoke(storage);
  console.log(
    JSON.stringify({ ok: true, storageDriver: config.storageDriver }),
  );
}

const entrypoint = process.argv[1];
if (
  entrypoint !== undefined &&
  path.resolve(entrypoint) === fileURLToPath(import.meta.url)
) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
