import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { DefaultCatalogService } from '../src/modules/catalog/catalog-service.js';
import { PostgresCatalogRepository } from '../src/modules/catalog/postgres-catalog-repository.js';
import { PostgresConversationMenuRepository } from '../src/modules/conversations/postgres-conversation-menu-repository.js';
import { PostgresConversationRepository } from '../src/modules/conversations/postgres-conversation-repository.js';
import { WhatsAppSalesService } from '../src/modules/conversations/whatsapp-sales-service.js';
import { LocalityService } from '../src/modules/localities/locality-service.js';
import { PostgresLocalityRepository } from '../src/modules/localities/postgres-locality-repository.js';
import { OrderService } from '../src/modules/orders/order-service.js';
import { PostgresOrderRepository } from '../src/modules/orders/postgres-order-repository.js';
import { PostgresOutboundRepository } from '../src/modules/whatsapp/postgres-outbound-repository.js';
import { PostgresShippingGuideJobRepository } from '../src/modules/shipping/postgres-shipping-guide-job-repository.js';
import { PostgresShippingQuoteRepository } from '../src/modules/shipping/postgres-shipping-quote-repository.js';
import { LocalGuidePdfStorage } from '../src/modules/shipping/local-guide-pdf-storage.js';
import { ShippingGuideService } from '../src/modules/shipping/shipping-guide-service.js';
import { ShippingGuideWorker } from '../src/modules/shipping/shipping-guide-worker.js';
import { ShippingQuoteService } from '../src/modules/shipping/shipping-quote-service.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const databaseUrl = requireTestDatabaseUrl();

describe('complete WhatsApp sale', () => {
  beforeAll(() => runMigrations(databaseUrl));
  beforeEach(async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`TRUNCATE TABLE whatsapp_outbound_messages, whatsapp_catalog_menu_options,
        whatsapp_catalog_menus, whatsapp_conversation_events, whatsapp_conversations,
        order_confirmations, reservation_movements, order_status_events, order_summaries,
        sales_orders, catalog_stock, inventory_movements, catalog_references,
        shipping_localities CASCADE`;
      await sql`
        INSERT INTO catalog_references
          (id, code, model_name, color, price_cop, photo_storage_key,
           photo_mime_type, photo_byte_size, photo_sha256, active)
        VALUES ('11111111-1111-4111-8111-111111111111', '01', 'Tenis Camila',
          'Negro', 120000, 'catalog/01.jpg', 'image/jpeg', 3,
          repeat('a', 64), true)
      `;
      await sql`
        INSERT INTO catalog_stock (reference_id, size, physical_quantity, reserved_quantity)
        VALUES ('11111111-1111-4111-8111-111111111111', 37, 1, 0)
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

  it('moves from welcome through explicit confirmation and reserves once', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const catalogRepository = new PostgresCatalogRepository(database);
    const orderService = new OrderService(
      new PostgresOrderRepository(database),
      (id) => catalogRepository.findReferenceById(id),
    );
    const service = new WhatsAppSalesService(
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
      new PostgresShippingGuideJobRepository(database),
    );
    const phone = '+573158191776';
    const messages = [
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
    ];
    try {
      for (const [index, text] of messages.entries()) {
        await service.process({
          whatsappMessageId: `wamid.flow-${index}`,
          customerPhone: phone,
          text,
        });
      }
      const sql = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [order] = await sql<{ status: string; customer_name: string }[]>`
          SELECT status, customer_name FROM sales_orders
        `;
        const [stock] = await sql<{ reserved_quantity: number }[]>`
          SELECT reserved_quantity FROM catalog_stock
        `;
        const [confirmation] = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM order_confirmations
        `;
        const [guideJob] = await sql<{ count: number; status: string }[]>`
          SELECT count(*)::int AS count, min(status) AS status FROM shipping_guide_jobs
        `;
        expect(order).toMatchObject({
          status: 'confirmed',
          customer_name: 'Camila Pérez',
        });
        expect(stock?.reserved_quantity).toBe(1);
        expect(confirmation?.count).toBe(1);
        expect(guideJob).toMatchObject({ count: 1, status: 'pending' });
      } finally {
        await sql.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });

  it('completes conversation, guide creation and idempotent PDF storage end to end', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const catalogRepository = new PostgresCatalogRepository(database);
    const orderService = new OrderService(
      new PostgresOrderRepository(database),
      (id) => catalogRepository.findReferenceById(id),
    );
    const jobs = new PostgresShippingGuideJobRepository(database);
    const providerPdf = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);
    const createPreShipment = vi.fn(async () => ({
      preShipmentNumber: '954101306101',
      freightCop: 11_596,
    }));
    const getGuidePdf = vi.fn(async () => providerPdf);
    const quote = vi.fn(async () => [
      {
        carrier: 'envia',
        freightCop: 13_368,
        cashOnDeliveryCop: 3_000,
        surchargeCop: 600,
        serviceId: 12,
        estimatedDays: '1',
      },
    ]);
    const provider = {
      createPreShipment,
      getGuidePdf,
    };
    const service = new WhatsAppSalesService(
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
        { quote },
      ),
    );
    const root = await mkdtemp(path.join(tmpdir(), 'camila-guide-e2e-'));
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
        '1',
        'confirmar',
      ].entries()) {
        await service.process({
          whatsappMessageId: `wamid.complete-${index}`,
          customerPhone: '+573158191776',
          text,
        });
      }
      await service.process({
        whatsappMessageId: 'wamid.complete-9',
        customerPhone: '+573158191776',
        text: 'confirmar',
      });
      expect(
        await new ShippingGuideWorker(jobs, orderService, provider).runOnce(),
      ).toBe(true);
      const sql = postgres(databaseUrl, { max: 1, prepare: false });
      const [order] = await sql<{ id: string }[]>`SELECT id FROM sales_orders`;
      await sql.end({ timeout: 5 });
      expect(order).toBeDefined();
      const guides = new ShippingGuideService(
        jobs,
        provider,
        new LocalGuidePdfStorage(root),
      );
      const first = await guides.fetchPdf(order!.id);
      const second = await guides.fetchPdf(order!.id);
      expect(first.bytes).toEqual(providerPdf);
      expect(second.bytes).toEqual(providerPdf);
      expect(createPreShipment).toHaveBeenCalledTimes(1);
      expect(createPreShipment).toHaveBeenCalledWith(
        expect.objectContaining({ declaredValueCop: 136_968 }),
      );
      expect(quote).toHaveBeenCalledTimes(2);
      expect(getGuidePdf).toHaveBeenCalledTimes(1);
      const job = await jobs.findByOrderId(order!.id);
      expect(job).toMatchObject({
        status: 'created',
        preShipmentNumber: '954101306101',
        freightCop: 11_596,
        guidePdfByteSize: providerPdf.byteLength,
      });
      expect(await readFile(path.join(root, job!.guidePdfStorageKey!))).toEqual(
        Buffer.from(providerPdf),
      );
    } finally {
      await database.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
