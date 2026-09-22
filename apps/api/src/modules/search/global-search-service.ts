import { sql, desc, asc } from 'drizzle-orm';

import type { GlobalSearchHit } from '@camila/contracts';

import type { PostgresDatabase } from '../../database/client.js';
import {
  catalogReferences,
  salesOrders,
  whatsappConversations,
} from '../../database/schema.js';

function escapeLikePattern(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
}

function likePattern(query: string): string {
  return `%${escapeLikePattern(query)}%`;
}

export class GlobalSearchService {
  constructor(private readonly database: PostgresDatabase) {}

  async search(input: {
    q: string;
    limit: number;
  }): Promise<readonly GlobalSearchHit[]> {
    const needle = input.q.trim();
    if (needle.length < 2) return [];
    const pattern = likePattern(needle);
    const perKind = Math.max(1, Math.ceil(input.limit / 3));

    const [orders, conversations, references] = await Promise.all([
      this.searchOrders(pattern, perKind),
      this.searchConversations(pattern, perKind),
      this.searchReferences(pattern, perKind),
    ]);

    return [...orders, ...conversations, ...references].slice(0, input.limit);
  }

  private async searchOrders(
    pattern: string,
    limit: number,
  ): Promise<GlobalSearchHit[]> {
    const rows = await this.database.orm
      .select({
        id: salesOrders.id,
        orderNumber: salesOrders.orderNumber,
        customerName: salesOrders.customerName,
        customerPhone: salesOrders.customerPhone,
      })
      .from(salesOrders)
      .where(
        sql`(
          ${salesOrders.customerName} ILIKE ${pattern} ESCAPE '\\'
          OR ${salesOrders.customerPhone} ILIKE ${pattern} ESCAPE '\\'
          OR CAST(${salesOrders.orderNumber} AS TEXT) ILIKE ${pattern} ESCAPE '\\'
        )`,
      )
      .orderBy(desc(salesOrders.createdAt), desc(salesOrders.id))
      .limit(limit);

    return rows.map((row) => ({
      kind: 'order' as const,
      id: row.id,
      label: `${row.orderNumber} · ${row.customerName ?? row.customerPhone ?? 'Cliente'}`,
      href: `/orders/${row.id}`,
    }));
  }

  private async searchConversations(
    pattern: string,
    limit: number,
  ): Promise<GlobalSearchHit[]> {
    const rows = await this.database.orm
      .select({
        id: whatsappConversations.id,
        customerPhone: whatsappConversations.customerPhone,
      })
      .from(whatsappConversations)
      .where(
        sql`${whatsappConversations.customerPhone} ILIKE ${pattern} ESCAPE '\\'`,
      )
      .orderBy(
        desc(whatsappConversations.updatedAt),
        desc(whatsappConversations.id),
      )
      .limit(limit);

    return rows.map((row) => ({
      kind: 'conversation' as const,
      id: row.id,
      label: row.customerPhone,
      href: `/conversations?conversation=${row.id}`,
    }));
  }

  private async searchReferences(
    pattern: string,
    limit: number,
  ): Promise<GlobalSearchHit[]> {
    const rows = await this.database.orm
      .select({
        id: catalogReferences.id,
        code: catalogReferences.code,
        modelName: catalogReferences.modelName,
        color: catalogReferences.color,
      })
      .from(catalogReferences)
      .where(
        sql`(
          ${catalogReferences.code} ILIKE ${pattern} ESCAPE '\\'
          OR ${catalogReferences.modelName} ILIKE ${pattern} ESCAPE '\\'
          OR ${catalogReferences.color} ILIKE ${pattern} ESCAPE '\\'
        )`,
      )
      .orderBy(asc(catalogReferences.code), asc(catalogReferences.id))
      .limit(limit);

    return rows.map((row) => ({
      kind: 'reference' as const,
      id: row.id,
      label: `${row.code} · ${row.modelName} · ${row.color}`,
      href: `/references/${row.id}`,
    }));
  }
}
