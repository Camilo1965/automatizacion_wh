import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import * as fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PhotoValidationError } from '../src/modules/catalog/catalog-errors.js';
import { LocalPhotoStorage } from '../src/modules/catalog/local-photo-storage.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    mkdir: vi.fn(actual.mkdir),
    rename: vi.fn(actual.rename),
  };
});

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x03, 0x00,
  0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

const JPEG_BYTES = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08,
  0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a,
  0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d,
  0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20, 0x22,
  0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34,
  0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0,
  0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4,
  0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xff, 0xc4, 0x00, 0x14, 0x10, 0x01,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  0x7f, 0xff, 0xd9,
]);

describe('LocalPhotoStorage', () => {
  let rootDirectory: string;
  let storage: LocalPhotoStorage;

  beforeEach(async () => {
    rootDirectory = await mkdtemp(path.join(tmpdir(), 'camila-photo-'));
    storage = new LocalPhotoStorage(rootDirectory);
    vi.mocked(fsp.rename).mockImplementation(async (oldPath, newPath) =>
      (
        await vi.importActual<typeof import('node:fs/promises')>(
          'node:fs/promises',
        )
      ).rename(oldPath, newPath),
    );
  });

  afterEach(async () => {
    await rm(rootDirectory, { recursive: true, force: true });
  });

  it('does not start filesystem initialization for an unused storage instance', () => {
    vi.mocked(fsp.mkdir).mockClear();

    new LocalPhotoStorage(path.join(rootDirectory, 'unused'));

    expect(fsp.mkdir).not.toHaveBeenCalled();
  });

  it('saves and reads a valid PNG', async () => {
    const stored = await storage.save(PNG_BYTES);
    expect(stored.mimeType).toBe('image/png');
    expect(stored.storageKey.endsWith('.png')).toBe(true);
    expect(path.isAbsolute(stored.storageKey)).toBe(false);

    const read = await storage.read(stored.storageKey);
    expect(Buffer.from(read)).toEqual(Buffer.from(PNG_BYTES));
  });

  it('saves a valid JPEG and hashes original bytes', async () => {
    const stored = await storage.save(JPEG_BYTES);
    expect(stored.mimeType).toBe('image/jpeg');
    expect(stored.sha256).toBe(
      createHash('sha256').update(JPEG_BYTES).digest('hex'),
    );
  });

  it('uses different keys for identical uploads', async () => {
    const first = await storage.save(PNG_BYTES);
    const second = await storage.save(PNG_BYTES);
    expect(first.storageKey).not.toBe(second.storageKey);
  });

  it('rejects text disguised as jpg', async () => {
    await expect(
      storage.save(Uint8Array.from(Buffer.from('not-an-image'))),
    ).rejects.toBeInstanceOf(PhotoValidationError);
  });

  it('rejects GIF signatures', async () => {
    const gif = Uint8Array.from(Buffer.from('GIF89a'));
    await expect(storage.save(gif)).rejects.toBeInstanceOf(
      PhotoValidationError,
    );
  });

  it('rejects WebP signatures', async () => {
    const webp = Uint8Array.from(
      Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
        0x56, 0x50, 0x38, 0x20, 0x0e, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
        0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]),
    );
    await expect(storage.save(webp)).rejects.toBeInstanceOf(
      PhotoValidationError,
    );
  });

  it('rejects empty files', async () => {
    await expect(storage.save(new Uint8Array())).rejects.toBeInstanceOf(
      PhotoValidationError,
    );
  });

  it('rejects files larger than 5 MiB', async () => {
    const oversized = new Uint8Array(5 * 1024 * 1024 + 1);
    oversized.set(JPEG_BYTES, 0);
    await expect(storage.save(oversized)).rejects.toBeInstanceOf(
      PhotoValidationError,
    );
  });

  it('rejects path traversal on read and delete', async () => {
    await expect(storage.read('../secret.png')).rejects.toBeInstanceOf(
      PhotoValidationError,
    );
    await expect(storage.delete('..\\secret.png')).rejects.toBeInstanceOf(
      PhotoValidationError,
    );
  });

  it('treats delete of a missing key as idempotent', async () => {
    await expect(
      storage.delete('00000000-0000-4000-8000-000000000000.png'),
    ).resolves.toBeUndefined();
  });

  it('does not leave temporary files after a controlled write failure', async () => {
    vi.mocked(fsp.rename).mockRejectedValueOnce(
      new Error('forced-rename-failure'),
    );

    await expect(storage.save(PNG_BYTES)).rejects.toThrow(
      'forced-rename-failure',
    );

    const remaining = await readdir(rootDirectory);
    expect(remaining.every((name) => !name.includes('.tmp'))).toBe(true);
  });
});
