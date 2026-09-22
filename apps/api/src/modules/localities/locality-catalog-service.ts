import { createHash } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { PostgresDatabase } from '../../database/client.js';
import {
  localityCatalogVersions,
  shippingLocalities,
  configurationAudits,
} from '../../database/schema/index.js';
import {
  parse99EnviosLocalitySource,
  toColombianLocalities,
} from './99envios-locality-source.js';
import { parseColombianLocalitiesCsv } from './locality-import.js';

const RowsSchema = z.array(
  z
    .object({
      carrierCode: z.string().regex(/^\d{8}$/),
      department: z.string().min(1).max(100),
      locality: z.string().min(1).max(120),
      normalizedName: z.string().min(1).max(240),
      country: z.literal('CO'),
    })
    .strict(),
);
export class LocalityCatalogError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export class LocalityCatalogService {
  constructor(private readonly database: PostgresDatabase) {}
  async bootstrap() {
    await this.database.orm.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('kairo.locality-catalog'))`,
      );
      const [active] = await tx
        .select()
        .from(localityCatalogVersions)
        .where(eq(localityCatalogVersions.status, 'active'));
      if (active) return;
      const rows = await tx
        .select({
          carrierCode: shippingLocalities.carrierCode,
          department: shippingLocalities.department,
          locality: shippingLocalities.locality,
          normalizedName: shippingLocalities.normalizedName,
          country: shippingLocalities.country,
        })
        .from(shippingLocalities)
        .where(eq(shippingLocalities.active, true));
      if (!rows.length) return;
      const canonical = RowsSchema.parse(rows);
      await tx.insert(localityCatalogVersions).values({
        sourceSha256: createHash('sha256')
          .update(JSON.stringify(canonical))
          .digest('hex'),
        sourceType: 'csv',
        rows: canonical,
        issues: [],
        author: 'bootstrap',
        status: 'active',
        publishedAt: new Date(),
      });
    });
  }
  async list() {
    const versions = await this.database.orm
      .select()
      .from(localityCatalogVersions)
      .orderBy(desc(localityCatalogVersions.createdAt));
    return versions.map((row) => ({
      id: row.id,
      status: row.status,
      sourceType: row.sourceType,
      sourceSha256: row.sourceSha256,
      rowCount: RowsSchema.parse(row.rows).length,
      issues: row.issues,
      author: row.author,
      createdAt: row.createdAt.toISOString(),
      publishedAt: row.publishedAt?.toISOString() ?? null,
    }));
  }
  async preview(
    source: string,
    format: 'csv' | '99envios_document',
    author: string,
  ) {
    const parsed = parse99EnviosLocalitySource(source);
    const csv = format === 'csv' ? parseColombianLocalitiesCsv(source) : null;
    const rows = RowsSchema.parse(
      csv?.localities ?? toColombianLocalities(parsed.rows),
    );
    const issues = csv?.errors ?? parsed.issues;
    if (!rows.length)
      throw new LocalityCatalogError(
        'invalid_source',
        400,
        'La fuente no contiene municipios colombianos válidos.',
      );
    if (csv && csv.errors.length)
      throw new LocalityCatalogError(
        'invalid_source',
        400,
        'El CSV contiene errores. Corrige el archivo antes de continuar.',
      );
    const { active, preview } = await this.database.orm.transaction(
      async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext('kairo.locality-catalog'))`,
        );
        const [active] = await tx
          .select({ id: localityCatalogVersions.id })
          .from(localityCatalogVersions)
          .where(eq(localityCatalogVersions.status, 'active'));
        const hash = createHash('sha256').update(source).digest('hex');
        const [existing] = await tx
          .select()
          .from(localityCatalogVersions)
          .where(
            and(
              eq(localityCatalogVersions.sourceSha256, hash),
              eq(localityCatalogVersions.sourceType, format),
              eq(localityCatalogVersions.status, 'preview'),
              sql`${localityCatalogVersions.baseVersionId} IS NOT DISTINCT FROM ${active?.id ?? null}::uuid`,
            ),
          );
        if (existing) return { active, preview: existing };
        const [preview] = await tx
          .insert(localityCatalogVersions)
          .values({
            sourceSha256: hash,
            sourceType: format,
            rows,
            issues,
            baseVersionId: active?.id ?? null,
            author,
          })
          .returning();
        return { active, preview: preview! };
      },
    );
    return {
      id: preview!.id,
      rows: rows.slice(0, 100),
      rowCount: rows.length,
      issues,
      excludedCount: issues.length,
      baseVersionId: active?.id ?? null,
    };
  }
  async publish(id: string, author: string, restore = false) {
    await this.database.orm.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('kairo.locality-catalog'))`,
      );
      const [version] = await tx
        .select()
        .from(localityCatalogVersions)
        .where(eq(localityCatalogVersions.id, id));
      if (!version)
        throw new LocalityCatalogError(
          'not_found',
          404,
          'La versión no existe.',
        );
      if (version.status === 'active' && !restore) return;
      const [active] = await tx
        .select()
        .from(localityCatalogVersions)
        .where(eq(localityCatalogVersions.status, 'active'));
      if (
        !restore &&
        (version.status !== 'preview' ||
          version.baseVersionId !== (active?.id ?? null))
      )
        throw new LocalityCatalogError(
          'stale_preview',
          409,
          'El listado cambió. Genera una nueva vista previa.',
        );
      const rows = RowsSchema.parse(version.rows);
      await tx.insert(configurationAudits).values({
        scope: 'localities',
        action: restore ? 'restored' : 'published',
        author,
        snapshot: {
          sourceSha256: version.sourceSha256,
          rowCount: rows.length,
          versionId: id,
        },
      });
      await tx.update(shippingLocalities).set({ active: false });
      await tx
        .insert(shippingLocalities)
        .values(
          rows.map((row) => ({
            ...row,
            sourceSha256: version.sourceSha256,
            active: true,
          })),
        )
        .onConflictDoUpdate({
          target: shippingLocalities.carrierCode,
          set: {
            department: sql`excluded.department`,
            locality: sql`excluded.locality`,
            normalizedName: sql`excluded.normalized_name`,
            sourceSha256: sql`excluded.source_sha256`,
            active: true,
            importedAt: new Date(),
          },
        });
      await tx
        .update(localityCatalogVersions)
        .set({ status: 'retired' })
        .where(eq(localityCatalogVersions.status, 'active'));
      if (restore)
        await tx.insert(localityCatalogVersions).values({
          sourceSha256: version.sourceSha256,
          sourceType: version.sourceType,
          rows,
          issues: version.issues,
          baseVersionId: active?.id ?? null,
          author,
          status: 'active',
          publishedAt: new Date(),
        });
      else
        await tx
          .update(localityCatalogVersions)
          .set({ status: 'active', author, publishedAt: new Date() })
          .where(eq(localityCatalogVersions.id, id));
    });
    return this.list();
  }
}
