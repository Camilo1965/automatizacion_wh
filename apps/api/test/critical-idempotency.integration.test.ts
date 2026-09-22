import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { InventoryClosureService } from '../src/modules/inventory/inventory-closure-service.js';
import { PostgresInventoryClosureRepository } from '../src/modules/inventory/postgres-inventory-closure-repository.js';
import { OrderService } from '../src/modules/orders/order-service.js';
import { PostgresOrderRepository } from '../src/modules/orders/postgres-order-repository.js';
import { PostgresShippingGuideJobRepository } from '../src/modules/shipping/postgres-shipping-guide-job-repository.js';
import { PostgresOutboundRepository } from '../src/modules/whatsapp/postgres-outbound-repository.js';
import { PostgresWhatsAppInboundRepository } from '../src/modules/whatsapp/postgres-whatsapp-inbound-repository.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const databaseUrl = requireTestDatabaseUrl();
const adminId = '11111111-1111-4111-8111-111111111111';
const referenceId = '22222222-2222-4222-8222-222222222222';

async function seedBase(): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await sql`
      TRUNCATE TABLE
        whatsapp_outbound_messages,
        whatsapp_inbound_messages,
        whatsapp_conversation_events,
        whatsapp_conversations,
        shipping_guide_jobs,
        order_confirmations,
        reservation_movements,
        order_status_events,
        order_summaries,
        sales_orders,
        inventory_closures,
        inventory_movements,
        catalog_stock,
        catalog_references,
        shipping_localities,
        admin_sessions,
        admin_users
      CASCADE
    `;
    await sql`
      INSERT INTO admin_users (id, username, password_hash)
      VALUES (${adminId}, 'owner', 'hash')
    `;
    await sql`
      INSERT INTO catalog_references (id, code, model_name, color, price_cop)
      VALUES (${referenceId}, '01', 'Ballerina', 'Negro', 120000)
    `;
    await sql`
      INSERT INTO catalog_stock (reference_id, size, physical_quantity, reserved_quantity)
      VALUES (${referenceId}, 37, 10, 0)
    `;
    await sql`
      INSERT INTO shipping_localities
        (carrier_code, department, locality, normalized_name, source_sha256)
      VALUES ('11001000', 'Bogotá', 'Bogotá', 'bogota', ${'a'.repeat(64)})
    `;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

