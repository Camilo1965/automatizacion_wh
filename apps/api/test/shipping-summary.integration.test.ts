import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { PostgresOrderRepository } from '../src/modules/orders/postgres-order-repository.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const databaseUrl = requireTestDatabaseUrl();

describe('shipping-inclusive order summary', () => {
  beforeAll(() => runMigrations(databaseUrl));
  beforeEach(async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`TRUNCATE TABLE shipping_guide_jobs, shipping_quotes, order_confirmations, order_summaries, reservation_movements, order_status_events, sales_orders, catalog_stock, catalog_references CASCADE`;
      await sql`INSERT INTO catalog_references (id, code, model_name, color, price_cop) VALUES ('22222222-2222-4222-8222-222222222222', '01', 'Tenis', 'Negro', 120000)`;
      await sql`INSERT INTO catalog_stock (reference_id, size, physical_quantity, reserved_quantity) VALUES ('22222222-2222-4222-8222-222222222222', 37, 1, 0)`;
      await sql`INSERT INTO sales_orders (id, reference_id, size, quantity, customer_name, customer_phone, address, locality_carrier_code, locality_department, locality_name) VALUES ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 37, 1, 'Camila Pérez', '+573158191776', 'Calle 1 # 2-3', '05001000', 'Antioquia', 'Medellín')`;
      await sql`INSERT INTO shipping_quotes (id, order_id, draft_version, carrier, service_id, freight_cop, cash_on_delivery_cop, surcharge_cop, estimated_days, quoted_at, expires_at, recommended, selected) VALUES ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 1, 'envia', 12, 13368, 3000, 600, '1', clock_timestamp(), clock_timestamp() + interval '30 minutes', true, true)`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('freezes the selected quote and enqueues it atomically on confirmation', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresOrderRepository(database);
    try {
      const summary = await repository.createSummary(
        '11111111-1111-4111-8111-111111111111',
      );
      expect(summary.snapshot).toMatchObject({
        shippingPending: false,
        shippingCostCop: 16968,
        totalCop: 136968,
        shippingQuote: { carrier: 'envia', cashOnDeliveryCop: 3000 },
      });
      await repository.transition({
        orderId: '11111111-1111-4111-8111-111111111111',
        action: 'confirm',
        summaryVersion: summary.version,
        idempotencyKey: 'shipping-confirm-1',
      });
      const sql = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [job] = await sql<
          { quote_id: string; carrier: string }[]
        >`SELECT quote_id, carrier FROM shipping_guide_jobs`;
        expect(job).toEqual({
          quote_id: '33333333-3333-4333-8333-333333333333',
          carrier: 'envia',
        });
      } finally {
        await sql.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });

  it('rejects confirmation when the selected quote changed after the summary', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresOrderRepository(database);
    try {
      const summary = await repository.createSummary(
        '11111111-1111-4111-8111-111111111111',
      );
      const sql = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        await sql`UPDATE shipping_quotes SET selected = false WHERE order_id = '11111111-1111-4111-8111-111111111111'`;
        await sql`INSERT INTO shipping_quotes (order_id, draft_version, carrier, service_id, freight_cop, cash_on_delivery_cop, surcharge_cop, estimated_days, quoted_at, expires_at, recommended, selected) VALUES ('11111111-1111-4111-8111-111111111111', 1, 'tcc', 2, 15000, 3000, 0, '2', clock_timestamp(), clock_timestamp() + interval '30 minutes', false, true)`;
      } finally {
        await sql.end({ timeout: 5 });
      }
      await expect(
        repository.transition({
          orderId: '11111111-1111-4111-8111-111111111111',
          action: 'confirm',
          summaryVersion: summary.version,
          idempotencyKey: 'shipping-confirm-2',
        }),
      ).rejects.toMatchObject({ code: 'shipping_quote_stale' });
    } finally {
      await database.close();
    }
  });

  it('allows only one shipping confirmation for the last available pair', async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`INSERT INTO sales_orders (id, reference_id, size, quantity, customer_name, customer_phone, address, locality_carrier_code, locality_department, locality_name) VALUES ('44444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222', 37, 1, 'Ana Pérez', '+573001234567', 'Calle 4 # 5-6', '05001000', 'Antioquia', 'Medellín')`;
      await sql`INSERT INTO shipping_quotes (id, order_id, draft_version, carrier, service_id, freight_cop, cash_on_delivery_cop, surcharge_cop, estimated_days, quoted_at, expires_at, recommended, selected) VALUES ('55555555-5555-4555-8555-555555555555', '44444444-4444-4444-8444-444444444444', 1, 'envia', 12, 13368, 3000, 600, '1', clock_timestamp(), clock_timestamp() + interval '30 minutes', true, true)`;
    } finally {
      await sql.end({ timeout: 5 });
    }
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresOrderRepository(database);
    try {
      const first = await repository.createSummary(
        '11111111-1111-4111-8111-111111111111',
      );
      const second = await repository.createSummary(
        '44444444-4444-4444-8444-444444444444',
      );
      const results = await Promise.allSettled([
        repository.transition({
          orderId: '11111111-1111-4111-8111-111111111111',
          action: 'confirm',
          summaryVersion: first.version,
          idempotencyKey: 'race-first',
        }),
        repository.transition({
          orderId: '44444444-4444-4444-8444-444444444444',
          action: 'confirm',
          summaryVersion: second.version,
          idempotencyKey: 'race-second',
        }),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
      const check = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [stock] = await check<
          { reserved_quantity: number }[]
        >`SELECT reserved_quantity FROM catalog_stock`;
        const [jobs] = await check<
          { count: number }[]
        >`SELECT count(*)::int AS count FROM shipping_guide_jobs`;
        expect(stock?.reserved_quantity).toBe(1);
        expect(jobs?.count).toBe(1);
      } finally {
        await check.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });
});
