import { and, desc, eq, sql } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import {
  integrationSettings,
  integrationDrafts,
  integrationVersions,
  configurationAudits,
} from '../../database/schema.js';

export class PostgresIntegrationSettingsRepository {
  constructor(private readonly database: PostgresDatabase) {}
  async draft(provider: 'whatsapp' | 'shipping') {
    const [draft] = await this.database.orm
      .select()
      .from(integrationDrafts)
      .where(eq(integrationDrafts.provider, provider));
    return draft ?? null;
  }
  async stage(
    provider: 'whatsapp' | 'shipping',
    encryptedPayload: string,
    author: string,
    publicConfiguration: Record<string, unknown> = {},
  ) {
    await this.database.orm.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`kairo.integration.${provider}`}))`,
      );
      const [saved] = await tx
        .insert(integrationDrafts)
        .values({ provider, encryptedPayload, author, publicConfiguration })
        .onConflictDoUpdate({
          target: integrationDrafts.provider,
          set: {
            encryptedPayload,
            publicConfiguration,
            author,
            revision: sql`${integrationDrafts.revision} + 1`,
            testedRevision: null,
            testedAt: null,
            updatedAt: new Date(),
          },
        })
        .returning();
      await tx.insert(configurationAudits).values({
        scope: `integration.${provider}`,
        action: 'draft_saved',
        author,
        revision: saved!.revision,
        snapshot: publicConfiguration,
      });
    });
  }
  async tested(provider: 'whatsapp' | 'shipping', revision: number) {
    const [row] = await this.database.orm
      .update(integrationDrafts)
      .set({ testedRevision: revision, testedAt: new Date() })
      .where(
        and(
          eq(integrationDrafts.provider, provider),
          eq(integrationDrafts.revision, revision),
        ),
      )
      .returning();
    return row !== undefined;
  }
  async activate(
    provider: 'whatsapp' | 'shipping',
    revision: number,
    author: string,
  ) {
    return this.database.orm.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`kairo.integration.${provider}`}))`,
      );
      const [draft] = await tx
        .select()
        .from(integrationDrafts)
        .where(eq(integrationDrafts.provider, provider));
      if (
        !draft ||
        draft.revision !== revision ||
        draft.testedRevision !== revision ||
        !draft.testedAt ||
        Date.now() - draft.testedAt.getTime() > 15 * 60000
      )
        return false;
      const [active] = await tx
        .select()
        .from(integrationVersions)
        .where(
          and(
            eq(integrationVersions.provider, provider),
            eq(integrationVersions.status, 'active'),
          ),
        );
      if (active?.revision === revision) return true;
      await tx
        .update(integrationVersions)
        .set({ status: 'retired' })
        .where(
          and(
            eq(integrationVersions.provider, provider),
            eq(integrationVersions.status, 'active'),
          ),
        );
      await tx.insert(integrationVersions).values({
        provider,
        publicConfiguration: draft.publicConfiguration,
        encryptedPayload: draft.encryptedPayload,
        revision,
        author,
      });
      await tx.insert(configurationAudits).values({
        scope: `integration.${provider}`,
        action: 'activated',
        author,
        revision,
        snapshot: draft.publicConfiguration,
      });
      await tx
        .insert(integrationSettings)
        .values({ provider, encryptedPayload: draft.encryptedPayload })
        .onConflictDoUpdate({
          target: integrationSettings.provider,
          set: {
            encryptedPayload: draft.encryptedPayload,
            updatedAt: new Date(),
          },
        });
      return true;
    });
  }
  async lifecycle() {
    const drafts = await this.database.orm.select().from(integrationDrafts);
    const versions = await this.database.orm
      .select({
        id: integrationVersions.id,
        provider: integrationVersions.provider,
        revision: integrationVersions.revision,
        author: integrationVersions.author,
        createdAt: integrationVersions.createdAt,
        status: integrationVersions.status,
      })
      .from(integrationVersions)
      .orderBy(desc(integrationVersions.createdAt));
    return {
      drafts: drafts.map((draft) => ({
        provider: draft.provider,
        revision: draft.revision,
        tested:
          draft.testedRevision === draft.revision &&
          draft.testedAt !== null &&
          Date.now() - draft.testedAt.getTime() <= 15 * 60000,
        testedAt: draft.testedAt?.toISOString() ?? null,
      })),
      versions: versions.map((version) => ({
        ...version,
        createdAt: version.createdAt.toISOString(),
      })),
    };
  }

  async get(provider: 'whatsapp' | 'shipping'): Promise<string | null> {
    const [row] = await this.database.orm
      .select({ encryptedPayload: integrationSettings.encryptedPayload })
      .from(integrationSettings)
      .where(eq(integrationSettings.provider, provider))
      .limit(1);
    return row?.encryptedPayload ?? null;
  }

  async upsert(
    provider: 'whatsapp' | 'shipping',
    encryptedPayload: string,
  ): Promise<void> {
    await this.database.orm
      .insert(integrationSettings)
      .values({ provider, encryptedPayload })
      .onConflictDoUpdate({
        target: integrationSettings.provider,
        set: { encryptedPayload, updatedAt: new Date() },
      });
  }
}
