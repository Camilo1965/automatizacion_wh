import { asc, eq, sql } from 'drizzle-orm';
import type { PostgresDatabase } from '../../database/client.js';
import {
  catalogReferences,
  inventoryClosures,
  inventoryMovements,
} from '../../database/schema.js';
import type { ClosureRepository } from './inventory-closure-service.js';

export class PostgresInventoryClosureRepository implements ClosureRepository {
  constructor(private readonly database: PostgresDatabase) {}
  async findByDate(date: string) {
    const [row] = await this.database.orm
      .select()
      .from(inventoryClosures)
      .where(eq(inventoryClosures.businessDate, date))
      .orderBy(asc(inventoryClosures.version))
      .limit(1);
    return row ?? null;
  }
  movementsForDate(date: string) {
    return this.database.orm
      .select({
        code: catalogReferences.code,
        size: inventoryMovements.size,
        delta: inventoryMovements.delta,
      })
      .from(inventoryMovements)
      .innerJoin(
        catalogReferences,
        eq(catalogReferences.id, inventoryMovements.referenceId),
      )
      .where(
        sql`(${inventoryMovements.createdAt} AT TIME ZONE 'America/Bogota')::date = ${date}::date`,
      )
      .orderBy(asc(catalogReferences.code), asc(inventoryMovements.size));
  }
  async save(input: {
    businessDate: string;
    profile: 'adjustments';
    movementCount: number;
    totalUnits: number;
    checksum: string;
    csvContent: string;
  }) {
    const [row] = await this.database.orm
      .insert(inventoryClosures)
      .values(input)
      .onConflictDoNothing()
      .returning();
    return row ?? this.findByDate(input.businessDate);
  }
}
