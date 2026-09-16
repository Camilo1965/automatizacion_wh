import { and, asc, eq, gt, ilike, or, sql } from 'drizzle-orm';
import type { PostgresDatabase } from '../../database/client.js';
import {
  shippingLocalities,
  shippingLocalityImports,
} from '../../database/schema.js';
import type { ColombianLocality } from './locality-import.js';
import type {
  LocalityListInput,
  LocalityPage,
  LocalityRepository,
} from './locality-repository.js';

export class PostgresLocalityRepository implements LocalityRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async replaceAll(input: {
    localities: readonly ColombianLocality[];
    sourceSha256: string;
    sourceType?: 'csv' | '99envios_document';
    issues?: unknown;
  }) {
    return this.database.orm.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('kairo.locality-catalog'))`,
      );
      const [current] = await tx
        .select({ sourceSha256: shippingLocalities.sourceSha256 })
        .from(shippingLocalities)
        .where(eq(shippingLocalities.active, true))
        .limit(1);
      if (current?.sourceSha256 === input.sourceSha256)
        return { imported: 0, unchanged: true };

      await tx
        .update(shippingLocalities)
        .set({ active: false })
        .where(eq(shippingLocalities.active, true));
      if (input.localities.length > 0) {
        await tx
          .insert(shippingLocalities)
          .values(
            input.localities.map((item) => ({
              ...item,
              sourceSha256: input.sourceSha256,
              active: true,
            })),
          )
          .onConflictDoUpdate({
            target: shippingLocalities.carrierCode,
            set: {
              department: sql`excluded.department`,
              locality: sql`excluded.locality`,
              normalizedName: sql`excluded.normalized_name`,
              country: sql`excluded.country`,
              sourceSha256: sql`excluded.source_sha256`,
              active: true,
              importedAt: sql`now()`,
            },
          });
      }
      await tx
        .insert(shippingLocalityImports)
        .values({
          sourceSha256: input.sourceSha256,
          sourceType: input.sourceType ?? 'csv',
          importedCount: input.localities.length,
          issues: input.issues ?? [],
        })
        .onConflictDoNothing({ target: shippingLocalityImports.sourceSha256 });
      return { imported: input.localities.length, unchanged: false };
    });
  }

  async list(input: LocalityListInput): Promise<LocalityPage> {
    const conditions = [];
    conditions.push(eq(shippingLocalities.active, true));
    if (input.query)
      conditions.push(
        or(
          ilike(shippingLocalities.normalizedName, `%${input.query}%`),
          ilike(shippingLocalities.locality, `%${input.query}%`),
        )!,
      );
    if (input.department)
      conditions.push(eq(shippingLocalities.department, input.department));
    if (input.afterCode)
      conditions.push(gt(shippingLocalities.carrierCode, input.afterCode));
    const rows = await this.database.orm
      .select()
      .from(shippingLocalities)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(shippingLocalities.carrierCode))
      .limit(input.limit + 1);
    const hasMore = rows.length > input.limit;
    const items = rows
      .slice(0, input.limit)
      .map(
        ({ carrierCode, department, locality, country, normalizedName }) => ({
          carrierCode,
          department,
          locality,
          country: country as 'CO',
          normalizedName,
        }),
      );
    return {
      items,
      nextAfterCode: hasMore ? (items.at(-1)?.carrierCode ?? null) : null,
    };
  }

  async listDepartments() {
    return this.database.orm
      .select({
        name: shippingLocalities.department,
        localityCount: sql<number>`count(*)::int`,
      })
      .from(shippingLocalities)
      .where(eq(shippingLocalities.active, true))
      .groupBy(shippingLocalities.department)
      .orderBy(asc(shippingLocalities.department));
  }
}
