import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { PostgresDashboardRepository } from '../src/modules/dashboard/postgres-dashboard-repository.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const databaseUrl = requireTestDatabaseUrl();

describe('PostgresDashboardRepository', () => {
  beforeAll(() => runMigrations(databaseUrl));

  beforeEach(async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`TRUNCATE TABLE inventory_closures, shipping_guide_jobs, shipping_quotes, order_confirmations, order_summaries, reservation_movements, order_status_events, sales_orders, whatsapp_conversations, catalog_stock, catalog_references CASCADE`;
      await sql`INSERT INTO catalog_references (id, code, model_name, color, price_cop, active) VALUES ('11111111-1111-4111-8111-111111111111', '01', 'Tenis', 'Negro', 120000, true)`;
      await sql`INSERT INTO catalog_stock (reference_id, size, physical_quantity, reserved_quantity) VALUES ('11111111-1111-4111-8111-111111111111', 37, 2, 1)`;
      await sql`INSERT INTO sales_orders (id, status, reference_id, size, quantity, latest_summary_version, confirmed_summary_version, created_at, updated_at) VALUES
        ('22222222-2222-4222-8222-222222222222', 'confirmed', '11111111-1111-4111-8111-111111111111', 37, 1, 1, 1, '2026-09-10T13:00:00Z', '2026-09-10T13:00:00Z'),
        ('33333333-3333-4333-8333-333333333333', 'draft', '11111111-1111-4111-8111-111111111111', 37, 1, 1, NULL, '2026-09-10T14:00:00Z', '2026-09-10T14:00:00Z')`;
      await sql`INSERT INTO order_summaries (order_id, version, draft_version, snapshot, created_at) VALUES ('22222222-2222-4222-8222-222222222222', 1, 1, '{"totalCop":136000}', '2026-09-10T13:10:00Z')`;
      await sql`INSERT INTO order_confirmations (order_id, summary_version, idempotency_key, created_at) VALUES ('22222222-2222-4222-8222-222222222222', 1, 'dashboard-confirm', '2026-09-10T13:15:00Z')`;
      await sql`INSERT INTO order_status_events (order_id, previous_status, next_status, created_at) VALUES ('22222222-2222-4222-8222-222222222222', 'draft', 'confirmed', '2026-09-10T13:15:00Z')`;
      await sql`INSERT INTO reservation_movements (order_id, reference_id, size, previous_reserved_quantity, new_reserved_quantity, delta, reason, created_at) VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 37, 0, 1, 1, 'confirmed', '2026-09-10T13:15:00Z')`;
      await sql`INSERT INTO shipping_guide_jobs (order_id, status, carrier, created_at, updated_at) VALUES ('22222222-2222-4222-8222-222222222222', 'created', 'envia', '2026-09-10T13:20:00Z', '2026-09-10T13:20:00Z')`;
      await sql`INSERT INTO whatsapp_conversations (customer_phone, state, mode, last_inbound_message_at, created_at, updated_at) VALUES ('+573001234567', 'awaiting_size', 'human', '2026-09-10T14:00:00Z', '2026-09-10T14:00:00Z', '2026-09-10T14:00:00Z')`;
      await sql`INSERT INTO inventory_closures (business_date, version, profile, status, movement_count, total_units, checksum, csv_content) VALUES ('2026-09-10', 1, 'adjustments', 'generated', 0, 0, ${'b'.repeat(64)}, 'reference_code,size,delta')`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('returns real queue and Bogotá-day counts', async () => {
    const database = createPostgresDatabase(databaseUrl);
    try {
      const repository = new PostgresDashboardRepository(database);
      const result = await repository.getSummary(
        new Date('2026-09-10T05:00:00Z'),
        new Date('2026-09-11T05:00:00Z'),
      );

      expect(result).toEqual({
        queues: {
          conversations: 1,
          guideIncidents: 0,
          readyToDispatch: 1,
          awaitingConfirmation: 1,
          closurePending: true,
          lowStockReferences: 1,
          integrationFailures: 0,
        },
        today: {
          newConversations: 1,
          confirmedOrders: 1,
          dispatchedOrders: 0,
          codValueCop: 136000,
          guidesCreated: 1,
          reservedUnits: 1,
          averageFirstResponseSeconds: null,
        },
      });
    } finally {
      await database.close();
    }
  });
});
