import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { LocalObjectStorage } from '../src/modules/storage/local-object-storage.js';
import { runObjectStorageContract } from './helpers/object-storage-contract.js';

runObjectStorageContract('local', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'camila-object-'));
  return {
    storage: new LocalObjectStorage(root),
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
});
