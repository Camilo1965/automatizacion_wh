import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { PostgresShippingQuoteRepository } from '../src/modules/shipping/postgres-shipping-quote-repository.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const databaseUrl = requireTestDatabaseUrl();

describe('shipping quote persistence', () => {
  beforeAll(() => runMigrations(databaseUrl));
  beforeEach(async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`TRUNCATE TABLE shipping_guide_jobs, shipping_quotes, shipping_carrier_rules, sales_orders, catalog_references CASCADE`;
      await sql`INSERT INTO catalog_references (id, code, model_name, color, price_cop) VALUES ('22222222-2222-4222-8222-222222222222', '01', 'Tenis', 'Negro', 120000)`;
      await sql`INSERT INTO sales_orders (id, reference_id, size, quantity) VALUES ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 37, 1)`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('replaces the current version and selects exactly one quote', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresShippingQuoteRepository(database);
    const now = new Date();
    try {
      await repository.upsertCarrierRule('05001000', 'tcc');
      await expect(repository.preferredCarrier('05001000')).resolves.toBe(
        'tcc',
      );
      const rows = await repository.replaceQuotes({
        orderId: '11111111-1111-4111-8111-111111111111',
        draftVersion: 1,
        quotes: [
          {
            carrier: 'envia',
            serviceId: 1,
            freightCop: 10000,
            cashOnDeliveryCop: 2000,
            surchargeCop: 0,
            estimatedDays: '1',
          },
          {
            carrier: 'tcc',
            serviceId: 2,
            freightCop: 15000,
            cashOnDeliveryCop: 3000,
            surchargeCop: 0,
            estimatedDays: '2',
          },
        ],
        recommendedCarrier: 'tcc',
        quotedAt: now,
        expiresAt: new Date(now.getTime() + 1_800_000),
      });
      expect(
        rows.filter((row) => row.selected).map((row) => row.carrier),
      ).toEqual(['tcc']);
      const envia = rows.find((row) => row.carrier === 'envia')!;
      const selected = await repository.selectQuote(
        '11111111-1111-4111-8111-111111111111',
        envia.id,
        now,
      );
      expect(
        selected.filter((row) => row.selected).map((row) => row.carrier),
      ).toEqual(['envia']);
    } finally {
      await database.close();
    }
  });
});
