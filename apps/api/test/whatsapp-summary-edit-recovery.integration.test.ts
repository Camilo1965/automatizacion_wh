import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { PostgresConversationRepository } from '../src/modules/conversations/postgres-conversation-repository.js';
import { WhatsAppSalesService } from '../src/modules/conversations/whatsapp-sales-service.js';
import { PostgresOutboundRepository } from '../src/modules/whatsapp/postgres-outbound-repository.js';
import { PostgresCatalogRepository } from '../src/modules/catalog/postgres-catalog-repository.js';
import { OrderService } from '../src/modules/orders/order-service.js';
import { PostgresOrderRepository } from '../src/modules/orders/postgres-order-repository.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';
import { BotFlowService } from '../src/modules/conversations/bot-flow-service.js';
import { createDefaultBotFlow } from '../src/modules/conversations/flow-definition.js';

const databaseUrl = requireTestDatabaseUrl();
const phone = '+573158191776';

describe('summary edit interruption recovery', () => {
  beforeAll(() => runMigrations(databaseUrl));
  beforeEach(async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`TRUNCATE TABLE customers, whatsapp_outbound_messages, whatsapp_conversation_events,
        whatsapp_conversations, order_summaries, sales_orders, catalog_stock,
        inventory_movements, catalog_references, bot_flow_versions, bot_flow_drafts CASCADE`;
      await sql`INSERT INTO catalog_references
        (id, code, model_name, color, price_cop, photo_storage_key,
         photo_mime_type, photo_byte_size, photo_sha256, active)
        VALUES ('11111111-1111-4111-8111-111111111111', '01', 'Tenis Camila',
          'Negro', 120000, 'catalog/01.jpg', 'image/jpeg', 3,
          repeat('a', 64), true)`;
      await sql`INSERT INTO catalog_stock (reference_id, size, physical_quantity, reserved_quantity)
        VALUES ('11111111-1111-4111-8111-111111111111', 37, 1, 0)`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  async function summarizedDraft(state = 'awaiting_confirmation') {
    const database = createPostgresDatabase(databaseUrl);
    const conversations = new PostgresConversationRepository(database);
    const catalog = new PostgresCatalogRepository(database);
    const orders = new OrderService(
      new PostgresOrderRepository(database),
      (id) => catalog.findReferenceById(id),
    );
    const welcome = await conversations.receive({
      whatsappMessageId: 'setup-welcome',
      customerPhone: phone,
      text: 'hola',
    });
    const order = await orders.create({
      referenceId: '11111111-1111-4111-8111-111111111111',
      size: '37',
      quantity: 1,
      customerPhone: phone,
    });
    await conversations.attachOrder(
      welcome.conversationId!,
      order.referenceId,
      order.id,
    );
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`UPDATE whatsapp_conversations SET state = ${state}, pending_department = 'Antioquia', active_summary_version = ${state === 'awaiting_confirmation' ? 1 : null}
        WHERE id = ${welcome.conversationId!}`;
    } finally {
      await sql.end({ timeout: 5 });
    }
    return {
      database,
      conversations,
      orderId: order.id,
      conversationId: welcome.conversationId!,
    };
  }

  it.each([
    ['cambiar dirección', 'awaiting_address'],
    ['cambiar municipio', 'awaiting_locality'],
  ])(
    'replays the %s continuation after enqueue failure',
    async (command, expectedState) => {
      const { database, conversations } = await summarizedDraft();
      const sql = postgres(databaseUrl, { max: 1, prepare: false });
      const realOutbound = new PostgresOutboundRepository(database);
      let failOnce = true;
      const outbound = {
        enqueueText: async (
          input: Parameters<typeof realOutbound.enqueueText>[0],
        ) => {
          if (failOnce) {
            failOnce = false;
            throw new Error('outbox unavailable');
          }
          return realOutbound.enqueueText(input);
        },
        enqueueImage: (
          input: Parameters<typeof realOutbound.enqueueImage>[0],
        ) => realOutbound.enqueueImage(input),
      };
      const service = new WhatsAppSalesService(
        conversations,
        { listAvailableForConfirmedSize: vi.fn() },
        { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
        outbound,
      );
      const message = {
        whatsappMessageId: `replay-${expectedState}`,
        customerPhone: phone,
        text: command,
      };
      try {
        await expect(service.process(message)).rejects.toThrow(
          'outbox unavailable',
        );
        const [pending] = await sql<
          { state: string; active_summary_version: number | null }[]
        >`
        SELECT state, active_summary_version FROM whatsapp_conversations`;
        expect(pending).toMatchObject({
          state: expectedState,
          active_summary_version: null,
        });
        await service.process(message);
        await service.process(message);
        const [reply] = await sql<{ count: number; body: string }[]>`
        SELECT count(*)::int AS count, min(text_body) AS body
        FROM whatsapp_outbound_messages WHERE idempotency_key = ${`reply:${message.whatsappMessageId}`}`;
        expect(reply?.count).toBe(1);
        expect(reply?.body).toBeTruthy();
      } finally {
        await sql.end({ timeout: 5 });
        await database.close();
      }
    },
  );

  it('uses the pinned size prompt once when restarting a product', async () => {
    const database = createPostgresDatabase(databaseUrl);
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    const flowService = new BotFlowService(database);
    const conversations = new PostgresConversationRepository(database);
    const catalog = new PostgresCatalogRepository(database);
    const orders = new OrderService(
      new PostgresOrderRepository(database),
      (id) => catalog.findReferenceById(id),
    );
    try {
      const flow = createDefaultBotFlow();
      flow.steps.size = {
        enabled: true,
        message: 'Dime tu talla del catálogo especial.',
      };
      await flowService.save(0, flow, 'owner');
      const pinned = await flowService.publish(1, 'owner');
      const welcome = await conversations.receive({
        whatsappMessageId: 'custom-size-welcome',
        customerPhone: phone,
        text: 'hola',
      });
      const order = await orders.create({
        referenceId: '11111111-1111-4111-8111-111111111111',
        size: '37',
        quantity: 1,
        customerPhone: phone,
      });
      await conversations.attachOrder(
        welcome.conversationId!,
        order.referenceId,
        order.id,
      );
      await sql`UPDATE whatsapp_conversations SET state = 'awaiting_confirmation', active_summary_version = 1 WHERE id = ${welcome.conversationId!}`;
      const service = new WhatsAppSalesService(
        conversations,
        { listAvailableForConfirmedSize: vi.fn() },
        { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
        new PostgresOutboundRepository(database),
        orders,
      );
      const edit = {
        whatsappMessageId: 'custom-size-product-edit',
        customerPhone: phone,
        text: 'cambiar producto',
      };
      expect((await conversations.receive(edit)).action).toBe('edit_product');
      await service.process(edit);
      const [row] = await sql<
        {
          flow_version_id: string;
          state: string;
          active_order_id: string | null;
        }[]
      >`
        SELECT flow_version_id, state, active_order_id FROM whatsapp_conversations WHERE id = ${welcome.conversationId!}`;
      expect(row).toMatchObject({
        flow_version_id: pinned.activeVersionId,
        state: 'awaiting_size',
        active_order_id: null,
      });
      const [reply] = await sql<{ count: number; body: string }[]>`
        SELECT count(*)::int AS count, min(text_body) AS body FROM whatsapp_outbound_messages
        WHERE idempotency_key = 'product-restart:custom-size-product-edit'`;
      expect(reply?.count).toBe(1);
      expect(reply?.body).toContain('Dime tu talla del catálogo especial.');
      const [premature] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM whatsapp_outbound_messages
        WHERE idempotency_key = 'reply:custom-size-product-edit'`;
      expect(premature?.count).toBe(0);
    } finally {
      await sql.end({ timeout: 5 });
      await database.close();
    }
  });

  it('does not publish an in-flight older summary after a correction begins', async () => {
    const { database, conversations, orderId, conversationId } =
      await summarizedDraft('awaiting_notes');
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    let enterSummary!: () => void;
    let finishSummary!: (value: {
      version: number;
      draftVersion: number;
      snapshot: { totalCop: number };
      createdAt: Date;
    }) => void;
    const entered = new Promise<void>((resolve) => {
      enterSummary = resolve;
    });
    const summary = new Promise<{
      version: number;
      draftVersion: number;
      snapshot: { totalCop: number };
      createdAt: Date;
    }>((resolve) => {
      finishSummary = resolve;
    });
    const orders = {
      create: vi.fn(),
      update: vi.fn(),
      transition: vi.fn(),
      createSummary: vi.fn(() => {
        enterSummary();
        return summary;
      }),
    };
    const outbound = { enqueueText: vi.fn(), enqueueImage: vi.fn() };
    const service = new WhatsAppSalesService(
      conversations,
      { listAvailableForConfirmedSize: vi.fn() },
      { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
      outbound,
      orders,
      undefined,
      undefined,
      { createQuotes: vi.fn() },
    );
    try {
      const oldProcessing = service.process({
        whatsappMessageId: 'old-summary-generation',
        customerPhone: phone,
        text: 'saltar',
      });
      await entered;
      const earlyConfirmation = await conversations.receive({
        whatsappMessageId: 'before-summary-ready',
        customerPhone: phone,
        text: 'confirmar',
      });
      expect(earlyConfirmation).toMatchObject({
        state: 'awaiting_confirmation',
        activeSummaryVersion: null,
      });
      expect(earlyConfirmation.action).not.toBe('confirm_order');
      const edit = await conversations.receive({
        whatsappMessageId: 'new-address-command',
        customerPhone: phone,
        text: 'cambiar dirección',
      });
      expect(edit).toMatchObject({
        action: 'edit_address',
        state: 'awaiting_address',
        activeSummaryVersion: null,
      });
      finishSummary({
        version: 7,
        draftVersion: 1,
        snapshot: { totalCop: 120_000 },
        createdAt: new Date(),
      });
      await oldProcessing;
      const [persisted] = await sql<
        {
          state: string;
          active_summary_version: number | null;
          active_order_id: string;
        }[]
      >`
        SELECT state, active_summary_version, active_order_id FROM whatsapp_conversations WHERE id = ${conversationId}`;
      expect(persisted).toMatchObject({
        state: 'awaiting_address',
        active_summary_version: null,
        active_order_id: orderId,
      });
      expect(
        outbound.enqueueText.mock.calls.some(
          ([input]) =>
            input.idempotencyKey === 'summary:7:old-summary-generation',
        ),
      ).toBe(false);
      expect(
        (
          await conversations.receive({
            whatsappMessageId: 'old-confirmation',
            customerPhone: phone,
            text: 'confirmar',
          })
        ).action,
      ).not.toBe('confirm_order');
      expect(orders.transition).not.toHaveBeenCalled();
    } finally {
      await sql.end({ timeout: 5 });
      await database.close();
    }
  });

  it.each([
    [
      'cambiar dirección',
      'Carrera 9 # 10-11',
      'edit_address',
      'awaiting_address',
    ],
    ['cambiar municipio', 'Medellín', 'edit_locality', 'awaiting_locality'],
  ] as const)(
    'recovers a corrected summary after its outbound enqueue fails for %s',
    async (command, replacement, editAction, expectedState) => {
      const { database, conversations, orderId } = await summarizedDraft();
      const sql = postgres(databaseUrl, { max: 1, prepare: false });
      const outbound = new PostgresOutboundRepository(database);
      const orders = {
        create: vi.fn(),
        update: vi.fn(),
        transition: vi.fn(),
        createSummary: vi.fn().mockResolvedValue({
          version: 2,
          draftVersion: 2,
          createdAt: new Date(),
          snapshot: {
            shippingPending: false,
            shippingQuote: { carrier: 'envia', insuranceMode: 'none' },
            shippingCostCop: 16_968,
            totalCop: 136_968,
            destination: { address: replacement, locality: replacement },
          },
        }),
      };
      const service = new WhatsAppSalesService(
        conversations,
        { listAvailableForConfirmedSize: vi.fn() },
        { create: vi.fn(), findOption: vi.fn(), getNextCursor: vi.fn() },
        outbound,
        orders,
        {
          list: vi.fn().mockResolvedValue({
            items: [
              {
                carrierCode: '05001000',
                department: 'Antioquia',
                locality: 'Medellín',
              },
            ],
          }),
        },
        undefined,
        { createQuotes: vi.fn() },
      );
      const edit = {
        whatsappMessageId: `failed-summary-command-${editAction}`,
        customerPhone: phone,
        text: command,
      };
      const value = {
        whatsappMessageId: `failed-summary-value-${editAction}`,
        customerPhone: phone,
        text: replacement,
      };
      try {
        await service.process(edit);
        await sql`CREATE OR REPLACE FUNCTION test_reject_summary_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            IF NEW.idempotency_key LIKE 'summary:%' THEN
              RAISE EXCEPTION 'summary outbox unavailable';
            END IF;
            RETURN NEW;
          END
        $$`;
        await sql`CREATE TRIGGER test_reject_summary_outbox BEFORE INSERT ON whatsapp_outbound_messages
          FOR EACH ROW EXECUTE FUNCTION test_reject_summary_outbox()`;
        await expect(service.process(value)).rejects.toThrow(
          'Failed query: insert into "whatsapp_outbound_messages"',
        );
        await sql`DROP TRIGGER test_reject_summary_outbox ON whatsapp_outbound_messages`;
        const [pending] = await sql<
          { state: string; active_summary_version: number | null }[]
        >`
          SELECT state, active_summary_version FROM whatsapp_conversations`;
        expect(pending).toMatchObject({
          state: expectedState,
          active_summary_version: null,
        });
        const [absent] = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM whatsapp_outbound_messages
          WHERE idempotency_key = ${`summary:2:${value.whatsappMessageId}`}`;
        expect(absent?.count).toBe(0);
        const early = await conversations.receive({
          whatsappMessageId: `unseen-confirm-${editAction}`,
          customerPhone: phone,
          text: 'confirmar',
        });
        expect(early.action).not.toBe('confirm_order');
        await service.process({
          ...value,
          text: 'un valor alterado en el reintento',
        });
        await service.process(value);
        if (editAction === 'edit_address')
          expect(orders.update).toHaveBeenLastCalledWith({
            orderId,
            address: replacement,
          });
        const [ready] = await sql<
          {
            state: string;
            active_summary_version: number | null;
            active_order_id: string;
          }[]
        >`
          SELECT state, active_summary_version, active_order_id FROM whatsapp_conversations`;
        expect(ready).toMatchObject({
          state: 'awaiting_confirmation',
          active_summary_version: 2,
          active_order_id: orderId,
        });
        const [queued] = await sql<
          {
            count: number;
            outbound_status: string;
            conversation_status: string;
          }[]
        >`
          SELECT count(*)::int AS count, min(o.status) AS outbound_status,
            min(m.status) AS conversation_status
          FROM whatsapp_outbound_messages o
          JOIN whatsapp_conversation_messages m ON m.outbound_message_id = o.id
          WHERE o.idempotency_key = ${`summary:2:${value.whatsappMessageId}`}`;
        expect(queued).toMatchObject({
          count: 1,
          outbound_status: 'pending',
          conversation_status: 'queued',
        });
        expect(orders.transition).not.toHaveBeenCalled();
      } finally {
        await sql`DROP TRIGGER IF EXISTS test_reject_summary_outbox ON whatsapp_outbound_messages`;
        await sql`DROP FUNCTION IF EXISTS test_reject_summary_outbox()`;
        await sql.end({ timeout: 5 });
        await database.close();
      }
    },
  );
});
