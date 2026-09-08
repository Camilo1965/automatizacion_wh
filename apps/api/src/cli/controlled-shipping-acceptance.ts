import path from 'node:path';

import postgres from 'postgres';

import { createPostgresDatabase } from '../database/client.js';
import { runMigrations } from '../database/migrate.js';
import { DefaultCatalogService } from '../modules/catalog/catalog-service.js';
import { PostgresCatalogRepository } from '../modules/catalog/postgres-catalog-repository.js';
import { PostgresConversationMenuRepository } from '../modules/conversations/postgres-conversation-menu-repository.js';
import { PostgresConversationRepository } from '../modules/conversations/postgres-conversation-repository.js';
import { WhatsAppSalesService } from '../modules/conversations/whatsapp-sales-service.js';
import { LocalityService } from '../modules/localities/locality-service.js';
import { PostgresLocalityRepository } from '../modules/localities/postgres-locality-repository.js';
import { OrderService } from '../modules/orders/order-service.js';
import { PostgresOrderRepository } from '../modules/orders/postgres-order-repository.js';
import { NinetyNineEnviosClient } from '../modules/shipping/99envios-client.js';
import { LocalGuidePdfStorage } from '../modules/shipping/local-guide-pdf-storage.js';
import { PostgresShippingGuideJobRepository } from '../modules/shipping/postgres-shipping-guide-job-repository.js';
import { PostgresShippingQuoteRepository } from '../modules/shipping/postgres-shipping-quote-repository.js';
import { ShippingGuideService } from '../modules/shipping/shipping-guide-service.js';
import { ShippingGuideWorker } from '../modules/shipping/shipping-guide-worker.js';
import { ShippingQuoteService } from '../modules/shipping/shipping-quote-service.js';
import { PostgresOutboundRepository } from '../modules/whatsapp/postgres-outbound-repository.js';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  if (process.env.CAMILA_ALLOW_REAL_GUIDE !== 'YES') {
    throw new Error(
      'Set CAMILA_ALLOW_REAL_GUIDE=YES for one controlled real guide',
    );
  }
  const databaseUrl = required('TEST_DATABASE_URL');
  const databaseName = new URL(databaseUrl).pathname.slice(1);
  if (!databaseName.endsWith('_test'))
    throw new Error('Acceptance must use a *_test database');
  await runMigrations(databaseUrl);
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  await sql`TRUNCATE TABLE whatsapp_outbound_messages, whatsapp_catalog_menu_options,
    whatsapp_catalog_menus, whatsapp_conversation_events, whatsapp_conversations,
    shipping_guide_jobs, shipping_quotes, order_confirmations, reservation_movements,
    order_status_events, order_summaries, sales_orders, catalog_stock,
    inventory_movements, catalog_references, shipping_localities CASCADE`;
  await sql`INSERT INTO catalog_references
    (id, code, model_name, color, price_cop, photo_storage_key,
     photo_mime_type, photo_byte_size, photo_sha256, active)
    VALUES ('11111111-1111-4111-8111-111111111111', '01', 'Modelo controlado',
      'Negro', 120000, 'catalog/acceptance.jpg', 'image/jpeg', 3,
      repeat('a', 64), true)`;
  await sql`INSERT INTO catalog_stock (reference_id, size, physical_quantity, reserved_quantity)
    VALUES ('11111111-1111-4111-8111-111111111111', 37, 1, 0)`;
  await sql`INSERT INTO shipping_localities
    (carrier_code, department, locality, normalized_name, source_sha256)
    VALUES ('05001000', 'Antioquia', 'Medellín', 'medellin', repeat('b', 64))`;

  const database = createPostgresDatabase(databaseUrl);
  try {
    const catalogRepository = new PostgresCatalogRepository(database);
    const orderService = new OrderService(
      new PostgresOrderRepository(database),
      (id) => catalogRepository.findReferenceById(id),
    );
    const diagnosticFetch: typeof globalThis.fetch = async (input, init) => {
      const response = await globalThis.fetch(input, init);
      if (String(input).endsWith('/preenvio')) {
        console.error(
          JSON.stringify({
            providerStep: 'preenvio',
            status: response.status,
            contentType: response.headers.get('content-type'),
          }),
        );
      }
      return response;
    };
    const client = new NinetyNineEnviosClient({
      email: required('NINETYNINE_ENVIOS_EMAIL'),
      password: required('NINETYNINE_ENVIOS_PASSWORD'),
      fetch: diagnosticFetch,
    });
    const jobs = new PostgresShippingGuideJobRepository(database);
    const quotes = new ShippingQuoteService(
      new PostgresShippingQuoteRepository(database),
      orderService,
      client,
    );
    const conversation = new WhatsAppSalesService(
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
      quotes,
    );
    const runId = Date.now();
    const messages = [
      'hola',
      '37',
      '01',
      'Prueba Camila',
      '3158191776',
      'Antioquia',
      'Medellín',
      'Calle 1 # 2-3',
      'ninguna',
      'confirmar',
    ];
    for (const [index, text] of messages.entries()) {
      await conversation.process({
        whatsappMessageId: `wamid.acceptance-${runId}-${index}`,
        customerPhone: '+573158191776',
        text,
      });
    }
    await conversation.process({
      whatsappMessageId: `wamid.acceptance-${runId}-9`,
      customerPhone: '+573158191776',
      text: 'confirmar',
    });
    const [order] = await sql<
      { id: string }[]
    >`SELECT id FROM sales_orders LIMIT 1`;
    if (!order) throw new Error('Conversation did not create an order');
    const worker = new ShippingGuideWorker(jobs, orderService, client);
    await worker.runOnce();
    const state = await quotes.getShipping(order.id);
    const guide = state.guide;
    if (guide?.status !== 'created' || !guide.preShipmentNumber) {
      throw new Error(
        `Guide was not created; status=${guide?.status ?? 'missing'} error=${guide?.errorCode ?? 'none'}`,
      );
    }
    const storage = new LocalGuidePdfStorage(
      path.join(process.cwd(), 'var', 'media', 'acceptance-guides'),
    );
    const guideService = new ShippingGuideService(jobs, client, storage);
    const firstPdf = await guideService.fetchPdf(order.id);
    const secondPdf = await guideService.fetchPdf(order.id);
    const [counts] = await sql<
      { confirmations: number; jobs: number; reserved: number }[]
    >`
      SELECT
        (SELECT count(*)::int FROM order_confirmations) AS confirmations,
        (SELECT count(*)::int FROM shipping_guide_jobs) AS jobs,
        (SELECT reserved_quantity FROM catalog_stock LIMIT 1)::int AS reserved
    `;
    console.log(
      JSON.stringify({
        passed: true,
        orderId: order.id,
        selectedCarrier: state.quotes.find((quote) => quote.selected)?.carrier,
        shippingCop: state.quotes.find((quote) => quote.selected)
          ? state.quotes.find((quote) => quote.selected)!.freightCop +
            state.quotes.find((quote) => quote.selected)!.cashOnDeliveryCop +
            state.quotes.find((quote) => quote.selected)!.surchargeCop
          : null,
        guideNumber: guide.preShipmentNumber,
        pdfBytes: firstPdf.bytes.byteLength,
        pdfSha256: firstPdf.sha256,
        repeatedPdfSameBytes: Buffer.from(firstPdf.bytes).equals(
          Buffer.from(secondPdf.bytes),
        ),
        confirmations: counts?.confirmations,
        guideJobs: counts?.jobs,
        reservedUnits: counts?.reserved,
      }),
    );
  } finally {
    await database.close();
    await sql.end({ timeout: 5 });
  }
}

await main();
