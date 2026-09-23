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
import { seedSelectedShippingQuote } from './helpers/seed-selected-shipping-quote.js';

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
      await seedSelectedShippingQuote(
        databaseUrl,
        draft.id,
        draft.draftVersion,
      );
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
      const guideSql = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        await guideSql`
          UPDATE shipping_guide_jobs
          SET status = 'created', pre_shipment_number = '954101306101'
          WHERE order_id = ${draft.id}
        `;
      } finally {
        await guideSql.end({ timeout: 5 });
      }
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

  it('does not reserve stock or queue a guide for a forbidden selected carrier', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const service = new OrderService(
      new PostgresOrderRepository(database),
      async () => ({
        id: '22222222-2222-4222-8222-222222222222',
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
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      const draft = await service.create({
        referenceId: '22222222-2222-4222-8222-222222222222',
        size: '37',
        quantity: 1,
        customerName: 'Ana Gómez',
        customerPhone: '3001234567',
        address: 'Calle 1 # 2-3',
        localityCarrierCode: '11001',
        adminUserId: adminId,
      });
      const initialPolicy = JSON.stringify({
        preferredCarrier: null,
        fallbackPolicy: 'allow',
        offerMode: 'economy_only',
        protectedInsurance: 'standard',
      });
      await sql`
        INSERT INTO shipping_quotes
          (order_id, draft_version, carrier, service_id, freight_cop,
           cash_on_delivery_cop, surcharge_cop, estimated_days,
           quoted_at, expires_at, recommended, selected, policy_snapshot)
        VALUES
          (${draft.id}, ${draft.draftVersion}, 'envia', 12, 10000,
           2000, 0, '1', clock_timestamp(),
           clock_timestamp() + interval '30 minutes',
           true, true, ${initialPolicy}::jsonb)
      `;
      const summary = await service.createSummary(draft.id);
      const forbiddenPolicy = JSON.stringify({
        preferredCarrier: 'tcc',
        fallbackPolicy: 'block',
        offerMode: 'economy_only',
        protectedInsurance: 'standard',
        allowedCarriers: ['tcc'],
      });
      await sql`
        UPDATE shipping_quotes
        SET policy_snapshot = ${forbiddenPolicy}::jsonb
        WHERE order_id = ${draft.id}
      `;

      await expect(
        service.transition({
          orderId: draft.id,
          action: 'confirm',
          summaryVersion: summary.version,
          idempotencyKey: 'forbidden-quote-confirm-0001',
          adminUserId: adminId,
        }),
      ).rejects.toMatchObject({ code: 'shipping_quote_not_allowed' });

      const [state] = await sql<
        { reserved: number; jobs: number; status: string }[]
      >`
        SELECT
          (SELECT reserved_quantity FROM catalog_stock LIMIT 1)::int AS reserved,
          (SELECT count(*)::int FROM shipping_guide_jobs WHERE order_id = ${draft.id}) AS jobs,
          (SELECT status FROM sales_orders WHERE id = ${draft.id}) AS status
      `;
      expect(state).toEqual({ reserved: 0, jobs: 0, status: 'draft' });
    } finally {
      await sql.end({ timeout: 5 });
      await database.close();
    }
  });

  it('does not summarize a selected carrier forbidden by its quote policy', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const service = new OrderService(
      new PostgresOrderRepository(database),
      async () => ({
        id: '22222222-2222-4222-8222-222222222222',
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
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      const draft = await service.create({
        referenceId: '22222222-2222-4222-8222-222222222222',
        size: '37',
        quantity: 1,
        customerName: 'Ana Gómez',
        customerPhone: '3001234567',
        address: 'Calle 1 # 2-3',
        localityCarrierCode: '11001',
        adminUserId: adminId,
      });
      const forbiddenPolicy = JSON.stringify({
        preferredCarrier: 'tcc',
        fallbackPolicy: 'block',
        offerMode: 'economy_only',
        protectedInsurance: 'standard',
        allowedCarriers: ['tcc'],
      });
      await sql`
        INSERT INTO shipping_quotes
          (order_id, draft_version, carrier, service_id, freight_cop,
           cash_on_delivery_cop, surcharge_cop, estimated_days,
           quoted_at, expires_at, recommended, selected, policy_snapshot)
        VALUES
          (${draft.id}, ${draft.draftVersion}, 'envia', 12, 10000,
           2000, 0, '1', clock_timestamp(),
           clock_timestamp() + interval '30 minutes',
           true, true, ${forbiddenPolicy}::jsonb)
      `;

      await expect(service.createSummary(draft.id)).rejects.toMatchObject({
        code: 'shipping_quote_not_allowed',
      });
      const [state] = await sql<
        { reserved: number; jobs: number; summaries: number }[]
      >`
        SELECT
          (SELECT reserved_quantity FROM catalog_stock LIMIT 1)::int AS reserved,
          (SELECT count(*)::int FROM shipping_guide_jobs WHERE order_id = ${draft.id}) AS jobs,
          (SELECT count(*)::int FROM order_summaries WHERE order_id = ${draft.id}) AS summaries
      `;
      expect(state).toEqual({ reserved: 0, jobs: 0, summaries: 0 });
    } finally {
      await sql.end({ timeout: 5 });
      await database.close();
    }
  });

  it('does not confirm or reserve an order without a shipping quote', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const service = new OrderService(
      new PostgresOrderRepository(database),
      async () => ({
        id: '22222222-2222-4222-8222-222222222222',
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
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      const draft = await service.create({
        referenceId: '22222222-2222-4222-8222-222222222222',
        size: '37',
        quantity: 1,
        customerName: 'Ana Gómez',
        customerPhone: '3001234567',
        address: 'Calle 1 # 2-3',
        localityCarrierCode: '11001',
        adminUserId: adminId,
      });
      const summary = await service.createSummary(draft.id);
      expect(summary.snapshot.shippingPending).toBe(true);

      await expect(
        service.transition({
          orderId: draft.id,
          action: 'confirm',
          summaryVersion: summary.version,
          idempotencyKey: 'quote-required-confirm-0001',
          adminUserId: adminId,
        }),
      ).rejects.toMatchObject({ code: 'shipping_quote_required' });
      const [state] = await sql<
        { reserved: number; jobs: number; status: string }[]
      >`
        SELECT
          (SELECT reserved_quantity FROM catalog_stock LIMIT 1)::int AS reserved,
          (SELECT count(*)::int FROM shipping_guide_jobs WHERE order_id = ${draft.id}) AS jobs,
          (SELECT status FROM sales_orders WHERE id = ${draft.id}) AS status
      `;
      expect(state).toEqual({ reserved: 0, jobs: 0, status: 'draft' });
    } finally {
      await sql.end({ timeout: 5 });
      await database.close();
    }
  });

  it('blocks dispatch until a shipping guide has been created', async () => {
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
        quantity: 1,
        customerName: 'Ana Gómez',
        customerPhone: '3001234567',
        address: 'Calle 1 # 2-3',
        localityCarrierCode: '11001',
        adminUserId: adminId,
      });
      await seedSelectedShippingQuote(
        databaseUrl,
        draft.id,
        draft.draftVersion,
      );
      const summary = await service.createSummary(draft.id);
      await service.transition({
        orderId: draft.id,
        action: 'confirm',
        summaryVersion: summary.version,
        idempotencyKey: 'confirm-order-no-guide',
        adminUserId: adminId,
      });
      await expect(
        service.transition({
          orderId: draft.id,
          action: 'dispatch',
          adminUserId: adminId,
        }),
      ).rejects.toMatchObject({ code: 'shipping_guide_required' });
    } finally {
      await database.close();
    }
  });

  it('invalidates a pending shipping guide job when a confirmed order is cancelled', async () => {
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
        quantity: 1,
        customerName: 'Ana Gómez',
        customerPhone: '3001234567',
        address: 'Calle 1 # 2-3',
        localityCarrierCode: '11001',
        adminUserId: adminId,
      });
      await seedSelectedShippingQuote(
        databaseUrl,
        draft.id,
        draft.draftVersion,
      );
      const summary = await service.createSummary(draft.id);
      await service.transition({
        orderId: draft.id,
        action: 'confirm',
        summaryVersion: summary.version,
        idempotencyKey: 'confirm-order-cancel-guide',
        adminUserId: adminId,
      });
      await service.transition({
        orderId: draft.id,
        action: 'cancel',
        adminUserId: adminId,
      });
      const checkSql = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [job] = await checkSql<
          { status: string; error_code: string | null }[]
        >`SELECT status, error_code FROM shipping_guide_jobs WHERE order_id = ${draft.id}`;
        expect(job).toEqual({
          status: 'failed',
          error_code: 'order_cancelled',
        });
      } finally {
        await checkSql.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });
});
