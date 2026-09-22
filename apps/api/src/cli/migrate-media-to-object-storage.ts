import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import { isNotNull } from 'drizzle-orm';

import { loadConfig } from '../config.js';
import { createPostgresDatabase } from '../database/client.js';
import { catalogReferences } from '../database/schema/catalog.js';
import { shippingGuideJobs } from '../database/schema/shipping.js';
import { createObjectStorage } from '../modules/storage/create-object-storage.js';
import type { ObjectStorage } from '../modules/storage/object-storage.js';
import { requireDatabaseUrl } from './cli-args.js';

export type MigrationMode = 'dry_run' | 'execute';

export type MediaMigrationItem = Readonly<{
  kind: 'photo' | 'guide_pdf';
  storageKey: string;
  expectedSha256: string | null;
  byteSize: number | null;
  sourcePath: string;
}>;

export type MediaMigrationReport = Readonly<{
  mode: MigrationMode;
  scanned: number;
  migrated: number;
  skippedExisting: number;
  mismatched: number;
  missingSource: number;
  preservedSourceFiles: true;
  items: readonly Readonly<{
    kind: 'photo' | 'guide_pdf';
    storageKey: string;
    status:
      | 'would_migrate'
      | 'migrated'
      | 'skipped_existing'
      | 'mismatch'
      | 'missing_source';
    sourceSha256?: string;
    destinationSha256?: string;
  }>[];
}>;

function hasSwitch(argv: readonly string[], name: string): boolean {
  return argv.includes(`--${name}`) || argv.includes(`--${name}=true`);
}

