export interface ObjectStorage {
  put(input: {
    key: string;
    bytes: Uint8Array;
    contentType: string;
    sha256: string;
  }): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

export class ObjectStorageError extends Error {
  constructor(
    readonly code:
      | 'invalid_key'
      | 'checksum_mismatch'
      | 'invalid_content_type'
      | 'not_found'
      | 'empty_object'
      | 'backend',
    message: string,
  ) {
    super(message);
    this.name = 'ObjectStorageError';
  }
}

/** Opaque path-safe object keys only — never path segments or traversal. */
const OPAQUE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

export function assertObjectStorageKey(key: string): void {
  if (
    key.trim() === '' ||
    key !== key.trim() ||
    key.includes('..') ||
    key.includes('/') ||
    key.includes('\\') ||
    !OPAQUE_KEY.test(key)
  ) {
    throw new ObjectStorageError(
      'invalid_key',
      'Object storage key is invalid',
    );
  }
}

export function assertSha256Hex(value: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new ObjectStorageError(
      'checksum_mismatch',
      'Object SHA-256 digest is invalid',
    );
  }
}
