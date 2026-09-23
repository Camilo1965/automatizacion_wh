import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  assertObjectStorageKey,
  assertSha256Hex,
  ObjectStorageError,
  type ObjectStorage,
} from './object-storage.js';

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export class LocalObjectStorage implements ObjectStorage {
  private readonly rootDirectory: string;
  private ready: Promise<void> | undefined;

  constructor(rootDirectory: string) {
    this.rootDirectory = path.resolve(rootDirectory);
  }

  private ensureReady(): Promise<void> {
    return (this.ready ??= mkdir(this.rootDirectory, { recursive: true }).then(
      () => undefined,
    ));
  }

  async put(input: {
    key: string;
    bytes: Uint8Array;
    contentType: string;
    sha256: string;
  }): Promise<void> {
    await this.ensureReady();
    assertObjectStorageKey(input.key);
    assertSha256Hex(input.sha256);
    if (input.contentType.trim() === '') {
      throw new ObjectStorageError(
        'invalid_content_type',
        'Object content type is required',
      );
    }
    if (input.bytes.byteLength === 0) {
      throw new ObjectStorageError('empty_object', 'Object bytes are empty');
    }
    const digest = sha256Hex(input.bytes);
    if (digest !== input.sha256) {
      throw new ObjectStorageError(
        'checksum_mismatch',
        'Object SHA-256 does not match bytes',
      );
    }

    const destination = this.resolveKey(input.key);
    const temporaryPath = `${destination}.tmp-${randomUUID()}`;
    const sidecarPath = `${destination}.meta.json`;
    const temporaryMeta = `${sidecarPath}.tmp-${randomUUID()}`;
    try {
      await writeFile(temporaryPath, input.bytes);
      const verified = sha256Hex(await readFile(temporaryPath));
      if (verified !== input.sha256) {
        throw new ObjectStorageError(
          'checksum_mismatch',
          'Object SHA-256 failed after write',
        );
      }
      await writeFile(
        temporaryMeta,
        JSON.stringify({
          contentType: input.contentType.trim(),
          sha256: input.sha256,
          byteSize: input.bytes.byteLength,
        }),
      );
      await rename(temporaryPath, destination);
      await rename(temporaryMeta, sidecarPath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      await unlink(temporaryMeta).catch(() => undefined);
      throw error;
    }
  }

  async get(key: string): Promise<Uint8Array> {
    await this.ensureReady();
    try {
      return new Uint8Array(await readFile(this.resolveKey(key)));
    } catch (error) {
      if (isNotFound(error)) {
        throw new ObjectStorageError('not_found', 'Object not found');
      }
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    await this.ensureReady();
    try {
      await readFile(this.resolveKey(key));
      return true;
    } catch (error) {
      if (isNotFound(error)) {
        return false;
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.ensureReady();
    const absolutePath = this.resolveKey(key);
    try {
      await unlink(absolutePath);
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }
    await unlink(`${absolutePath}.meta.json`).catch(() => undefined);
  }

  private resolveKey(key: string): string {
    assertObjectStorageKey(key);
    const resolved = path.resolve(this.rootDirectory, key);
    if (
      resolved !== path.join(this.rootDirectory, key) &&
      !resolved.startsWith(this.rootDirectory + path.sep)
    ) {
      throw new ObjectStorageError(
        'invalid_key',
        'Object storage key is invalid',
      );
    }
    return resolved;
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}
