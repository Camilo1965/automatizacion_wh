import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

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
  private readonly root: string;
  private readonly ready: Promise<void>;

  constructor(rootDirectory: string) {
    this.root = path.resolve(rootDirectory);
    this.ready = mkdir(this.root, { recursive: true }).then(() => undefined);
  }

  async save(bytes: Uint8Array): Promise<StoredGuidePdf> {
    await this.ready;
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
    const destination = this.resolveKey(storageKey);
    const temporary = `${destination}.tmp-${randomUUID()}`;
    try {
      await writeFile(temporary, bytes);
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
    return {
      storageKey,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      byteSize: bytes.byteLength,
    };
  }

  async read(storageKey: string): Promise<Uint8Array> {
    await this.ready;
    return new Uint8Array(await readFile(this.resolveKey(storageKey)));
  }

  async delete(storageKey: string): Promise<void> {
    await this.ready;
    await unlink(this.resolveKey(storageKey)).catch((error: unknown) => {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ))
        throw error;
    });
  }

  private resolveKey(storageKey: string): string {
    if (!/^[0-9a-f-]{36}\.pdf$/.test(storageKey)) {
      throw new GuidePdfStorageError(
        'invalid_pdf_key',
        'Guide PDF storage key is invalid',
      );
    }
    const resolved = path.resolve(this.root, storageKey);
    if (path.dirname(resolved) !== this.root) {
      throw new GuidePdfStorageError(
        'invalid_pdf_key',
        'Guide PDF storage key is invalid',
      );
    }
    return resolved;
  }
}