describe('critical-path concurrent idempotency', () => {
  beforeAll(() => runMigrations(databaseUrl));
  beforeEach(seedBase);

  it('confirms once under concurrent identical idempotency keys', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const service = new OrderService(
      new PostgresOrderRepository(database),
      async () => ({
        id: referenceId,
        code: '01',
        modelName: 'Ballerina',
        color: 'Negro',
        priceCop: 120000,
        active: true,
        photo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    try {
      const draft = await service.create({
        referenceId,
        size: '37',
        quantity: 1,
        customerName: 'Ana Gómez',
        customerPhone: '3001234567',
        address: 'Calle 1 # 2-3',
        localityCarrierCode: '11001000',
        adminUserId: adminId,
      });
      const summary = await service.createSummary(draft.id);
      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          service.transition({
            orderId: draft.id,
            action: 'confirm',
            summaryVersion: summary.version,
            idempotencyKey: 'confirm-concurrent-0001',
            adminUserId: adminId,
          }),
        ),
      );
      expect(new Set(results.map((row) => row.status))).toEqual(
        new Set(['confirmed']),
      );
      const sql = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [confirmations] = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM order_confirmations
        `;
        const [stock] = await sql<{ reserved_quantity: number }[]>`
          SELECT reserved_quantity FROM catalog_stock
        `;
        expect(confirmations?.count).toBe(1);
        expect(stock?.reserved_quantity).toBe(1);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });

  it('reserves stock once when two orders race on the last unit', async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`UPDATE catalog_stock SET physical_quantity = 1, reserved_quantity = 0`;
    } finally {
      await sql.end({ timeout: 5 });
    }
    const database = createPostgresDatabase(databaseUrl);
    const service = new OrderService(
      new PostgresOrderRepository(database),
      async () => ({
        id: referenceId,
        code: '01',
        modelName: 'Ballerina',
        color: 'Negro',
        priceCop: 120000,
        active: true,
        photo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    try {
      const first = await service.create({
        referenceId,
        size: '37',
        quantity: 1,
        customerName: 'Ana A',
        customerPhone: '3001111111',
        address: 'Calle 1',
        localityCarrierCode: '11001000',
        adminUserId: adminId,
      });
      const second = await service.create({
        referenceId,
        size: '37',
        quantity: 1,
        customerName: 'Ana B',
        customerPhone: '3002222222',
        address: 'Calle 2',
        localityCarrierCode: '11001000',
        adminUserId: adminId,
      });
      const summaryA = await service.createSummary(first.id);
      const summaryB = await service.createSummary(second.id);
      const outcomes = await Promise.allSettled([
        service.transition({
          orderId: first.id,
          action: 'confirm',
          summaryVersion: summaryA.version,
          idempotencyKey: 'stock-race-a',
          adminUserId: adminId,
        }),
        service.transition({
          orderId: second.id,
          action: 'confirm',
          summaryVersion: summaryB.version,
          idempotencyKey: 'stock-race-b',
          adminUserId: adminId,
        }),
      ]);
      expect(outcomes.filter((row) => row.status === 'fulfilled')).toHaveLength(
        1,
      );
      expect(outcomes.filter((row) => row.status === 'rejected')).toHaveLength(
        1,
      );
      const check = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [stock] = await check<{ reserved_quantity: number }[]>`
          SELECT reserved_quantity FROM catalog_stock
        `;
        const [confirmed] = await check<{ count: number }[]>`
          SELECT count(*)::int AS count FROM sales_orders WHERE status = 'confirmed'
        `;
        expect(stock?.reserved_quantity).toBe(1);
        expect(confirmed?.count).toBe(1);
      } finally {
        await check.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });

  it('stores one inbound webhook row for a duplicated message id', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const inbound = new PostgresWhatsAppInboundRepository(database);
    const payload = {
      whatsappMessageId: 'wamid.dup-inbound-1',
      businessPhoneNumberId: '100',
      customerPhone: '+573001111111',
      messageType: 'text' as const,
      textBody: 'hola',
      receivedAt: new Date(),
      payload: { duplicate: true },
    };
    try {
      await Promise.all([
        inbound.storeMany([payload]),
        inbound.storeMany([payload]),
        inbound.storeMany([payload]),
      ]);
      const sql = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [row] = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM whatsapp_inbound_messages
        `;
        expect(row?.count).toBe(1);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });

  it('enqueues one outbound message for a racing idempotency key', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const outbound = new PostgresOutboundRepository(database);
    try {
      const rows = await Promise.all(
        Array.from({ length: 6 }, () =>
          outbound.enqueueText({
            customerPhone: '+573001234567',
            body: 'Bienvenida',
            idempotencyKey: 'welcome:race-1',
          }),
        ),
      );
      expect(new Set(rows.map((row) => row.id)).size).toBe(1);
      const sql = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [count] = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM whatsapp_outbound_messages
        `;
        expect(count?.count).toBe(1);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });

  it('creates one guide job when enqueue races for the same order', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const service = new OrderService(
      new PostgresOrderRepository(database),
      async () => ({
        id: referenceId,
        code: '01',
        modelName: 'Ballerina',
        color: 'Negro',
        priceCop: 120000,
        active: true,
        photo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const jobs = new PostgresShippingGuideJobRepository(database);
    try {
      const draft = await service.create({
        referenceId,
        size: '37',
        quantity: 1,
        customerName: 'Ana Gómez',
        customerPhone: '3001234567',
        address: 'Calle 1 # 2-3',
        localityCarrierCode: '11001000',
        adminUserId: adminId,
      });
      const summary = await service.createSummary(draft.id);
      await service.transition({
        orderId: draft.id,
        action: 'confirm',
        summaryVersion: summary.version,
        idempotencyKey: 'guide-enqueue-confirm',
        adminUserId: adminId,
      });
      const enqueued = await Promise.all([
        jobs.enqueue(draft.id),
        jobs.enqueue(draft.id),
        jobs.enqueue(draft.id),
      ]);
      expect(new Set(enqueued.map((row) => row.id)).size).toBe(1);
      const sql = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [count] = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM shipping_guide_jobs
        `;
        expect(count?.count).toBe(1);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });

  it('generates one inventory closeout for a concurrent business date', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const closures = new InventoryClosureService(
      new PostgresInventoryClosureRepository(database),
    );
    try {
      const date = '2026-09-21';
      const results = await Promise.all([
        closures.generate(date),
        closures.generate(date),
        closures.generate(date),
      ]);
      const ids = results.map((row) => (row as { id: string }).id);
      expect(new Set(ids).size).toBe(1);
      const sql = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [count] = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM inventory_closures
          WHERE business_date = ${date}
        `;
        expect(count?.count).toBe(1);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });
});
