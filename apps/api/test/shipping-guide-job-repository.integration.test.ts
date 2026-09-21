import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { PostgresShippingGuideJobRepository } from '../src/modules/shipping/postgres-shipping-guide-job-repository.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const databaseUrl = requireTestDatabaseUrl();

describe('shipping guide jobs', () => {
  beforeAll(() => runMigrations(databaseUrl));
  beforeEach(async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`TRUNCATE TABLE shipping_guide_jobs, sales_orders, catalog_references CASCADE`;
      await sql`
        INSERT INTO catalog_references (id, code, model_name, color, price_cop)
        VALUES ('22222222-2222-4222-8222-222222222222', '01', 'Tenis', 'Negro', 120000)
      `;
      await sql`
        INSERT INTO sales_orders (id, reference_id, size, quantity)
        VALUES ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 37, 1)
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('creates only one active job for a confirmed order', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresShippingGuideJobRepository(database);
    try {
      const orderId = '11111111-1111-4111-8111-111111111111';
      const [first, replay] = await Promise.all([
        repository.enqueue(orderId),
        repository.enqueue(orderId),
      ]);
      expect(replay.id).toBe(first.id);
      await expect(repository.claimNext()).resolves.toMatchObject({
        id: first.id,
        orderId,
        status: 'processing',
      });
      await repository.markUncertain(first.id);
      await expect(repository.claimNext()).resolves.toBeNull();
    } finally {
      await database.close();
    }
  });

  it('claims the final COD value from the immutable selected quote', async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`
        INSERT INTO shipping_quotes
          (id, order_id, draft_version, carrier, service_id, freight_cop,
           cash_on_delivery_cop, surcharge_cop, estimated_days, quoted_at,
           expires_at, recommended, selected)
        VALUES ('33333333-3333-4333-8333-333333333333',
          '11111111-1111-4111-8111-111111111111', 1, 'envia', 12,
          13368, 3000, 600, '1', clock_timestamp(),
          clock_timestamp() + interval '30 minutes', true, true)
      `;
      await sql`
        INSERT INTO shipping_guide_jobs (order_id, quote_id, carrier)
        VALUES ('11111111-1111-4111-8111-111111111111',
          '33333333-3333-4333-8333-333333333333', 'envia')
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
    const database = createPostgresDatabase(databaseUrl);
    try {
      await expect(
        new PostgresShippingGuideJobRepository(database).claimNext(),
      ).resolves.toMatchObject({ collectionValueCop: 136968 });
    } finally {
      await database.close();
    }
  });

  it('does not claim pending jobs when the order is not confirmed', async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`
        INSERT INTO shipping_guide_jobs (order_id, carrier)
        VALUES ('11111111-1111-4111-8111-111111111111', 'envia')
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
    const database = createPostgresDatabase(databaseUrl);
    try {
      await expect(
        new PostgresShippingGuideJobRepository(database).claimNext(),
      ).resolves.toBeNull();
    } finally {
      await database.close();
    }
  });
});
