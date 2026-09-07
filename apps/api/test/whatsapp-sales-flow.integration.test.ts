import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
        expect(order).toMatchObject({
          status: 'confirmed',
          customer_name: 'Camila Pérez',
        });
        expect(stock?.reserved_quantity).toBe(1);
        expect(confirmation?.count).toBe(1);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });
});
