import { and, asc, eq, gt, ilike, or } from 'drizzle-orm';
import type { PostgresDatabase } from '../../database/client.js';
import { shippingLocalities } from '../../database/schema.js';
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
  }) {
    return this.database.orm.transaction(async (tx) => {
      const [current] = await tx
        .select({ sourceSha256: shippingLocalities.sourceSha256 })
        .from(shippingLocalities)
        .limit(1);
      if (current?.sourceSha256 === input.sourceSha256)
        return { imported: 0, unchanged: true };
      await tx.delete(shippingLocalities);
      if (input.localities.length > 0) {
        await tx.insert(shippingLocalities).values(
          input.localities.map((item) => ({
            ...item,
            sourceSha256: input.sourceSha256,
          })),
        );
      }
      return { imported: input.localities.length, unchanged: false };
    });
  }

  async list(input: LocalityListInput): Promise<LocalityPage> {
    const conditions = [];
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
}
