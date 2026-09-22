import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { AlertService } from '../src/modules/alerts/alert-service.js';
import { PostgresAlertRepository } from '../src/modules/alerts/postgres-alert-repository.js';
import { DefaultCatalogService } from '../src/modules/catalog/catalog-service.js';
import { PostgresCatalogRepository } from '../src/modules/catalog/postgres-catalog-repository.js';
import { PostgresConversationMenuRepository } from '../src/modules/conversations/postgres-conversation-menu-repository.js';
import { PostgresConversationRepository } from '../src/modules/conversations/postgres-conversation-repository.js';
import { WhatsAppSalesService } from '../src/modules/conversations/whatsapp-sales-service.js';
import { LocalityService } from '../src/modules/localities/locality-service.js';
import { PostgresLocalityRepository } from '../src/modules/localities/postgres-locality-repository.js';
import { OrderService } from '../src/modules/orders/order-service.js';
import { PostgresOrderRepository } from '../src/modules/orders/postgres-order-repository.js';
import { ShippingUncertainError } from '../src/modules/shipping/99envios-client.js';
import { GuideDeliveryService } from '../src/modules/shipping/guide-delivery-service.js';
import { LocalGuidePdfStorage } from '../src/modules/shipping/local-guide-pdf-storage.js';
import { PostgresShippingGuideJobRepository } from '../src/modules/shipping/postgres-shipping-guide-job-repository.js';
import { PostgresShippingQuoteRepository } from '../src/modules/shipping/postgres-shipping-quote-repository.js';
import { ShippingGuideService } from '../src/modules/shipping/shipping-guide-service.js';
import { ShippingGuideWorker } from '../src/modules/shipping/shipping-guide-worker.js';
import { ShippingQuoteService } from '../src/modules/shipping/shipping-quote-service.js';
import { PostgresOutboundRepository } from '../src/modules/whatsapp/postgres-outbound-repository.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const databaseUrl = requireTestDatabaseUrl();
const referenceId = '11111111-1111-4111-8111-111111111111';

