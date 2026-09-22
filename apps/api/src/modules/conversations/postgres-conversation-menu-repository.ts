import { and, desc, eq, max, sql } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import {
  whatsappCatalogMenuOptions,
  whatsappCatalogMenus,
  whatsappConversations,
} from '../../database/schema/index.js';
import type { AvailableCatalogItem } from '../catalog/catalog-types.js';

export type CreateConversationMenuInput = Readonly<{
  conversationId: string;
  confirmedSize: string;
  items: readonly AvailableCatalogItem[];
  nextAfterCode: string | null;
}>;

export type ConversationMenuOption = Readonly<{
  referenceId: string;
  code: string;
  modelName: string;
  color: string;
  priceCop: number;
}>;

function normalizeReference(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/^REF(?:ERENCIA)?\s*[-:#]?\s*/, '');
}

export class PostgresConversationMenuRepository {
  constructor(private readonly database: PostgresDatabase) {}

  create(
    input: CreateConversationMenuInput,
  ): Promise<{ id: string; version: number }> {
    return this.database.orm.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${input.conversationId}))`,
      );
      const [current] = await tx
        .select({ version: max(whatsappCatalogMenus.version) })
        .from(whatsappCatalogMenus)
        .where(eq(whatsappCatalogMenus.conversationId, input.conversationId));
      const version = (current?.version ?? 0) + 1;
      await tx
        .update(whatsappCatalogMenus)
        .set({ active: false })
        .where(eq(whatsappCatalogMenus.conversationId, input.conversationId));
      const [menu] = await tx
        .insert(whatsappCatalogMenus)
        .values({
          conversationId: input.conversationId,
          version,
          confirmedSize: input.confirmedSize,
          nextAfterCode: input.nextAfterCode,
        })
        .returning({ id: whatsappCatalogMenus.id });
      if (menu === undefined)
        throw new Error('Conversation menu insert failed');
      if (input.items.length > 0) {
        await tx.insert(whatsappCatalogMenuOptions).values(
          input.items.map((item, index) => ({
            menuId: menu.id,
            referenceId: item.referenceId,
            position: index + 1,
            code: item.code,
            modelName: item.modelName,
            color: item.color,
            priceCop: item.priceCop,
            photoStorageKey: item.photoStorageKey,
            photoMimeType: item.photoMimeType,
          })),
        );
      }
      await tx
        .update(whatsappConversations)
        .set({ activeMenuVersion: version, updatedAt: new Date() })
        .where(eq(whatsappConversations.id, input.conversationId));
      return { id: menu.id, version };
    });
  }

  async findOption(
    conversationId: string,
    input: string,
  ): Promise<ConversationMenuOption | null> {
    const code = normalizeReference(input);
    const [row] = await this.database.orm
      .select({
        referenceId: whatsappCatalogMenuOptions.referenceId,
        code: whatsappCatalogMenuOptions.code,
        modelName: whatsappCatalogMenuOptions.modelName,
        color: whatsappCatalogMenuOptions.color,
        priceCop: whatsappCatalogMenuOptions.priceCop,
      })
      .from(whatsappCatalogMenus)
      .innerJoin(
        whatsappCatalogMenuOptions,
        eq(whatsappCatalogMenuOptions.menuId, whatsappCatalogMenus.id),
      )
      .where(
        and(
          eq(whatsappCatalogMenus.conversationId, conversationId),
          eq(whatsappCatalogMenus.active, true),
          eq(whatsappCatalogMenuOptions.code, code),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async getNextCursor(conversationId: string): Promise<string | null> {
    const [row] = await this.database.orm
      .select({ nextAfterCode: whatsappCatalogMenus.nextAfterCode })
      .from(whatsappCatalogMenus)
      .where(
        and(
          eq(whatsappCatalogMenus.conversationId, conversationId),
          eq(whatsappCatalogMenus.active, true),
        ),
      )
      .orderBy(desc(whatsappCatalogMenus.version))
      .limit(1);
    return row?.nextAfterCode ?? null;
  }
}
