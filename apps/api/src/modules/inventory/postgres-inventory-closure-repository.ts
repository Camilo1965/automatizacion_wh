import { asc, desc, eq, sql } from 'drizzle-orm';
import type { PostgresDatabase } from '../../database/client.js';
import {
  catalogReferences,
  inventoryClosures,
  inventoryMovements,
} from '../../database/schema/index.js';
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
  list() {
    return this.database.orm
      .select()
      .from(inventoryClosures)
      .orderBy(
        desc(inventoryClosures.businessDate),
        desc(inventoryClosures.version),
      )
      .limit(100);
  }
  async findById(id: string) {
    const [row] = await this.database.orm
      .select()
      .from(inventoryClosures)
      .where(eq(inventoryClosures.id, id))
      .limit(1);
    return row ?? null;
  }
  async acknowledge(id: string) {
    const [row] = await this.database.orm
      .update(inventoryClosures)
      .set({ status: 'acknowledged', acknowledgedAt: sql`clock_timestamp()` })
      .where(eq(inventoryClosures.id, id))
      .returning();
    return row;
  }
  async reopen(id: string, reason: string) {
    return this.database.orm.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(inventoryClosures)
        .where(eq(inventoryClosures.id, id))
        .limit(1);
      if (!current) return undefined;
      await tx
        .update(inventoryClosures)
        .set({ status: 'reopened' })
        .where(eq(inventoryClosures.id, id));
      const [created] = await tx
        .insert(inventoryClosures)
        .values({
          businessDate: current.businessDate,
          version: current.version + 1,
          profile: current.profile,
          status: 'generated',
          movementCount: 0,
          totalUnits: 0,
          checksum: current.checksum,
          csvContent: `# Reapertura: ${reason}\r\nreferencia,talla,ajuste\r\n`,
        })
        .returning();
      return created;
    });
  }
}
