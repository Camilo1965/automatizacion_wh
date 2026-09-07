import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { PostgresOrderRepository } from '../src/modules/orders/postgres-order-repository.js';
import { OrderService } from '../src/modules/orders/order-service.js';
import {
  assertTestDatabaseName,
  requireTestDatabaseUrl,
} from './helpers/test-database.js';

const databaseUrl = requireTestDatabaseUrl();
const adminId = '11111111-1111-4111-8111-111111111111';

describe('order lifecycle', () => {
  beforeAll(async () => {
    assertTestDatabaseName(databaseUrl);
    await runMigrations(databaseUrl);
  });
  beforeEach(async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`TRUNCATE TABLE order_status_events, reservation_movements, order_confirmations, order_summaries, sales_orders, inventory_movements, catalog_stock, shipping_localities, catalog_references, admin_sessions, admin_users CASCADE`;
      await sql`INSERT INTO admin_users (id, username, password_hash) VALUES (${adminId}, 'owner', 'hash')`;
      await sql`INSERT INTO catalog_references (id, code, model_name, color, price_cop) VALUES ('22222222-2222-4222-8222-222222222222', '01', 'Ballerina', 'Negro', 120000)`;
      await sql`INSERT INTO catalog_stock (reference_id, size, physical_quantity, reserved_quantity) VALUES ('22222222-2222-4222-8222-222222222222', 37, 3, 0)`;
      await sql`INSERT INTO shipping_localities (carrier_code, department, locality, normalized_name, source_sha256) VALUES ('11001', 'Bogotá', 'Bogotá', 'bogota', ${'a'.repeat(64)})`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('reserves, dispatches and returns a confirmed order exactly once', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresOrderRepository(database);
    const service = new OrderService(repository, async () => ({
      id: '22222222-2222-4222-8222-222222222222',
      code: '01',
      modelName: 'Ballerina',
      color: 'Negro',
      priceCop: 120000,
      active: true,
      photo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    try {
      const draft = await service.create({
        referenceId: '22222222-2222-4222-8222-222222222222',
        size: '37',
        quantity: 2,
        customerName: 'Ana Gómez',
        customerPhone: '3001234567',
        address: 'Calle 1 # 2-3',
        localityCarrierCode: '11001',
        adminUserId: adminId,
      });
      const summary = await service.createSummary(draft.id);
      const confirmed = await service.transition({
        orderId: draft.id,
        action: 'confirm',
        summaryVersion: summary.version,
        idempotencyKey: 'confirm-order-0001',
        adminUserId: adminId,
      });
      expect(confirmed.status).toBe('confirmed');
      const replay = await service.transition({
        orderId: draft.id,
        action: 'confirm',
        summaryVersion: summary.version,
        idempotencyKey: 'confirm-order-0001',
        adminUserId: adminId,
      });
      expect(replay.status).toBe('confirmed');
      const dispatched = await service.transition({
        orderId: draft.id,
        action: 'dispatch',
        adminUserId: adminId,
      });
      expect(dispatched.status).toBe('dispatched');
      const returned = await service.transition({
        orderId: draft.id,
        action: 'return',
        adminUserId: adminId,
      });
      expect(returned.status).toBe('returned');
      const sql = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [stock] = await sql<
          { physical_quantity: number; reserved_quantity: number }[]
        >`SELECT physical_quantity, reserved_quantity FROM catalog_stock`;
        expect(stock).toEqual({ physical_quantity: 3, reserved_quantity: 0 });
      } finally {
        await sql.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });
});
