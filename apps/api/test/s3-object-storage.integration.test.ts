import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { describe } from 'vitest';

import { S3ObjectStorage } from '../src/modules/storage/s3-object-storage.js';
import { runObjectStorageContract } from './helpers/object-storage-contract.js';

const endpoint = process.env.S3_TEST_ENDPOINT ?? 'http://127.0.0.1:9000';
const bucket = process.env.S3_TEST_BUCKET ?? 'kairo-media-test';
const accessKeyId = process.env.S3_TEST_ACCESS_KEY_ID ?? 'kairo_test';
const secretAccessKey =
  process.env.S3_TEST_SECRET_ACCESS_KEY ?? 'kairo_test_secret';
const region = process.env.S3_TEST_REGION ?? 'us-east-1';

async function probeMinio(): Promise<S3Client | null> {
  const client = new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  try {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
    }
    return client;
  } catch (error) {
    console.warn(
      `Skipping MinIO S3 contract tests: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

const client = await probeMinio();

describe.skipIf(client === null)('S3ObjectStorage integration (MinIO)', () => {
  if (client === null) {
    return;
  }
  runObjectStorageContract('s3-minio', async () => ({
    storage: new S3ObjectStorage({
      endpoint,
      bucket,
      region,
      accessKeyId,
      secretAccessKey,
      forcePathStyle: true,
      tlsRejectUnauthorized: true,
      client,
    }),
    cleanup: async () => undefined,
  }));
});
