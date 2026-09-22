import { createHash, randomUUID } from 'node:crypto';

import { LocalObjectStorage } from '../storage/local-object-storage.js';
import {
  ObjectStorageError,
  type ObjectStorage,
} from '../storage/object-storage.js';

const MAX_PDF_BYTES = 10 * 1024 * 1024;

export class GuidePdfStorageError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'GuidePdfStorageError';
  }
}

export type StoredGuidePdf = Readonly<{
  storageKey: string;
  sha256: string;
  byteSize: number;
}>;

export class LocalGuidePdfStorage {
  private readonly objects: ObjectStorage;

  constructor(rootDirectoryOrStorage: string | ObjectStorage) {
    this.objects =
      typeof rootDirectoryOrStorage === 'string'
        ? new LocalObjectStorage(rootDirectoryOrStorage)
        : rootDirectoryOrStorage;
  }

  async save(bytes: Uint8Array): Promise<StoredGuidePdf> {
    if (
      bytes.byteLength < 5 ||
      bytes.byteLength > MAX_PDF_BYTES ||
      new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-'
    ) {
      throw new GuidePdfStorageError(
        'invalid_pdf',
        'Provider response is not a valid PDF',
      );
    }
    const storageKey = `${randomUUID()}.pdf`;
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    try {
      await this.objects.put({
        key: storageKey,
        bytes,
        contentType: 'application/pdf',
        sha256,
      });
    } catch (error) {
      throw mapObjectError(error);
    }
    return {
      storageKey,
      sha256,
      byteSize: bytes.byteLength,
    };
  }

  async read(storageKey: string): Promise<Uint8Array> {
    assertGuideKey(storageKey);
    try {
      return await this.objects.get(storageKey);
    } catch (error) {
      throw mapObjectError(error);
    }
  }

  async delete(storageKey: string): Promise<void> {
    assertGuideKey(storageKey);
    try {
      await this.objects.delete(storageKey);
    } catch (error) {
      throw mapObjectError(error);
    }
  }
}

function assertGuideKey(storageKey: string): void {
  if (!/^[0-9a-f-]{36}\.pdf$/.test(storageKey)) {
    throw new GuidePdfStorageError(
      'invalid_pdf_key',
      'Guide PDF storage key is invalid',
    );
  }
}

function mapObjectError(error: unknown): unknown {
  if (error instanceof ObjectStorageError && error.code === 'invalid_key') {
    return new GuidePdfStorageError(
      'invalid_pdf_key',
      'Guide PDF storage key is invalid',
    );
  }
  return error;
}
