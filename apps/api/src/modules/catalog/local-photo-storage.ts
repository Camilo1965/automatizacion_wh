import { createHash, randomUUID } from 'node:crypto';

import { fileTypeFromBuffer } from 'file-type';

import { PhotoValidationError } from './catalog-errors.js';
import type { PhotoStorage, StoredPhoto } from './photo-storage.js';
import { LocalObjectStorage } from '../storage/local-object-storage.js';
import {
  ObjectStorageError,
  type ObjectStorage,
} from '../storage/object-storage.js';

const MAX_BYTES = 5 * 1024 * 1024;

export class LocalPhotoStorage implements PhotoStorage {
  private readonly objects: ObjectStorage;

  constructor(rootDirectoryOrStorage: string | ObjectStorage) {
    this.objects =
      typeof rootDirectoryOrStorage === 'string'
        ? new LocalObjectStorage(rootDirectoryOrStorage)
        : rootDirectoryOrStorage;
  }

  async save(bytes: Uint8Array): Promise<StoredPhoto> {
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
    const sha256 = createHash('sha256').update(bytes).digest('hex');

    try {
      await this.objects.put({
        key: storageKey,
        bytes,
        contentType: mimeType,
        sha256,
      });
    } catch (error) {
      throw mapObjectError(error);
    }

    return {
      storageKey,
      mimeType,
      byteSize: bytes.byteLength,
      sha256,
    };
  }

  async read(storageKey: string): Promise<Uint8Array> {
    assertPhotoKey(storageKey);
    try {
      return await this.objects.get(storageKey);
    } catch (error) {
      throw mapObjectError(error);
    }
  }

  async delete(storageKey: string): Promise<void> {
    assertPhotoKey(storageKey);
    try {
      await this.objects.delete(storageKey);
    } catch (error) {
      throw mapObjectError(error);
    }
  }
}

function assertPhotoKey(storageKey: string): void {
  if (
    storageKey.trim() === '' ||
    storageKey.includes('..') ||
    storageKey.includes('/') ||
    storageKey.includes('\\') ||
    !/^[0-9a-fA-F-]{36}\.(jpg|png)$/.test(storageKey)
  ) {
    throw new PhotoValidationError(
      'invalid_key',
      'Photo storage key is invalid',
    );
  }
}

function mapObjectError(error: unknown): unknown {
  if (error instanceof ObjectStorageError && error.code === 'invalid_key') {
    return new PhotoValidationError(
      'invalid_key',
      'Photo storage key is invalid',
    );
  }
  return error;
}