function readFlag(
  argv: readonly string[],
  name: string,
): string | undefined {
  const flagIndex = argv.findIndex((value) => value === `--${name}`);
  if (flagIndex >= 0) {
    return argv[flagIndex + 1];
  }
  const inline = argv.find((value) => value.startsWith(`--${name}=`));
  if (inline !== undefined) {
    return inline.slice(`--${name}=`.length);
  }
  return undefined;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function listMediaMigrationCandidates(options: {
  databaseUrl: string;
  mediaRoot: string;
}): Promise<MediaMigrationItem[]> {
  const database = createPostgresDatabase(options.databaseUrl);
  try {
    const photos = await database.orm
      .select({
        storageKey: catalogReferences.photoStorageKey,
        sha256: catalogReferences.photoSha256,
        byteSize: catalogReferences.photoByteSize,
      })
      .from(catalogReferences)
      .where(isNotNull(catalogReferences.photoStorageKey));

    const guides = await database.orm
      .select({
        storageKey: shippingGuideJobs.guidePdfStorageKey,
        sha256: shippingGuideJobs.guidePdfSha256,
        byteSize: shippingGuideJobs.guidePdfByteSize,
      })
      .from(shippingGuideJobs)
      .where(isNotNull(shippingGuideJobs.guidePdfStorageKey));

    return [
      ...photos
        .filter(
          (row): row is typeof row & { storageKey: string } =>
            row.storageKey !== null,
        )
        .map((row) => ({
          kind: 'photo' as const,
          storageKey: row.storageKey,
          expectedSha256: row.sha256,
          byteSize: row.byteSize,
          sourcePath: path.join(options.mediaRoot, row.storageKey),
        })),
      ...guides
        .filter(
          (row): row is typeof row & { storageKey: string } =>
            row.storageKey !== null,
        )
        .map((row) => ({
          kind: 'guide_pdf' as const,
          storageKey: row.storageKey,
          expectedSha256: row.sha256,
          byteSize: row.byteSize,
          sourcePath: path.join(options.mediaRoot, 'guides', row.storageKey),
        })),
    ];
  } finally {
    await database.close();
  }
}

export async function migrateMediaToObjectStorage(options: {
  mode: MigrationMode;
  mediaRoot: string;
  candidates: readonly MediaMigrationItem[];
  photoStorage: ObjectStorage;
  guideStorage: ObjectStorage;
}): Promise<MediaMigrationReport> {
  const items: MediaMigrationReport['items'][number][] = [];
  let migrated = 0;
  let skippedExisting = 0;
  let mismatched = 0;
  let missingSource = 0;

  for (const candidate of options.candidates) {
    const destination =
      candidate.kind === 'photo' ? options.photoStorage : options.guideStorage;

    if (!(await fileExists(candidate.sourcePath))) {
      missingSource += 1;
      items.push({
        kind: candidate.kind,
        storageKey: candidate.storageKey,
        status: 'missing_source',
      });
      continue;
    }

    const bytes = new Uint8Array(await readFile(candidate.sourcePath));
    const sourceSha256 = sha256Hex(bytes);
    if (
      candidate.expectedSha256 !== null &&
      candidate.expectedSha256 !== sourceSha256
    ) {
      mismatched += 1;
      items.push({
        kind: candidate.kind,
        storageKey: candidate.storageKey,
        status: 'mismatch',
        sourceSha256,
        destinationSha256: candidate.expectedSha256,
      });
      continue;
    }

    if (await destination.exists(candidate.storageKey)) {
      const existing = await destination.get(candidate.storageKey);
      const destinationSha256 = sha256Hex(existing);
      if (destinationSha256 === sourceSha256) {
        skippedExisting += 1;
        items.push({
          kind: candidate.kind,
          storageKey: candidate.storageKey,
          status: 'skipped_existing',
          sourceSha256,
          destinationSha256,
        });
        continue;
      }
      mismatched += 1;
      items.push({
        kind: candidate.kind,
        storageKey: candidate.storageKey,
        status: 'mismatch',
        sourceSha256,
        destinationSha256,
      });
      continue;
    }

    if (options.mode === 'dry_run') {
      migrated += 1;
      items.push({
        kind: candidate.kind,
        storageKey: candidate.storageKey,
        status: 'would_migrate',
        sourceSha256,
      });
      continue;
    }

    const contentType =
      candidate.kind === 'guide_pdf'
        ? 'application/pdf'
        : candidate.storageKey.endsWith('.png')
          ? 'image/png'
          : 'image/jpeg';

    await destination.put({
      key: candidate.storageKey,
      bytes,
      contentType,
      sha256: sourceSha256,
    });
    const verified = sha256Hex(await destination.get(candidate.storageKey));
    if (verified !== sourceSha256) {
      mismatched += 1;
      items.push({
        kind: candidate.kind,
        storageKey: candidate.storageKey,
        status: 'mismatch',
        sourceSha256,
        destinationSha256: verified,
      });
      continue;
    }

    migrated += 1;
    items.push({
      kind: candidate.kind,
      storageKey: candidate.storageKey,
      status: 'migrated',
      sourceSha256,
      destinationSha256: verified,
    });
  }

  return {
    mode: options.mode,
    scanned: options.candidates.length,
    migrated,
    skippedExisting,
    mismatched,
    missingSource,
    preservedSourceFiles: true,
    items,
  };
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
): Promise<void> {
  const mode: MigrationMode = hasSwitch(argv, 'execute') ? 'execute' : 'dry_run';
  const databaseUrl =
    readFlag(argv, 'database-url') ?? requireDatabaseUrl(process.env);
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: databaseUrl,
  });
  const mediaRoot = readFlag(argv, 'media-root') ?? config.mediaRoot;
  const candidates = await listMediaMigrationCandidates({
    databaseUrl,
    mediaRoot,
  });
  const report = await migrateMediaToObjectStorage({
    mode,
    mediaRoot,
    candidates,
    photoStorage: createObjectStorage(config, 'photos'),
    guideStorage: createObjectStorage(config, 'guides'),
  });
  console.log(JSON.stringify(report, null, 2));
  if (report.mismatched > 0 || report.missingSource > 0) {
    process.exitCode = 1;
  }
}

const executedAsCli =
  process.argv[1]?.includes('migrate-media-to-object-storage') === true;

if (executedAsCli) {
  main().catch((error: unknown) => {
    console.error('Media migration failed');
    if (error instanceof Error) {
      console.error(error.message);
    }
    process.exitCode = 1;
  });
}
