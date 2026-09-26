import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { DefaultCatalogService } from '../src/modules/catalog/catalog-service.js';
import { PostgresCatalogRepository } from '../src/modules/catalog/postgres-catalog-repository.js';
import { PostgresConversationMenuRepository } from '../src/modules/conversations/postgres-conversation-menu-repository.js';
import { PostgresConversationRepository } from '../src/modules/conversations/postgres-conversation-repository.js';
import { BotFlowService } from '../src/modules/conversations/bot-flow-service.js';
import { createDefaultBotFlow } from '../src/modules/conversations/flow-definition.js';
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
import { GuideDeliveryService } from '../src/modules/shipping/guide-delivery-service.js';
import { AlertService } from '../src/modules/alerts/alert-service.js';
import { PostgresAlertRepository } from '../src/modules/alerts/postgres-alert-repository.js';
import { InventoryClosureService } from '../src/modules/inventory/inventory-closure-service.js';
import { PostgresInventoryClosureRepository } from '../src/modules/inventory/postgres-inventory-closure-repository.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const databaseUrl = requireTestDatabaseUrl();

describe('complete WhatsApp sale', () => {
  it('detaches a stale order and accepts a new size without changing its history', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const conversations = new PostgresConversationRepository(database);
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    const customerPhone = '+573158191978';
    try {
      const started = await conversations.receive({
        whatsappMessageId: 'stale-reuse-start',
        customerPhone,
        text: 'hola',
      });
      const order = await new OrderService(
        new PostgresOrderRepository(database),
        (id) => new PostgresCatalogRepository(database).findReferenceById(id),
      ).create({
        referenceId: '11111111-1111-4111-8111-111111111111',
        size: '37',
        quantity: 1,
        customerPhone,
      });
      await conversations.attachOrder(
        started.conversationId!,
        order.referenceId,
        order.id,
      );
      await conversations.setState(
        started.conversationId!,
        'awaiting_reuse_confirmation',
      );
      await sql`UPDATE sales_orders SET status = 'cancelled' WHERE id = ${order.id}`;
      const yes = {
        whatsappMessageId: 'stale-reuse-yes',
        customerPhone,
        text: 'sí',
      };
      expect((await conversations.receive(yes)).action).toBe(
        'reuse_destination',
      );
      const restart = {
        conversationId: started.conversationId!,
        orderId: order.id,
        customerPhone,
        body: 'Este pedido ya no permite cambios. Para empezar otro pedido, dime tu talla.',
        idempotencyKey: 'reuse-order-unavailable:stale-reuse-yes',
      };
      await expect(
        conversations.restartAfterUnavailableOrder({
          ...restart,
          idempotencyKey: 'x'.repeat(161),
        }),
      ).rejects.toThrow();
      expect(await conversations.receive(yes)).toMatchObject({
        duplicate: true,
        action: 'reuse_destination',
        activeOrderId: order.id,
      });
      expect(await conversations.restartAfterUnavailableOrder(restart)).toBe(
        true,
      );
      const [outbound] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM whatsapp_outbound_messages
        WHERE idempotency_key = ${restart.idempotencyKey}
      `;
      expect(outbound?.count).toBe(1);
      expect((await conversations.receive(yes)).action).toBeUndefined();
      const [conversation] = await sql<
        { state: string; active_order_id: string | null }[]
      >`SELECT state, active_order_id FROM whatsapp_conversations WHERE id = ${started.conversationId!}`;
      expect(conversation).toEqual({
        state: 'awaiting_size',
        active_order_id: null,
      });
      const next = await conversations.receive({
        whatsappMessageId: 'stale-reuse-new-size',
        customerPhone,
        text: '37',
      });
      expect(next).toMatchObject({
        action: 'show_catalog',
        activeOrderId: null,
      });
      const [oldOrder] = await sql<{ status: string }[]>`
        SELECT status FROM sales_orders WHERE id = ${order.id}
      `;
      expect(oldOrder?.status).toBe('cancelled');
    } finally {
      await sql.end({ timeout: 5 });
      await database.close();
    }
  });
  it('recovers a selected-reference prompt after the draft was attached', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const conversations = new PostgresConversationRepository(database);
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    const customerPhone = '+573158191977';
    const selection = {
      whatsappMessageId: 'reuse-prompt-interrupted',
      customerPhone,
      text: '01',
    };
    try {
      const started = await conversations.receive({
        whatsappMessageId: 'reuse-prompt-start',
        customerPhone,
        text: 'hola',
      });
      await sql`UPDATE whatsapp_conversations SET state = 'showing_models', selected_size = '37.0' WHERE id = ${started.conversationId!}`;
      expect((await conversations.receive(selection)).action).toBe(
        'select_reference',
      );
      const order = await new OrderService(
        new PostgresOrderRepository(database),
        (id) => new PostgresCatalogRepository(database).findReferenceById(id),
      ).create({
        referenceId: '11111111-1111-4111-8111-111111111111',
        size: '37.0',
        quantity: 1,
        customerPhone,
      });
      await conversations.attachOrder(
        started.conversationId!,
        order.referenceId,
        order.id,
      );
      await conversations.setState(
        started.conversationId!,
        'awaiting_reuse_confirmation',
      );
      expect(await conversations.receive(selection)).toMatchObject({
        duplicate: true,
        conversationId: started.conversationId,
        action: 'select_reference',
        activeOrderId: order.id,
        input: '01',
        selectedSize: '37.0',
      });
    } finally {
      await sql.end({ timeout: 5 });
      await database.close();
    }
  });
  it('ignores a delayed unquoted review after the customer resets the conversation', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const conversations = new PostgresConversationRepository(database);
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    let releaseQuote!: () => void;
    let quoteStarted!: () => void;
    const quoteStartedPromise = new Promise<void>((resolve) => {
      quoteStarted = resolve;
    });
    const quotePending = new Promise<void>((resolve) => {
      releaseQuote = resolve;
    });
    const customerPhone = '+573158191776';
    try {
      const start = await conversations.receive({
        whatsappMessageId: 'stale-unquoted-start',
        customerPhone,
        text: 'hola',
      });
      const order = await new OrderService(
        new PostgresOrderRepository(database),
        (id) => new PostgresCatalogRepository(database).findReferenceById(id),
      ).create({
        referenceId: '11111111-1111-4111-8111-111111111111',
        size: '37',
        quantity: 1,
        customerPhone,
      });
      await conversations.attachOrder(
        start.conversationId!,
        order.referenceId,
        order.id,
      );
      await sql`UPDATE whatsapp_conversations SET state = 'awaiting_notes' WHERE id = ${start.conversationId!}`;
      const service = new WhatsAppSalesService(
        conversations,
        { listAvailableForConfirmedSize: vi.fn() },
        { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
        new PostgresOutboundRepository(database),
        {
          create: vi.fn(),
          createSummary: vi.fn().mockResolvedValue({
            version: 1,
            snapshot: {
              orderNumber: 'PED-000001',
              productSubtotalCop: 120000,
              shippingCostCop: null,
              shippingPending: true,
              totalCop: 120000,
            },
          }),
        },
        undefined,
        undefined,
        {
          createQuotes: async () => {
            quoteStarted();
            await quotePending;
          },
        },
      );
      const processing = service.process({
        whatsappMessageId: 'stale-unquoted-notes',
        customerPhone,
        text: 'ninguna',
      });
      await quoteStartedPromise;
      const reset = await conversations.receive({
        whatsappMessageId: 'stale-unquoted-reset',
        customerPhone,
        text: 'volver',
      });
      expect(reset).toMatchObject({ action: 'reset', state: 'awaiting_size' });
      releaseQuote();
      await processing;

      const [state] = await sql<
        { mode: string; state: string; active_summary_version: number | null }[]
      >`SELECT mode, state, active_summary_version FROM whatsapp_conversations WHERE id = ${start.conversationId!}`;
      const [staleReply] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM whatsapp_outbound_messages
        WHERE idempotency_key = 'shipping-attention:stale-unquoted-notes'
      `;
      expect(state).toMatchObject({
        mode: 'bot',
        state: 'awaiting_size',
        active_summary_version: null,
      });
      expect(staleReply?.count).toBe(0);
    } finally {
      releaseQuote();
      await sql.end({ timeout: 5 });
      await database.close();
    }
  });
  it('recovers cancellation when the inbound event committed before processing', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const conversations = new PostgresConversationRepository(database);
    const catalogRepository = new PostgresCatalogRepository(database);
    const orders = new OrderService(
      new PostgresOrderRepository(database),
      (id) => catalogRepository.findReferenceById(id),
    );
    const outbound = new PostgresOutboundRepository(database);
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
      orders,
    );
    const customerPhone = '+573158191776';
    const cancel = {
      whatsappMessageId: 'cancel-interrupted',
      customerPhone,
      text: 'cancelar',
    };
    try {
      const welcome = {
        whatsappMessageId: 'cancel-interrupted-welcome',
        customerPhone,
        text: 'hola',
      };
      const started = await conversations.receive(welcome);
      await service.process(welcome);
      const order = await orders.create({
        referenceId: '11111111-1111-4111-8111-111111111111',
        size: '37',
        quantity: 1,
        customerPhone,
      });
      await conversations.attachOrder(
        started.conversationId!,
        order.referenceId,
        order.id,
      );
      const sql = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        await sql`UPDATE whatsapp_conversations SET state = 'awaiting_confirmation', active_summary_version = 1 WHERE id = ${started.conversationId!}`;
      } finally {
        await sql.end({ timeout: 5 });
      }
      expect((await conversations.receive(cancel)).action).toBe('cancel_order');

      await service.process(cancel);
      await service.process(cancel);

      const check = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [state] = await check<
          {
            status: string;
            active_order_id: string | null;
            active_summary_version: number | null;
          }[]
        >`
          SELECT o.status, c.active_order_id, c.active_summary_version
          FROM sales_orders o JOIN whatsapp_conversations c ON c.id = ${started.conversationId!}
          WHERE o.id = ${order.id}
        `;
        const [reply] = await check<{ count: number }[]>`
          SELECT count(*)::int AS count FROM whatsapp_outbound_messages
          WHERE idempotency_key = 'cancelled:cancel-interrupted'
        `;
        const [events] = await check<{ count: number }[]>`
          SELECT count(*)::int AS count FROM order_status_events
          WHERE order_id = ${order.id} AND next_status = 'cancelled'
        `;
        const [guides] = await check<{ count: number }[]>`
          SELECT count(*)::int AS count FROM shipping_guide_jobs
        `;
        const [welcomeReplies] = await check<{ count: number }[]>`
          SELECT count(*)::int AS count FROM whatsapp_outbound_messages
          WHERE idempotency_key = 'reply:cancel-interrupted-welcome'
        `;
        expect(state).toMatchObject({
          status: 'cancelled',
          active_order_id: null,
          active_summary_version: null,
        });
        expect(reply?.count).toBe(1);
        expect(events?.count).toBe(1);
        expect(guides?.count).toBe(0);
        expect(welcomeReplies?.count).toBe(0);
      } finally {
        await check.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });

  it('recovers the reply after cancellation committed and its active link was cleared', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const conversations = new PostgresConversationRepository(database);
    const catalogRepository = new PostgresCatalogRepository(database);
    const orders = new OrderService(
      new PostgresOrderRepository(database),
      (id) => catalogRepository.findReferenceById(id),
    );
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      new PostgresOutboundRepository(database),
      orders,
    );
    const customerPhone = '+573158191776';
    const cancel = {
      whatsappMessageId: 'cancel-after-clear',
      customerPhone,
      text: 'cancelar',
    };
    try {
      const started = await conversations.receive({
        whatsappMessageId: 'cancel-after-clear-welcome',
        customerPhone,
        text: 'hola',
      });
      const order = await orders.create({
        referenceId: '11111111-1111-4111-8111-111111111111',
        size: '37',
        quantity: 1,
        customerPhone,
      });
      await conversations.attachOrder(
        started.conversationId!,
        order.referenceId,
        order.id,
      );
      const sql = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        await sql`UPDATE whatsapp_conversations SET state = 'awaiting_confirmation', active_summary_version = 1 WHERE id = ${started.conversationId!}`;
      } finally {
        await sql.end({ timeout: 5 });
      }
      await conversations.receive(cancel);
      await orders.transition({
        orderId: order.id,
        action: 'cancel',
        idempotencyKey: 'whatsapp:cancel-after-clear',
      });
      await conversations.clearActiveOrder(started.conversationId!, order.id);

      await service.process(cancel);
      await service.process(cancel);

      const check = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [reply] = await check<{ count: number; body: string }[]>`
          SELECT count(*)::int AS count, min(text_body) AS body FROM whatsapp_outbound_messages
          WHERE idempotency_key = 'cancelled:cancel-after-clear'
        `;
        const [events] = await check<{ count: number }[]>`
          SELECT count(*)::int AS count FROM order_status_events
          WHERE order_id = ${order.id} AND next_status = 'cancelled'
        `;
        expect(reply?.count).toBe(1);
        expect(reply?.body).toContain(
          `PED-${String(order.orderNumber).padStart(6, '0')}`,
        );
        expect(events?.count).toBe(1);
      } finally {
        await check.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });
  it('cancels a summarized draft once and preserves its historical link', async () => {
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
      new ShippingQuoteService(
        new PostgresShippingQuoteRepository(database),
        orderService,
        {
          quote: vi.fn(async () => [
            {
              carrier: 'envia',
              freightCop: 13_368,
              cashOnDeliveryCop: 3_000,
              surchargeCop: 600,
              serviceId: 12,
              estimatedDays: '1',
            },
          ]),
        },
      ),
    );
    const customerPhone = '+573158191776';
    try {
      for (const [index, text] of [
        'hola',
        '37',
        '01',
        'Camila Pérez',
        'sí',
        'Antioquia',
        'Medellín',
        'Calle 1 # 2-3',
        'saltar',
      ].entries()) {
        await service.process({
          whatsappMessageId: `cancel-flow-${index}`,
          customerPhone,
          text,
        });
      }
      const cancel = {
        whatsappMessageId: 'cancel-flow-final',
        customerPhone,
        text: 'cancelar',
      };
      await service.process(cancel);
      await service.process(cancel);

      const sql = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [row] = await sql<
          {
            id: string;
            order_number: number;
            status: string;
            active_order_id: string | null;
            selected_reference_id: string | null;
            active_summary_version: number | null;
            origin_conversation_id: string;
            conversation_id: string;
          }[]
        >`
          SELECT o.id, o.order_number, o.status, c.active_order_id, c.selected_reference_id,
            c.active_summary_version, l.origin_conversation_id, c.id AS conversation_id
          FROM sales_orders o
          JOIN conversation_order_links l ON l.order_id = o.id
          JOIN whatsapp_conversations c ON c.id = l.origin_conversation_id
        `;
        const [reply] = await sql<{ count: number; body: string }[]>`
          SELECT count(*)::int AS count, min(text_body) AS body
          FROM whatsapp_outbound_messages WHERE text_body LIKE 'Cancelé el pedido%'
        `;
        const [guide] = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM shipping_guide_jobs
        `;
        const [stock] = await sql<{ reserved_quantity: number }[]>`
          SELECT reserved_quantity FROM catalog_stock
        `;
        expect(row).toMatchObject({
          status: 'cancelled',
          active_order_id: null,
          selected_reference_id: null,
          active_summary_version: null,
        });
        expect(row?.origin_conversation_id).toBe(row?.conversation_id);
        expect(reply?.count).toBe(1);
        expect(reply?.body).toContain(
          `PED-${String(row!.order_number).padStart(6, '0')}`,
        );
        expect(guide?.count).toBe(0);
        expect(stock?.reserved_quantity).toBe(0);
      } finally {
        await sql.end({ timeout: 5 });
      }
    } finally {
      await database.close();
    }
  });
  it('delivers the handover acknowledgement while cancelling pending automatic messages', async () => {
    const database = createPostgresDatabase(databaseUrl);
    try {
      const outbound = new PostgresOutboundRepository(database);
      const service = new WhatsAppSalesService(
        new PostgresConversationRepository(database),
        { listAvailableForConfirmedSize: vi.fn() },
        { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
        outbound,
      );
      await service.process({
        whatsappMessageId: 'handover-welcome',
        customerPhone: '573000000001',
        text: 'hola',
      });
      await service.process({
        whatsappMessageId: 'handover-human',
        customerPhone: '573000000001',
        text: 'asesora',
      });
      const message = await outbound.claimNext();
      expect(message?.textBody).toContain('asesora');
      expect(await outbound.claimNext()).toBeNull();
      const [conversation] = await database.orm.execute(
        'SELECT mode FROM whatsapp_conversations',
      );
      expect(conversation?.mode).toBe('human');
    } finally {
      await database.close();
    }
  });
  beforeAll(() => runMigrations(databaseUrl));
  beforeEach(async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`TRUNCATE TABLE customers, whatsapp_outbound_messages, whatsapp_catalog_menu_options,
        whatsapp_catalog_menus, whatsapp_conversation_events, whatsapp_conversations,
        order_confirmations, reservation_movements, order_status_events, order_summaries,
        sales_orders, catalog_stock, inventory_movements, catalog_references,
        shipping_localities, shipping_carrier_rules, shipping_preferences,
        bot_flow_versions, bot_flow_drafts, owner_alert_deliveries, owner_alerts, inventory_closures CASCADE`;
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

  it('canonicalizes a known department from the active catalog and rejects unknown names', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    const conversations = new PostgresConversationRepository(database);
    const customerPhone = '+573158191776';
    try {
      const started = await conversations.receive({
        whatsappMessageId: 'department-start',
        customerPhone,
        text: 'hola',
      });
      await sql`UPDATE whatsapp_conversations SET state = 'awaiting_department' WHERE id = ${started.conversationId!}`;
      const invalid = await conversations.receive({
        whatsappMessageId: 'department-unknown',
        customerPhone,
        text: 'Antioquía falsa',
      });
      expect(invalid).toMatchObject({ state: 'awaiting_department' });
      expect(invalid.action).toBeUndefined();
      const [afterInvalid] = await sql<
        { pending_department: string | null; invalid_attempts: number }[]
      >`
        SELECT pending_department, invalid_attempts FROM whatsapp_conversations WHERE id = ${started.conversationId!}
      `;
      expect(afterInvalid?.pending_department).toBeNull();
      expect(afterInvalid?.invalid_attempts).toBe(1);
      const valid = await conversations.receive({
        whatsappMessageId: 'department-lowercase',
        customerPhone,
        text: 'antioquia',
      });
      expect(valid).toMatchObject({
        action: 'collect_department',
        input: 'Antioquia',
        pendingDepartment: 'Antioquia',
      });
      const [afterValid] = await sql<{ pending_department: string | null }[]>`
        SELECT pending_department FROM whatsapp_conversations WHERE id = ${started.conversationId!}
      `;
      expect(afterValid?.pending_department).toBe('Antioquia');
    } finally {
      await sql.end({ timeout: 5 });
      await database.close();
    }
  });

  it('replays a persisted municipality handoff after outbound failure without losing the draft order', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    const conversations = new PostgresConversationRepository(database);
    const customerPhone = '+573158191776';
    const outbound = {
      enqueueText: vi
        .fn()
        .mockRejectedValueOnce(new Error('queue unavailable'))
        .mockResolvedValue(undefined),
      enqueueImage: vi.fn(),
    };
    const alerts = { open: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
      { create: vi.fn(), update: vi.fn() },
      { list: vi.fn().mockResolvedValue({ items: [] }) },
      undefined,
      undefined,
      alerts,
    );
    const inbound = {
      whatsappMessageId: 'persisted-city-handoff',
      customerPhone,
      text: 'municipio inválido',
    };
    try {
      const started = await conversations.receive({
        whatsappMessageId: 'persisted-city-start',
        customerPhone,
        text: 'hola',
      });
      const order = await new OrderService(
        new PostgresOrderRepository(database),
        (id) => new PostgresCatalogRepository(database).findReferenceById(id),
      ).create({
        referenceId: '11111111-1111-4111-8111-111111111111',
        size: '37',
        quantity: 1,
        customerPhone,
      });
      await conversations.attachOrder(
        started.conversationId!,
        order.referenceId,
        order.id,
      );
      await sql`UPDATE whatsapp_conversations SET state = 'awaiting_locality', pending_department = 'Antioquia', invalid_attempts = 1 WHERE id = ${started.conversationId!}`;

      await expect(service.process(inbound)).rejects.toThrow(
        'queue unavailable',
      );
      const [persisted] = await sql<
        { mode: string; active_order_id: string; continuation_action: string }[]
      >`
        SELECT conversation.mode, conversation.active_order_id, event.continuation_action
        FROM whatsapp_conversations conversation
        JOIN whatsapp_conversation_events event ON event.conversation_id = conversation.id
        WHERE event.whatsapp_message_id = ${inbound.whatsappMessageId}
      `;
      expect(persisted).toMatchObject({
        mode: 'human',
        active_order_id: order.id,
        continuation_action: 'invalid_city',
      });
      expect(await conversations.receive(inbound)).toMatchObject({
        duplicate: true,
        action: 'human_takeover',
        conversationId: started.conversationId,
      });
      await service.process(inbound);
      expect(outbound.enqueueText).toHaveBeenCalledTimes(2);
      expect(outbound.enqueueText.mock.calls[0]?.[0].idempotencyKey).toBe(
        'reply:persisted-city-handoff',
      );
      expect(outbound.enqueueText.mock.calls[1]?.[0].idempotencyKey).toBe(
        'reply:persisted-city-handoff',
      );
      expect(alerts.open).toHaveBeenCalledTimes(1);
      const [completed] = await sql<{ continuation_action: string | null }[]>`
        SELECT continuation_action FROM whatsapp_conversation_events
        WHERE whatsapp_message_id = ${inbound.whatsappMessageId}
      `;
      expect(completed?.continuation_action).toBeNull();
    } finally {
      await sql.end({ timeout: 5 });
      await database.close();
    }
  });

  it('rejects a municipality number outside the latest offered list before carrier lookup', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    const conversations = new PostgresConversationRepository(database);
    const orderService = new OrderService(
      new PostgresOrderRepository(database),
      (id) => new PostgresCatalogRepository(database).findReferenceById(id),
    );
    const orders = { create: vi.fn(), update: vi.fn() };
    const localities = {
      list: vi.fn().mockResolvedValue({
        items: [
          {
            carrierCode: '05088000',
            department: 'Antioquia',
            locality: 'Bello',
          },
        ],
      }),
    };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      new PostgresOutboundRepository(database),
      orders,
      localities,
    );
    const customerPhone = '+573158191776';
    try {
      const started = await conversations.receive({
        whatsappMessageId: 'offered-locality-start',
        customerPhone,
        text: 'hola',
      });
      const order = await orderService.create({
        referenceId: '11111111-1111-4111-8111-111111111111',
        size: '37',
        quantity: 1,
        customerPhone,
      });
      await conversations.attachOrder(
        started.conversationId!,
        order.referenceId,
        order.id,
      );
      await sql`UPDATE whatsapp_conversations SET state = 'awaiting_locality', pending_department = 'Antioquia', offered_localities = '["Bello", "Belmira"]'::jsonb WHERE id = ${started.conversationId!}`;

      await service.process({
        whatsappMessageId: 'offered-locality-invalid',
        customerPhone,
        text: '3',
      });
      const [pending] = await sql<
        {
          state: string;
          offered_localities: string[];
          invalid_attempts: number;
        }[]
      >`
        SELECT state, offered_localities, invalid_attempts
        FROM whatsapp_conversations WHERE id = ${started.conversationId!}
      `;
      expect(pending).toMatchObject({
        state: 'awaiting_locality',
        offered_localities: ['Bello', 'Belmira'],
        invalid_attempts: 1,
      });
      expect(localities.list).not.toHaveBeenCalled();
      expect(orders.update).not.toHaveBeenCalled();

      await service.process({
        whatsappMessageId: 'offered-locality-valid',
        customerPhone,
        text: '1',
      });
      expect(localities.list).toHaveBeenCalledWith({
        department: 'Antioquia',
        query: 'Bello',
        limit: 10,
      });
      expect(orders.update).toHaveBeenCalledWith({
        orderId: order.id,
        localityCarrierCode: '05088000',
      });
    } finally {
      await sql.end({ timeout: 5 });
      await database.close();
    }
  });

  it('atomically invalidates the old summary for an address edit and keeps the open flow snapshot', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const conversations = new PostgresConversationRepository(database);
    const flows = new BotFlowService(database);
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      const first = createDefaultBotFlow();
      first.steps.address = { enabled: true, message: 'Dirección versión uno' };
      await flows.save(0, first, 'owner');
      const published = await flows.publish(1, 'owner');
      const welcome = await conversations.receive({
        whatsappMessageId: 'edit-atomic-start',
        customerPhone: '+573158191776',
        text: 'hola',
      });
      const orders = new OrderService(
        new PostgresOrderRepository(database),
        (id) => new PostgresCatalogRepository(database).findReferenceById(id),
      );
      const order = await orders.create({
        referenceId: '11111111-1111-4111-8111-111111111111',
        size: '37',
        quantity: 1,
        customerPhone: '+573158191776',
      });
      await conversations.attachOrder(
        welcome.conversationId!,
        order.referenceId,
        order.id,
      );
      await sql`UPDATE whatsapp_conversations SET state = 'awaiting_confirmation', active_summary_version = 1 WHERE id = ${welcome.conversationId!}`;
      const second = createDefaultBotFlow();
      second.steps.address = {
        enabled: true,
        message: 'Dirección versión dos',
      };
      await flows.save(2, second, 'owner');
      await flows.publish(3, 'owner');
      const edited = await conversations.receive({
        whatsappMessageId: 'edit-atomic-command',
        customerPhone: '+573158191776',
        text: 'cambiar dirección',
      });
      const [persisted] = await sql<
        {
          state: string;
          active_summary_version: number | null;
          flow_version_id: string | null;
        }[]
      >`SELECT state, active_summary_version, flow_version_id FROM whatsapp_conversations WHERE id = ${welcome.conversationId!}`;
      expect(edited).toMatchObject({
        action: 'edit_address',
        state: 'awaiting_address',
        activeSummaryVersion: null,
        reply: 'Dirección versión uno',
      });
      expect(persisted).toMatchObject({
        state: 'awaiting_address',
        active_summary_version: null,
        flow_version_id: published.activeVersionId,
      });
      expect(
        (
          await conversations.receive({
            whatsappMessageId: 'edit-atomic-old-confirm',
            customerPhone: '+573158191776',
            text: 'confirmar',
          })
        ).action,
      ).not.toBe('confirm_order');
      const address = await conversations.receive({
        whatsappMessageId: 'edit-atomic-new-address',
        customerPhone: '+573158191776',
        text: 'Carrera 9 # 10-11',
      });
      expect(address).toMatchObject({
        action: 'collect_address',
        summaryEditAction: 'edit_address',
        activeSummaryVersion: null,
        activeOrderId: order.id,
      });
      expect(
        (
          await conversations.receive({
            whatsappMessageId: 'edit-atomic-new-address-retry',
            customerPhone: '+573158191776',
            text: 'Carrera 9 # 10-11',
          })
        ).flow?.steps.address.message,
      ).toBe('Dirección versión uno');
    } finally {
      await sql.end({ timeout: 5 });
      await database.close();
    }
  });

  it('requotes address and municipality edits before allowing confirmation', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    const catalogRepository = new PostgresCatalogRepository(database);
    const orders = new OrderService(
      new PostgresOrderRepository(database),
      (id) => catalogRepository.findReferenceById(id),
    );
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
      orders,
      new LocalityService(new PostgresLocalityRepository(database)),
      new PostgresShippingGuideJobRepository(database),
      new ShippingQuoteService(
        new PostgresShippingQuoteRepository(database),
        orders,
        { quote },
      ),
    );
    const phone = '+573158191776';
    let sequence = 0;
    const send = async (text: string) =>
      service.process({
        whatsappMessageId: `summary-edit-${sequence++}`,
        customerPhone: phone,
        text,
      });
    try {
      await sql`INSERT INTO shipping_localities (carrier_code, department, locality, normalized_name, source_sha256) VALUES ('05088000', 'Antioquia', 'Bello', 'bello', repeat('c', 64))`;
      for (const text of [
        'hola',
        '37',
        '01',
        'Camila Pérez',
        'sí',
        'Antioquia',
        'Medellín',
        'Calle 1 # 2-3',
        'saltar',
      ])
        await send(text);
      const [initial] = await sql<
        { id: string; latest_summary_version: number }[]
      >`SELECT id, latest_summary_version FROM sales_orders`;
      expect(initial?.latest_summary_version).toBe(1);
      await send('cambiar dirección');
      const [pendingAddress] = await sql<
        { state: string; active_summary_version: number | null }[]
      >`SELECT state, active_summary_version FROM whatsapp_conversations`;
      expect(pendingAddress).toMatchObject({
        state: 'awaiting_address',
        active_summary_version: null,
      });
      await send('confirmar');
      const addressMessage = {
        whatsappMessageId: `summary-edit-${sequence++}`,
        customerPhone: phone,
        text: 'Carrera 9 # 10-11',
      };
      await service.process(addressMessage);
      await service.process(addressMessage);
      await expect(
        orders.transition({
          orderId: initial!.id,
          action: 'confirm',
          summaryVersion: 1,
          idempotencyKey: 'old-summary-attempt',
        }),
      ).rejects.toMatchObject({ code: 'stale_summary' });
      const [afterAddress] = await sql<
        {
          address: string;
          latest_summary_version: number;
          active_summary_version: number | null;
        }[]
      >`SELECT o.address, o.latest_summary_version, c.active_summary_version FROM sales_orders o JOIN whatsapp_conversations c ON c.active_order_id = o.id`;
      expect(afterAddress).toMatchObject({
        address: 'Carrera 9 # 10-11',
        latest_summary_version: 2,
        active_summary_version: 2,
      });
      await send('cambiar municipio');
      await send('Bello');
      const [afterLocality] = await sql<
        {
          locality_carrier_code: string;
          latest_summary_version: number;
          active_summary_version: number | null;
        }[]
      >`SELECT o.locality_carrier_code, o.latest_summary_version, c.active_summary_version FROM sales_orders o JOIN whatsapp_conversations c ON c.active_order_id = o.id`;
      expect(afterLocality).toMatchObject({
        locality_carrier_code: '05088000',
        latest_summary_version: 3,
        active_summary_version: 3,
      });
      await send('confirmar');
      const [final] = await sql<
        { status: string }[]
      >`SELECT status FROM sales_orders WHERE id = ${initial!.id}`;
      expect(final?.status).toBe('confirmed');
      expect(quote).toHaveBeenCalledTimes(3);
    } finally {
      await sql.end({ timeout: 5 });
      await database.close();
    }
  });

  it('replays an interrupted product edit and permits a new draft while preserving the cancelled one', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    const conversations = new PostgresConversationRepository(database);
    const catalogRepository = new PostgresCatalogRepository(database);
    const orders = new OrderService(
      new PostgresOrderRepository(database),
      (id) => catalogRepository.findReferenceById(id),
    );
    const service = new WhatsAppSalesService(
      conversations,
      new DefaultCatalogService(catalogRepository, {
        save: async () => {
          throw new Error('unused');
        },
        read: async () => new Uint8Array(),
        delete: async () => undefined,
      }),
      new PostgresConversationMenuRepository(database),
      new PostgresOutboundRepository(database),
      orders,
      new LocalityService(new PostgresLocalityRepository(database)),
      undefined,
      new ShippingQuoteService(
        new PostgresShippingQuoteRepository(database),
        orders,
        {
          quote: vi.fn(async () => [
            {
              carrier: 'envia',
              freightCop: 13_368,
              cashOnDeliveryCop: 3_000,
              surchargeCop: 600,
              serviceId: 12,
              estimatedDays: '1',
            },
          ]),
        },
      ),
    );
    const phone = '+573158191776';
    let sequence = 0;
    const send = async (text: string) =>
      service.process({
        whatsappMessageId: `product-edit-${sequence++}`,
        customerPhone: phone,
        text,
      });
    try {
      for (const text of [
        'hola',
        '37',
        '01',
        'Camila Pérez',
        'sí',
        'Antioquia',
        'Medellín',
        'Calle 1 # 2-3',
        'saltar',
      ])
        await send(text);
      const [first] = await sql<{ id: string }[]>`SELECT id FROM sales_orders`;
      const edit = {
        whatsappMessageId: 'product-edit-interrupted',
        customerPhone: phone,
        text: 'cambiar producto',
      };
      expect((await conversations.receive(edit)).action).toBe('edit_product');
      expect((await conversations.receive(edit)).action).toBe('edit_product');
      await service.process(edit);
      await service.process(edit);
      const [cancelled] = await sql<
        {
          status: string;
          state: string;
          active_order_id: string | null;
          active_summary_version: number | null;
        }[]
      >`SELECT o.status, c.state, c.active_order_id, c.active_summary_version FROM sales_orders o CROSS JOIN whatsapp_conversations c WHERE o.id = ${first!.id}`;
      expect(cancelled).toMatchObject({
        status: 'cancelled',
        state: 'awaiting_size',
        active_order_id: null,
        active_summary_version: null,
      });
      const [reply] = await sql<
        { count: number; text_body: string }[]
      >`SELECT count(*)::int AS count, min(text_body) AS text_body FROM whatsapp_outbound_messages WHERE idempotency_key = 'product-restart:product-edit-interrupted'`;
      expect(reply?.count).toBe(1);
      expect(reply?.text_body).toContain('referencia');
      const [prematurePrompt] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM whatsapp_outbound_messages
        WHERE idempotency_key = 'reply:product-edit-interrupted'`;
      expect(prematurePrompt?.count).toBe(0);
      await send('37');
      await send('01');
      const [next] = await sql<
        { count: number; active_order_id: string | null }[]
      >`SELECT count(*)::int AS count, max(c.active_order_id::text)::uuid AS active_order_id FROM sales_orders o CROSS JOIN whatsapp_conversations c`;
      expect(next?.count).toBe(2);
      expect(next?.active_order_id).not.toBe(first!.id);
    } finally {
      await sql.end({ timeout: 5 });
      await database.close();
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
      new ShippingQuoteService(
        new PostgresShippingQuoteRepository(database),
        orderService,
        {
          quote: vi.fn(async () => [
            {
              carrier: 'envia',
              freightCop: 13_368,
              cashOnDeliveryCop: 3_000,
              surchargeCop: 600,
              serviceId: 12,
              estimatedDays: '1',
            },
          ]),
        },
      ),
    );
    const phone = '+573158191776';
    const messages = [
      'hola',
      '37',
      '01',
      'Camila Pérez',
      'sí',
      'antioquia',
      'Medell',
      '1',
      'Calle 1 # 2-3',
      'saltar',
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
        const [customerLink] = await sql<
          {
            order_customer_id: string | null;
            conversation_customer_id: string | null;
          }[]
        >`
          SELECT sales_order.customer_id AS order_customer_id,
            conversation.customer_id AS conversation_customer_id
          FROM sales_orders AS sales_order
          JOIN whatsapp_conversations AS conversation
            ON conversation.customer_phone = sales_order.customer_phone
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
        const [localityCorrection] = await sql<{ text_body: string }[]>`
          SELECT text_body FROM whatsapp_outbound_messages
          WHERE text_body LIKE 'No encontré esa ciudad%'
          LIMIT 1
        `;
        expect(order).toMatchObject({
          status: 'confirmed',
          customer_name: 'Camila Pérez',
        });
        expect(customerLink?.order_customer_id).not.toBeNull();
        expect(customerLink?.order_customer_id).toBe(
          customerLink?.conversation_customer_id,
        );
        expect(stock?.reserved_quantity).toBe(1);
        expect(confirmation?.count).toBe(1);
        expect(guideJob).toMatchObject({ count: 1, status: 'pending' });
        expect(localityCorrection?.text_body).toContain('1. Medellín');
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
        'confirmar',
      ].entries()) {
        if (index === 9) {
          const expirySql = postgres(databaseUrl, { max: 1, prepare: false });
          try {
            await expirySql`UPDATE shipping_quotes SET quoted_at = now() - interval '2 minutes', expires_at = now() - interval '1 minute'`;
          } finally {
            await expirySql.end({ timeout: 5 });
          }
        }
        await service.process({
          whatsappMessageId: `wamid.complete-${index}`,
          customerPhone: '+573158191776',
          text,
        });
      }
      const pendingSql = postgres(databaseUrl, { max: 1, prepare: false });
      try {
        const [pending] = await pendingSql`SELECT status FROM sales_orders`;
        expect(pending?.status).toBe('draft');
        const [stock] =
          await pendingSql`SELECT reserved_quantity FROM catalog_stock`;
        expect(stock?.reserved_quantity).toBe(0);
        const [count] =
          await pendingSql`SELECT count(*)::int AS count FROM shipping_guide_jobs`;
        expect(count?.count).toBe(0);
      } finally {
        await pendingSql.end({ timeout: 5 });
      }
      await service.process({
        whatsappMessageId: 'wamid.refreshed-confirm',
        customerPhone: '+573158191776',
        text: 'confirmar',
      });
      await service.process({
        whatsappMessageId: 'wamid.complete-9',
        customerPhone: '+573158191776',
        text: 'confirmar',
      });
      const [customerSummary] = await database.orm.execute(
        "SELECT text_body FROM whatsapp_outbound_messages WHERE text_body LIKE '%Pedido PED-%' AND text_body LIKE '%Total contra entrega:%' ORDER BY created_at DESC LIMIT 1",
      );
      expect(customerSummary?.text_body).toContain('Productos: $120.000 COP');
      expect(customerSummary?.text_body).toContain(
        'Envío (envia): $16.968 COP',
      );
      expect(customerSummary?.text_body).toContain(
        'Total contra entrega: $136.968 COP',
      );
      expect(
        await new ShippingGuideWorker(
          jobs,
          orderService,
          provider,
          new AlertService(new PostgresAlertRepository(database)),
        ).runOnce(),
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
      expect(await delivery.runOnce()).toBe(false);
      expect(
        await database.orm.execute(
          "SELECT id FROM owner_alerts WHERE type = 'order_confirmed'",
        ),
      ).toHaveLength(1);
      expect(
        await database.orm.execute(
          "SELECT id FROM owner_alerts WHERE type = 'guide_created'",
        ),
      ).toHaveLength(1);
      await orderService.transition({ orderId: order!.id, action: 'dispatch' });
      await expect(
        orderService.transition({ orderId: order!.id, action: 'dispatch' }),
      ).rejects.toThrow();
      const stock = await database.orm.execute(
        'SELECT physical_quantity, reserved_quantity FROM catalog_stock',
      );
      expect(stock[0]).toMatchObject({
        physical_quantity: 0,
        reserved_quantity: 0,
      });
      const closures = new InventoryClosureService(
        new PostgresInventoryClosureRepository(database),
      );
      const date = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota',
      }).format(new Date());
      const closure = (await closures.generate(date)) as {
        id: string;
        csvContent: string;
        totalUnits: number;
      };
      const repeated = (await closures.generate(date)) as { id: string };
      expect(repeated.id).toBe(closure.id);
      expect(closure.csvContent).toContain('01,37.0,-1');
      expect(closure.totalUnits).toBe(-1);
      await closures.acknowledge(closure.id);
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
