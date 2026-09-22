import { createHash } from 'node:crypto';
import { Agent as HttpsAgent } from 'node:https';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';

import {
  assertObjectStorageKey,
  assertSha256Hex,
  ObjectStorageError,
  type ObjectStorage,
} from './object-storage.js';

export type S3ObjectStorageOptions = Readonly<{
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  tlsRejectUnauthorized: boolean;
  /** Optional logical prefix inside the bucket (no leading slash). */
  keyPrefix?: string;
  client?: S3Client;
}>;

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256Base64(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('base64');
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly keyPrefix: string;

  constructor(options: S3ObjectStorageOptions) {
    this.bucket = options.bucket;
    this.keyPrefix = normalizePrefix(options.keyPrefix);
    this.client =
      options.client ??
      new S3Client({
        endpoint: options.endpoint,
        region: options.region,
        forcePathStyle: options.forcePathStyle,
        credentials: {
          accessKeyId: options.accessKeyId,
          secretAccessKey: options.secretAccessKey,
        },
        ...(options.tlsRejectUnauthorized
          ? {}
          : {
              requestHandler: new NodeHttpHandler({
                httpsAgent: new HttpsAgent({ rejectUnauthorized: false }),
              }),
            }),
      });
  }

  async put(input: {
    key: string;
    bytes: Uint8Array;
    contentType: string;
    sha256: string;
  }): Promise<void> {
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

    const objectKey = this.toObjectKey(input.key);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
          Body: Buffer.from(input.bytes),
          ContentType: input.contentType.trim(),
          ContentLength: input.bytes.byteLength,
          ChecksumSHA256: sha256Base64(input.bytes),
          Metadata: {
            sha256: input.sha256,
          },
        }),
      );
    } catch (error) {
      throw wrapBackend(error);
    }

    // Confirm size + digest before treating the object as ready.
    const stored = await this.get(input.key);
    if (
      stored.byteLength !== input.bytes.byteLength ||
      sha256Hex(stored) !== input.sha256
    ) {
      await this.delete(input.key).catch(() => undefined);
      throw new ObjectStorageError(
        'checksum_mismatch',
        'Object SHA-256 failed after upload',
      );
    }
  }

  async get(key: string): Promise<Uint8Array> {
    assertObjectStorageKey(key);
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: this.toObjectKey(key),
        }),
      );
      const body = response.Body;
      if (body === undefined) {
        throw new ObjectStorageError('not_found', 'Object not found');
      }
      const bytes = new Uint8Array(await body.transformToByteArray());
      return bytes;
    } catch (error) {
      if (isNotFound(error)) {
        throw new ObjectStorageError('not_found', 'Object not found');
      }
      if (error instanceof ObjectStorageError) {
        throw error;
      }
      throw wrapBackend(error);
    }
  }

  async exists(key: string): Promise<boolean> {
    assertObjectStorageKey(key);
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: this.toObjectKey(key),
        }),
      );
      return true;
    } catch (error) {
      if (isNotFound(error)) {
        return false;
      }
      throw wrapBackend(error);
    }
  }

  async delete(key: string): Promise<void> {
    assertObjectStorageKey(key);
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: this.toObjectKey(key),
        }),
      );
    } catch (error) {
      if (isNotFound(error)) {
        return;
      }
      throw wrapBackend(error);
    }
  }

  private toObjectKey(key: string): string {
    return this.keyPrefix === '' ? key : `${this.keyPrefix}${key}`;
  }
}

function normalizePrefix(prefix: string | undefined): string {
  if (prefix === undefined || prefix.trim() === '') {
    return '';
  }
  const trimmed = prefix.replace(/^\/+/, '').replace(/\/+$/, '');
  return trimmed === '' ? '' : `${trimmed}/`;
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const name = 'name' in error ? String(error.name) : '';
  const code =
    '$metadata' in error &&
    typeof error.$metadata === 'object' &&
    error.$metadata !== null &&
    'httpStatusCode' in error.$metadata
      ? Number(error.$metadata.httpStatusCode)
      : undefined;
  return (
    name === 'NotFound' ||
    name === 'NoSuchKey' ||
    name === 'NotFoundError' ||
    code === 404
  );
}

function wrapBackend(error: unknown): ObjectStorageError {
  if (error instanceof ObjectStorageError) {
    return error;
  }
  const message =
    error instanceof Error ? error.message : 'Object storage backend failure';
  return new ObjectStorageError('backend', message);
}
