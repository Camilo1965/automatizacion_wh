import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migrateMediaToObjectStorage } from '../src/cli/migrate-media-to-object-storage.js';
import { LocalObjectStorage } from '../src/modules/storage/local-object-storage.js';

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x03, 0x00,
  0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

describe('migrateMediaToObjectStorage', () => {
  let mediaRoot: string;
  let destinationRoot: string;

  beforeEach(async () => {
    mediaRoot = await mkdtemp(path.join(tmpdir(), 'camila-migrate-src-'));
    destinationRoot = await mkdtemp(path.join(tmpdir(), 'camila-migrate-dst-'));
  });

  afterEach(async () => {
    await rm(mediaRoot, { recursive: true, force: true });
    await rm(destinationRoot, { recursive: true, force: true });
  });

  it('dry-run reports would_migrate and never deletes source files', async () => {
    const key = `${randomUUID()}.png`;
    const sourcePath = path.join(mediaRoot, key);
    await writeFile(sourcePath, PNG_BYTES);
    const digest = createHash('sha256').update(PNG_BYTES).digest('hex');

    const report = await migrateMediaToObjectStorage({
      mode: 'dry_run',
      mediaRoot,
      candidates: [
        {
          kind: 'photo',
          storageKey: key,
          expectedSha256: digest,
          byteSize: PNG_BYTES.byteLength,
          sourcePath,
        },
      ],
      photoStorage: new LocalObjectStorage(destinationRoot),
      guideStorage: new LocalObjectStorage(
        path.join(destinationRoot, 'guides'),
      ),
    });

    expect(report.mode).toBe('dry_run');
    expect(report.migrated).toBe(1);
    expect(report.preservedSourceFiles).toBe(true);
    expect(report.items[0]?.status).toBe('would_migrate');
    expect(await new LocalObjectStorage(destinationRoot).exists(key)).toBe(
      false,
    );
    await expect(
      import('node:fs/promises').then((fs) => fs.readFile(sourcePath)),
    ).resolves.toEqual(Buffer.from(PNG_BYTES));
  });

  it('execute copies bytes with matching hashes and keeps source', async () => {
    const key = `${randomUUID()}.png`;
    const sourcePath = path.join(mediaRoot, key);
    await writeFile(sourcePath, PNG_BYTES);
    const digest = createHash('sha256').update(PNG_BYTES).digest('hex');
    const photoStorage = new LocalObjectStorage(destinationRoot);

    const report = await migrateMediaToObjectStorage({
      mode: 'execute',
      mediaRoot,
      candidates: [
        {
          kind: 'photo',
          storageKey: key,
          expectedSha256: digest,
          byteSize: PNG_BYTES.byteLength,
          sourcePath,
        },
      ],
      photoStorage,
      guideStorage: new LocalObjectStorage(
        path.join(destinationRoot, 'guides'),
      ),
    });

    expect(report.migrated).toBe(1);
    expect(report.items[0]?.status).toBe('migrated');
    expect(Buffer.from(await photoStorage.get(key))).toEqual(
      Buffer.from(PNG_BYTES),
    );
    await expect(
      import('node:fs/promises').then((fs) => fs.readFile(sourcePath)),
    ).resolves.toEqual(Buffer.from(PNG_BYTES));
  });

  it('is idempotent when destination already matches', async () => {
    const key = `${randomUUID()}.png`;
    const sourcePath = path.join(mediaRoot, key);
    await writeFile(sourcePath, PNG_BYTES);
    const digest = createHash('sha256').update(PNG_BYTES).digest('hex');
    const photoStorage = new LocalObjectStorage(destinationRoot);
    await photoStorage.put({
      key,
      bytes: PNG_BYTES,
      contentType: 'image/png',
      sha256: digest,
    });

    const report = await migrateMediaToObjectStorage({
      mode: 'execute',
      mediaRoot,
      candidates: [
        {
          kind: 'photo',
          storageKey: key,
          expectedSha256: digest,
          byteSize: PNG_BYTES.byteLength,
          sourcePath,
        },
      ],
      photoStorage,
      guideStorage: new LocalObjectStorage(
        await mkdir(path.join(destinationRoot, 'guides'), {
          recursive: true,
        }).then(() => path.join(destinationRoot, 'guides')),
      ),
    });

    expect(report.skippedExisting).toBe(1);
    expect(report.migrated).toBe(0);
  });
});
