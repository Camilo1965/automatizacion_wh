import path from 'node:path';

import type { AppConfig } from '../../config.js';
import { LocalObjectStorage } from './local-object-storage.js';
import type { ObjectStorage } from './object-storage.js';
import { S3ObjectStorage } from './s3-object-storage.js';

export type ObjectStorageNamespace = 'photos' | 'guides';

export function createObjectStorage(
  config: AppConfig,
  namespace: ObjectStorageNamespace = 'photos',
): ObjectStorage {
  if (config.storageDriver === 'local') {
    const root =
      namespace === 'guides'
        ? path.join(config.mediaRoot, 'guides')
        : config.mediaRoot;
    return new LocalObjectStorage(root);
  }

  const s3 = config.s3;
  if (s3 === undefined) {
    throw new Error('S3 storage settings are required when STORAGE_DRIVER=s3');
  }

  return new S3ObjectStorage({
    endpoint: s3.endpoint,
    bucket: s3.bucket,
    region: s3.region,
    accessKeyId: s3.accessKeyId,
    secretAccessKey: s3.secretAccessKey,
    forcePathStyle: s3.forcePathStyle,
    tlsRejectUnauthorized: s3.tlsRejectUnauthorized,
    ...(namespace === 'guides' ? { keyPrefix: 'guides/' } : {}),
  });
}