describe('critical concurrency acceptance', () => {
  beforeAll(() => runMigrations(databaseUrl));
  beforeEach(async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`
        TRUNCATE TABLE whatsapp_outbound_messages, whatsapp_catalog_menu_options,
          whatsapp_catalog_menus, whatsapp_conversation_events, whatsapp_conversations,
          order_confirmations, reservation_movements, order_status_events, order_summaries,
          shipping_guide_jobs, shipping_quotes, sales_orders, catalog_stock, inventory_movements,
          catalog_references, shipping_localities, shipping_carrier_rules, shipping_preferences,
          bot_flow_versions, bot_flow_drafts, owner_alert_deliveries, owner_alerts,
          inventory_closures CASCADE
      `;
      await sql`
        INSERT INTO catalog_references
          (id, code, model_name, color, price_cop, photo_storage_key,
           photo_mime_type, photo_byte_size, photo_sha256, active)
        VALUES (${referenceId}, '01', 'Tenis Camila',
          'Negro', 120000, 'catalog/01.jpg', 'image/jpeg', 3,
          repeat('a', 64), true)
      `;
      await sql`
        INSERT INTO catalog_stock (reference_id, size, physical_quantity, reserved_quantity)
        VALUES (${referenceId}, 37, 1, 0)
      `;
      await sql`
        INSERT INTO shipping_localities
          (carrier_code, department, locality, normalized_name, source_sha256)
        VALUES ('05001000', 'Antioquia', 'Medellín', 'medellin', repeat('b', 64))
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('does not auto-retry an uncertain 99envíos pre-shipment into a duplicate guide', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const catalogRepository = new PostgresCatalogRepository(database);
    const orderService = new OrderService(
      new PostgresOrderRepository(database),
      (id) => catalogRepository.findReferenceById(id),
    );
    const jobs = new PostgresShippingGuideJobRepository(database);
    const createPreShipment = vi.fn(async () => {
      throw new ShippingUncertainError();
    });
    const sales = new WhatsAppSalesService(
      new PostgresConversationRepository(database),
      new DefaultCatalogService(catalogRepository, {
        save: async () => {
          throw new Error('unused');
        },
        read: async () => new Uint8Array(),
        delete: async () => undefined,
      }),
      new PostgresConversationMenuRepository(database),
      new PostgresOutboundRepository(database),
      orderService,
      new LocalityService(new PostgresLocalityRepository(database)),
      jobs,
      new ShippingQuoteService(
        new PostgresShippingQuoteRepository(database),
        orderService,
        {
          quote: async () => [
            {
              carrier: 'envia',
              freightCop: 13_368,
              cashOnDeliveryCop: 3_000,
              surchargeCop: 600,
              serviceId: 12,
              estimatedDays: '1',
            },
          ],
        },
      ),
    );
    try {
      for (const [index, text] of [
        'hola',
        '37',
        '01',
        'Camila Pérez',
        '3158191776',
        'Antioquia',
        'Medellín',
        'Calle 1 # 2-3',
        'ninguna',
        'confirmar',
      ].entries()) {
        await sales.process({
          whatsappMessageId: `wamid.uncertain-${index}`,
          customerPhone: '+573158191776',
          text,
        });
      }
      const worker = new ShippingGuideWorker(
        jobs,
        orderService,
        { createPreShipment },
        new AlertService(new PostgresAlertRepository(database)),
      );
      expect(await worker.runOnce()).toBe(true);
      expect(createPreShipment).toHaveBeenCalledTimes(1);
      expect(await worker.runOnce()).toBe(false);
      expect(createPreShipment).toHaveBeenCalledTimes(1);
      const sql = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const rows = await sql<{ status: string; count: number }[]>`
          SELECT status, count(*)::int AS count
          FROM shipping_guide_jobs
          GROUP BY status
        `;
        expect(rows).toEqual([{ status: 'uncertain', count: 1 }]);
        expect(await jobs.claimNext()).toBeNull();
        const [alerts] = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM owner_alerts WHERE type = 'guide_uncertain'
        `;
        expect(alerts?.count).toBe(1);
      } finally {
        await sql.end({ timeout: 5 });
      }
      const orders = (await database.orm.execute(
        'SELECT id FROM sales_orders LIMIT 1',
      )) as unknown as Array<{ id: string }>;
      await jobs.enqueue(orders[0]!.id);
      expect(await worker.runOnce()).toBe(false);
      expect(createPreShipment).toHaveBeenCalledTimes(1);
    } finally {
      await database.close();
    }
  });

  it('marks provider outage as failed without creating a second guide job', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const catalogRepository = new PostgresCatalogRepository(database);
    const orderService = new OrderService(
      new PostgresOrderRepository(database),
      (id) => catalogRepository.findReferenceById(id),
    );
    const jobs = new PostgresShippingGuideJobRepository(database);
    const createPreShipment = vi.fn(async () => {
      throw Object.assign(new Error('upstream unavailable'), {
        name: 'ProviderOutageError',
      });
    });
    const sales = new WhatsAppSalesService(
      new PostgresConversationRepository(database),
      new DefaultCatalogService(catalogRepository, {
        save: async () => {
          throw new Error('unused');
        },
        read: async () => new Uint8Array(),
        delete: async () => undefined,
      }),
      new PostgresConversationMenuRepository(database),
      new PostgresOutboundRepository(database),
      orderService,
      new LocalityService(new PostgresLocalityRepository(database)),
      jobs,
      new ShippingQuoteService(
        new PostgresShippingQuoteRepository(database),
        orderService,
        {
          quote: async () => [
            {
              carrier: 'envia',
              freightCop: 13_368,
              cashOnDeliveryCop: 3_000,
              surchargeCop: 600,
              serviceId: 12,
              estimatedDays: '1',
            },
          ],
        },
      ),
    );
    try {
      for (const [index, text] of [
        'hola',
        '37',
        '01',
        'Camila Pérez',
        '3158191776',
        'Antioquia',
        'Medellín',
        'Calle 1 # 2-3',
        'ninguna',
        'confirmar',
      ].entries()) {
        await sales.process({
          whatsappMessageId: `wamid.outage-${index}`,
          customerPhone: '+573158191776',
          text,
        });
      }
      const worker = new ShippingGuideWorker(jobs, orderService, {
        createPreShipment,
      });
      expect(await worker.runOnce()).toBe(true);
      expect(await worker.runOnce()).toBe(false);
      expect(createPreShipment).toHaveBeenCalledTimes(1);
      const sql = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [job] = await sql<{ status: string; error_code: string }[]>`
          SELECT status, error_code FROM shipping_guide_jobs
        `;
        expect(job).toMatchObject({
          status: 'failed',
          error_code: 'ProviderOutageError',
        });
      } finally {
        await sql.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });

  it('blocks confirmation on expired quote and completes PDF retry without duplicate documents', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const catalogRepository = new PostgresCatalogRepository(database);
    const orderService = new OrderService(
      new PostgresOrderRepository(database),
      (id) => catalogRepository.findReferenceById(id),
    );
    const jobs = new PostgresShippingGuideJobRepository(database);
    const getGuidePdf = vi
      .fn()
      .mockRejectedValueOnce(new Error('pdf_transient'))
      .mockResolvedValue(new TextEncoder().encode('%PDF-1.4'));
    const createPreShipment = vi.fn(async () => ({
      preShipmentNumber: '954101306199',
      freightCop: 11_596,
    }));
    const sales = new WhatsAppSalesService(
      new PostgresConversationRepository(database),
      new DefaultCatalogService(catalogRepository, {
        save: async () => {
          throw new Error('unused');
        },
        read: async () => new Uint8Array(),
        delete: async () => undefined,
      }),
      new PostgresConversationMenuRepository(database),
      new PostgresOutboundRepository(database),
      orderService,
      new LocalityService(new PostgresLocalityRepository(database)),
      jobs,
      new ShippingQuoteService(
        new PostgresShippingQuoteRepository(database),
        orderService,
        {
          quote: async () => [
            {
              carrier: 'envia',
              freightCop: 13_368,
              cashOnDeliveryCop: 3_000,
              surchargeCop: 600,
              serviceId: 12,
              estimatedDays: '1',
            },
          ],
        },
      ),
    );
    const root = await mkdtemp(path.join(tmpdir(), 'camila-pdf-retry-'));
    try {
      for (const [index, text] of [
        'hola',
        '37',
        '01',
        'Camila Pérez',
        '3158191776',
        'Antioquia',
        'Medellín',
        'Calle 1 # 2-3',
        'ninguna',
        'confirmar',
      ].entries()) {
        if (index === 9) {
          const expirySql = postgres(databaseUrl, { max: 1, prepare: false });
          try {
            await expirySql`
              UPDATE shipping_quotes
              SET quoted_at = now() - interval '2 minutes',
                  expires_at = now() - interval '1 minute'
            `;
          } finally {
            await expirySql.end({ timeout: 5 });
          }
        }
        await sales.process({
          whatsappMessageId: `wamid.pdf-retry-${index}`,
          customerPhone: '+573158191776',
          text,
        });
      }
      const pending = await database.orm.execute<{ status: string }>(
        'SELECT status FROM sales_orders',
      );
      expect(pending[0]?.status).toBe('draft');
      await sales.process({
        whatsappMessageId: 'wamid.pdf-retry-refresh',
        customerPhone: '+573158191776',
        text: 'confirmar',
      });
      await sales.process({
        whatsappMessageId: 'wamid.pdf-retry-final',
        customerPhone: '+573158191776',
        text: 'confirmar',
      });
      const worker = new ShippingGuideWorker(jobs, orderService, {
        createPreShipment,
      });
      expect(await worker.runOnce()).toBe(true);
      const [order] = await database.orm.execute<{ id: string }>(
        'SELECT id FROM sales_orders',
      );
      const guides = new ShippingGuideService(
        jobs,
        { getGuidePdf },
        new LocalGuidePdfStorage(root),
      );
      await expect(guides.fetchPdf(order!.id)).rejects.toThrow('pdf_transient');
      const pdf = await guides.fetchPdf(order!.id);
      expect(new TextDecoder().decode(pdf.bytes.subarray(0, 5))).toBe('%PDF-');
      const delivery = new GuideDeliveryService(
        database,
        guides,
        new PostgresOutboundRepository(database),
      );
      await Promise.all([delivery.runOnce(), delivery.runOnce()]);
      const documents = await database.orm.execute(
        "SELECT id FROM whatsapp_outbound_messages WHERE message_type = 'document'",
      );
      expect(documents).toHaveLength(1);
      expect(getGuidePdf).toHaveBeenCalledTimes(2);
      expect(createPreShipment).toHaveBeenCalledTimes(1);
    } finally {
      await database.close();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('hands conversation to human and cancels pending bot outbound', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const outbound = new PostgresOutboundRepository(database);
    const service = new WhatsAppSalesService(
      new PostgresConversationRepository(database),
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
    );
    try {
      await service.process({
        whatsappMessageId: 'wamid.handoff-hello',
        customerPhone: '573000000099',
        text: 'hola',
      });
      await service.process({
        whatsappMessageId: 'wamid.handoff-asesora',
        customerPhone: '573000000099',
        text: 'asesora',
      });
      const message = await outbound.claimNext();
      expect(message?.textBody).toContain('asesora');
      expect(await outbound.claimNext()).toBeNull();
      const [conversation] = await database.orm.execute<{ mode: string }>(
        'SELECT mode FROM whatsapp_conversations',
      );
      expect(conversation?.mode).toBe('human');
    } finally {
      await database.close();
    }
  });
});
