import { describe, expect, it } from 'vitest';

import { runStorageSmoke } from '../src/cli/storage-smoke.js';
import type { ObjectStorage } from '../src/modules/storage/object-storage.js';

class MemoryStorage implements ObjectStorage {
  readonly objects = new Map<string, Uint8Array>();
  readonly operations: string[] = [];

  async put(input: {
    key: string;
    bytes: Uint8Array;
    contentType: string;
    sha256: string;
  }): Promise<void> {
    this.operations.push(`put:${input.key}:${input.contentType}`);
    this.objects.set(input.key, input.bytes.slice());
  }

  async get(key: string): Promise<Uint8Array> {
    this.operations.push(`get:${key}`);
    const value = this.objects.get(key);
    if (value === undefined) throw new Error('not found');
    return value.slice();
  }

  async exists(key: string): Promise<boolean> {
    this.operations.push(`exists:${key}`);
    return this.objects.has(key);
  }

  async delete(key: string): Promise<void> {
    this.operations.push(`delete:${key}`);
    this.objects.delete(key);
  }
}

describe('storage smoke orchestration', () => {
  it('proves put, exists, byte-identical get, delete and absence', async () => {
    const storage = new MemoryStorage();
    const bytes = Uint8Array.from([11, 22, 33, 44]);

    await runStorageSmoke(storage, { key: 'smoke-fixed-key', bytes });

    expect(storage.objects.size).toBe(0);
    expect(storage.operations).toEqual([
      'put:smoke-fixed-key:application/octet-stream',
      'exists:smoke-fixed-key',
      'get:smoke-fixed-key',
      'delete:smoke-fixed-key',
      'exists:smoke-fixed-key',
    ]);
  });

  it('fails on a byte mismatch and still removes the smoke object', async () => {
    const storage = new MemoryStorage();
    const originalGet = storage.get.bind(storage);
    storage.get = async (key) => {
      await originalGet(key);
      return Uint8Array.from([255]);
    };

    await expect(
      runStorageSmoke(storage, {
        key: 'smoke-corrupt-key',
        bytes: Uint8Array.from([1, 2, 3]),
      }),
    ).rejects.toThrow(/byte mismatch/i);
    expect(storage.objects.size).toBe(0);
    expect(storage.operations).toContain('delete:smoke-corrupt-key');
  });
});
