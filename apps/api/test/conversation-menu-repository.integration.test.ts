import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { PostgresConversationMenuRepository } from '../src/modules/conversations/postgres-conversation-menu-repository.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

const databaseUrl = requireTestDatabaseUrl();

describe('conversation catalog menus', () => {
  beforeAll(() => runMigrations(databaseUrl));
  beforeEach(async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await sql`TRUNCATE TABLE whatsapp_catalog_menu_options, whatsapp_catalog_menus, whatsapp_conversation_events, whatsapp_conversations, catalog_references CASCADE`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it('creates immutable versions and resolves only an active shown option', async () => {
    const sql = postgres(databaseUrl, { max: 1, prepare: false });
    const [conversation] = await sql<{ id: string }[]>`
      INSERT INTO whatsapp_conversations
        (customer_phone, state, last_inbound_message_at)
      VALUES ('+573001234567', 'showing_models', now()) RETURNING id
    `;
    await sql`
      INSERT INTO catalog_references
        (id, code, model_name, color, price_cop)
      VALUES
        ('11111111-1111-4111-8111-111111111111', '01', 'Tenis Camila', 'Negro', 120000),
        ('22222222-2222-4222-8222-222222222222', '02', 'Tenis Camila', 'Blanco', 120000)
      ON CONFLICT (id) DO NOTHING
    `;
    await sql.end({ timeout: 5 });
    const database = createPostgresDatabase(databaseUrl);
    const repository = new PostgresConversationMenuRepository(database);
    try {
      const item = {
        referenceId: '11111111-1111-4111-8111-111111111111',
        code: '01',
        modelName: 'Tenis Camila',
        color: 'Negro',
        priceCop: 120_000,
        confirmedSize: '37.0',
        availableQuantity: 2,
        photoStorageKey: 'catalog/01.jpg',
        photoMimeType: 'image/jpeg' as const,
      };
      const first = await repository.create({
        conversationId: conversation!.id,
        confirmedSize: '37.0',
        items: [item],
        nextAfterCode: '01',
      });
      const second = await repository.create({
        conversationId: conversation!.id,
        confirmedSize: '37.0',
        items: [
          {
            ...item,
            referenceId: '22222222-2222-4222-8222-222222222222',
            code: '02',
          },
        ],
        nextAfterCode: null,
      });
      expect([first.version, second.version]).toEqual([1, 2]);
      await expect(
        repository.findOption(conversation!.id, 'REF 01'),
      ).resolves.toBeNull();
      await expect(
        repository.findOption(conversation!.id, '02'),
      ).resolves.toMatchObject({ code: '02' });
      await expect(
        repository.getNextCursor(conversation!.id),
      ).resolves.toBeNull();
    } finally {
      await database.close();
    }
  });
});
