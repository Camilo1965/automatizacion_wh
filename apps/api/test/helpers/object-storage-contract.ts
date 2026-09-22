import { createHash, randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ObjectStorage } from '../../src/modules/storage/object-storage.js';
import { ObjectStorageError } from '../../src/modules/storage/object-storage.js';

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x03, 0x00,
  0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function runObjectStorageContract(
  label: string,
  createStorage: () => Promise<{
    storage: ObjectStorage;
    cleanup: () => Promise<void>;
  }>,
): void {
  describe(`ObjectStorage contract (${label})`, () => {
    let storage: ObjectStorage;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const created = await createStorage();
      storage = created.storage;
      cleanup = created.cleanup;
    });

    afterEach(async () => {
      await cleanup();
    });

    it('puts, exists, gets and deletes by opaque key', async () => {
      const key = `${randomUUID()}.png`;
      const digest = sha256Hex(PNG_BYTES);

      expect(await storage.exists(key)).toBe(false);
      await storage.put({
        key,
        bytes: PNG_BYTES,
        contentType: 'image/png',
        sha256: digest,
      });
      expect(await storage.exists(key)).toBe(true);
      expect(Buffer.from(await storage.get(key))).toEqual(
        Buffer.from(PNG_BYTES),
      );

      await storage.delete(key);
      expect(await storage.exists(key)).toBe(false);
    });

    it('rejects path-unsafe keys', async () => {
      const digest = sha256Hex(PNG_BYTES);
      for (const key of [
        '../secret',
        '..\\secret',
        'a/b.png',
        'a\\b.png',
        '',
        ' ',
        '/abs.png',
      ]) {
        await expect(
          storage.put({
            key,
            bytes: PNG_BYTES,
            contentType: 'image/png',
            sha256: digest,
          }),
        ).rejects.toBeInstanceOf(ObjectStorageError);
      }
    });

    it('rejects SHA-256 mismatch before marking ready', async () => {
      const key = `${randomUUID()}.png`;
      await expect(
        storage.put({
          key,
          bytes: PNG_BYTES,
          contentType: 'image/png',
          sha256: '0'.repeat(64),
        }),
      ).rejects.toBeInstanceOf(ObjectStorageError);
      expect(await storage.exists(key)).toBe(false);
    });

    it('rejects empty content type', async () => {
      const key = `${randomUUID()}.png`;
      await expect(
        storage.put({
          key,
          bytes: PNG_BYTES,
          contentType: '  ',
          sha256: sha256Hex(PNG_BYTES),
        }),
      ).rejects.toBeInstanceOf(ObjectStorageError);
      expect(await storage.exists(key)).toBe(false);
    });

    it('treats delete of missing key as idempotent', async () => {
      await expect(
        storage.delete(`${randomUUID()}.png`),
      ).resolves.toBeUndefined();
    });
  });
}
