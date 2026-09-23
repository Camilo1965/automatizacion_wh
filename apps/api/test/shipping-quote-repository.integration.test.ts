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
      await sql`TRUNCATE TABLE shipping_preferences, shipping_guide_jobs, shipping_quotes, shipping_carrier_rules, sales_orders, catalog_references CASCADE`;
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
      await repository.upsertCarrierRule('05002000', 'tcc');
      await expect(repository.preferredCarrier('05002000')).resolves.toBe(
        'tcc',
      );
      await repository.upsertShippingPolicy('05002000', {
        preferredCarrier: 'tcc',
        fallbackPolicy: 'block',
        offerMode: 'protected_only',
        protectedInsurance: 'plus',
      });
      await expect(
        repository.shippingPolicy('05002000'),
      ).resolves.toMatchObject({
        preferredCarrier: 'tcc',
        fallbackPolicy: 'block',
        offerMode: 'protected_only',
        protectedInsurance: 'plus',
      });
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
        policy: {
          preferredCarrier: 'tcc',
          fallbackPolicy: 'allow',
          offerMode: 'economy_only',
          protectedInsurance: 'standard',
        },
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

  it('rejects a manually selected carrier outside the quote policy', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresShippingQuoteRepository(database);
    const now = new Date();
    try {
      const rows = await repository.replaceQuotes({
        orderId: '11111111-1111-4111-8111-111111111111',
        draftVersion: 1,
        quotes: [
          {
            carrier: 'envia',
            serviceId: 1,
            freightCop: 10_000,
            cashOnDeliveryCop: 2_000,
            surchargeCop: 0,
            estimatedDays: '1',
          },
          {
            carrier: 'tcc',
            serviceId: 2,
            freightCop: 15_000,
            cashOnDeliveryCop: 3_000,
            surchargeCop: 0,
            estimatedDays: '2',
          },
        ],
        recommendedCarrier: 'tcc',
        policy: {
          preferredCarrier: 'tcc',
          fallbackPolicy: 'block',
          offerMode: 'economy_only',
          protectedInsurance: 'standard',
          allowedCarriers: ['tcc'],
        },
        quotedAt: now,
        expiresAt: new Date(now.getTime() + 1_800_000),
      });
      const envia = rows.find((row) => row.carrier === 'envia');
      expect(envia).toBeDefined();

      await expect(
        repository.selectQuote(
          '11111111-1111-4111-8111-111111111111',
          envia!.id,
          now,
        ),
      ).rejects.toMatchObject({ code: 'shipping_quote_not_allowed' });

      const shipping = await repository.getShipping(
        '11111111-1111-4111-8111-111111111111',
      );
      expect(shipping.quotes.map((row) => row.carrier)).toEqual(['tcc']);
      expect(
        shipping.quotes.filter((row) => row.selected).map((row) => row.carrier),
      ).toEqual(['tcc']);
    } finally {
      await database.close();
    }
  });

  it('requires a new quote before manually selecting a legacy offer', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresShippingQuoteRepository(database);
    const now = new Date();
    try {
      const rows = await repository.replaceQuotes({
        orderId: '11111111-1111-4111-8111-111111111111',
        draftVersion: 1,
        quotes: [
          {
            carrier: 'tcc',
            serviceId: 1,
            freightCop: 15_000,
            cashOnDeliveryCop: 3_000,
            surchargeCop: 0,
            estimatedDays: '2',
          },
          {
            carrier: 'envia',
            serviceId: 2,
            freightCop: 10_000,
            cashOnDeliveryCop: 2_000,
            surchargeCop: 0,
            estimatedDays: '1',
          },
        ],
        recommendedCarrier: 'tcc',
        quotedAt: now,
        expiresAt: new Date(now.getTime() + 1_800_000),
      });
      const envia = rows.find((row) => row.carrier === 'envia');
      expect(envia).toBeDefined();

      await expect(
        repository.selectQuote(
          '11111111-1111-4111-8111-111111111111',
          envia!.id,
          now,
        ),
      ).rejects.toMatchObject({ code: 'shipping_quote_requires_requote' });
      const shipping = await repository.getShipping(
        '11111111-1111-4111-8111-111111111111',
      );
      expect(shipping.quotes).toEqual([]);
    } finally {
      await database.close();
    }
  });

  it('prevents simultaneous owner edits from overwriting a saved policy revision', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresShippingQuoteRepository(database);
    try {
      const policy = {
        preferredCarrier: null,
        fallbackPolicy: 'allow' as const,
        offerMode: 'economy_only' as const,
        protectedInsurance: 'standard' as const,
        revision: 0,
      };
      const results = await Promise.allSettled([
        repository.setDefaultShippingPolicy(policy),
        repository.setDefaultShippingPolicy(policy),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(1);
      expect(await repository.defaultShippingPolicy()).toMatchObject({
        revision: 1,
      });
    } finally {
      await database.close();
    }
  });
});
