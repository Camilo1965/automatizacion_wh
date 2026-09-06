import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { fileTypeFromBuffer } from 'file-type';

import { PhotoValidationError } from './catalog-errors.js';
import type { PhotoStorage, StoredPhoto } from './photo-storage.js';

const MAX_BYTES = 5 * 1024 * 1024;

export class LocalPhotoStorage implements PhotoStorage {
  private readonly rootDirectory: string;
  private readonly ready: Promise<void>;

  constructor(rootDirectory: string) {
    this.rootDirectory = path.resolve(rootDirectory);
    this.ready = mkdir(this.rootDirectory, { recursive: true }).then(
      () => undefined,
    );
  }

  async save(bytes: Uint8Array): Promise<StoredPhoto> {
    await this.ready;

    if (bytes.byteLength === 0) {
      throw new PhotoValidationError('empty', 'Photo file is empty');
    }

    if (bytes.byteLength > MAX_BYTES) {
      throw new PhotoValidationError(
        'too_large',
        'Photo exceeds the maximum allowed size',
      );
    }

    const detected = await fileTypeFromBuffer(bytes);
    if (
      detected === undefined ||
      (detected.mime !== 'image/jpeg' && detected.mime !== 'image/png')
    ) {
      throw new PhotoValidationError(
        'unsupported_type',
        'Only JPEG and PNG photographs are allowed',
      );
    }

    const mimeType = detected.mime;
    const extension = mimeType === 'image/jpeg' ? '.jpg' : '.png';
    const storageKey = `${randomUUID()}${extension}`;
    const destination = this.resolveKey(storageKey);
    const temporaryPath = `${destination}.tmp-${randomUUID()}`;
    const sha256 = createHash('sha256').update(bytes).digest('hex');

    try {
      await writeFile(temporaryPath, bytes);
      await rename(temporaryPath, destination);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }

    return {
      storageKey,
      mimeType,
      byteSize: bytes.byteLength,
      sha256,
    };
  }

  async read(storageKey: string): Promise<Uint8Array> {
    await this.ready;
    const absolutePath = this.resolveKey(storageKey);
    const contents = await readFile(absolutePath);
    return new Uint8Array(contents);
  }

  async delete(storageKey: string): Promise<void> {
    await this.ready;
    const absolutePath = this.resolveKey(storageKey);
    try {
      await unlink(absolutePath);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return;
      }
      throw error;
    }
  }

  private resolveKey(storageKey: string): string {
    if (
      storageKey.trim() === '' ||
      storageKey.includes('..') ||
      storageKey.includes('/') ||
      storageKey.includes('\\') ||
      path.isAbsolute(storageKey)
    ) {
      throw new PhotoValidationError(
        'invalid_key',
        'Photo storage key is invalid',
      );
    }

    if (!/^[0-9a-fA-F-]{36}\.(jpg|png)$/.test(storageKey)) {
      throw new PhotoValidationError(
        'invalid_key',
        'Photo storage key is invalid',
      );
    }

    const resolved = path.resolve(this.rootDirectory, storageKey);
    if (
      resolved !== path.join(this.rootDirectory, storageKey) &&
      !resolved.startsWith(this.rootDirectory + path.sep)
    ) {
      throw new PhotoValidationError(
        'invalid_key',
        'Photo storage key is invalid',
      );
    }

    return resolved;
  }
}
