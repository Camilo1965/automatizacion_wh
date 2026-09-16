import { BotFlowDefinitionSchema } from '@camila/contracts';
import { desc, eq, sql } from 'drizzle-orm';
import type { PostgresDatabase } from '../../database/client.js';
import {
  botFlowDrafts,
  botFlowVersions,
  configurationAudits,
} from '../../database/schema.js';
import { createDefaultBotFlow, validateBotFlow } from './flow-definition.js';

export class BotFlowError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class BotFlowService {
  constructor(private readonly database: PostgresDatabase) {}

  async bootstrap() {
    await this.database.orm.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('kairo.bot-flow'))`,
      );
      const [draft] = await tx
        .select()
        .from(botFlowDrafts)
        .where(eq(botFlowDrafts.id, 'sales'));
      let versionId = draft?.activeVersionId;
      let definition = createDefaultBotFlow();
      if (versionId) {
        const [active] = await tx
          .select()
          .from(botFlowVersions)
          .where(eq(botFlowVersions.id, versionId));
        definition = BotFlowDefinitionSchema.parse(active!.definition);
      } else {
        const [latest] = await tx
          .select()
          .from(botFlowVersions)
          .orderBy(desc(botFlowVersions.revision))
          .limit(1);
        const [version] = await tx
          .insert(botFlowVersions)
          .values({
            revision: (latest?.revision ?? 0) + 1,
            definition,
            author: 'bootstrap',
          })
          .returning();
        versionId = version!.id;
        await tx
          .insert(botFlowDrafts)
          .values({
            id: 'sales',
            revision: 0,
            definition,
            activeVersionId: versionId,
            author: 'bootstrap',
          })
          .onConflictDoUpdate({
            target: botFlowDrafts.id,
            set: { activeVersionId: versionId },
          });
      }
      await tx.execute(
        sql`UPDATE whatsapp_conversations SET flow_version_id = ${versionId}, flow_snapshot = COALESCE(flow_snapshot, ${JSON.stringify(definition)}::jsonb) WHERE flow_version_id IS NULL`,
      );
    });
  }

  async get() {
    const [draft] = await this.database.orm
      .select()
      .from(botFlowDrafts)
      .where(eq(botFlowDrafts.id, 'sales'));
    const versions = await this.database.orm
      .select()
      .from(botFlowVersions)
      .orderBy(desc(botFlowVersions.revision));
    return {
      revision: draft?.revision ?? 0,
      definition: BotFlowDefinitionSchema.parse(
        draft?.definition ?? createDefaultBotFlow(),
      ),
      activeVersionId: draft?.activeVersionId ?? null,
      versions: versions.map((version) => ({
        ...version,
        definition: BotFlowDefinitionSchema.parse(version.definition),
        createdAt: version.createdAt.toISOString(),
      })),
    };
  }
  async audit() {
    const rows = await this.database.orm
      .select()
      .from(configurationAudits)
      .orderBy(desc(configurationAudits.createdAt))
      .limit(100);
    return rows.map((row) => ({
      id: row.id,
      scope: row.scope,
      action: row.action,
      author: row.author,
      revision: row.revision,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async save(revision: number, input: unknown, author: string) {
    const definition = BotFlowDefinitionSchema.parse(input);
    await this.database.orm.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('kairo.bot-flow'))`,
      );
      const [draft] = await tx
        .select()
        .from(botFlowDrafts)
        .where(eq(botFlowDrafts.id, 'sales'));
      if ((draft?.revision ?? 0) !== revision)
        throw new BotFlowError(
          'stale_revision',
          409,
          'El flujo cambió. Recarga antes de guardar.',
        );
      await tx
        .insert(botFlowDrafts)
        .values({ id: 'sales', revision: revision + 1, definition, author })
        .onConflictDoUpdate({
          target: botFlowDrafts.id,
          set: {
            revision: revision + 1,
            definition,
            author,
            updatedAt: new Date(),
          },
        });
      await tx.insert(configurationAudits).values({
        scope: 'bot-flow',
        action: 'draft_saved',
        author,
        revision: revision + 1,
        snapshot: { definition },
      });
    });
    return this.get();
  }

  async publish(revision: number, author: string, restoreId?: string) {
    await this.database.orm.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('kairo.bot-flow'))`,
      );
      const [draft] = await tx
        .select()
        .from(botFlowDrafts)
        .where(eq(botFlowDrafts.id, 'sales'));
      if ((draft?.revision ?? 0) !== revision)
        throw new BotFlowError(
          'stale_revision',
          409,
          'El flujo cambió. Recarga antes de publicar.',
        );
      const [restore] =
        restoreId === undefined
          ? []
          : await tx
              .select()
              .from(botFlowVersions)
              .where(eq(botFlowVersions.id, restoreId));
      if (restoreId !== undefined && restore === undefined)
        throw new BotFlowError(
          'version_not_found',
          404,
          'La versión no existe.',
        );
      const definition = BotFlowDefinitionSchema.parse(
        restore?.definition ?? draft?.definition ?? createDefaultBotFlow(),
      );
      const issues = validateBotFlow(definition);
      if (issues.length > 0)
        throw new BotFlowError(
          'invalid_flow',
          400,
          issues.map((issue) => issue.message).join(' '),
        );
      const [latest] = await tx
        .select({ revision: botFlowVersions.revision })
        .from(botFlowVersions)
        .orderBy(desc(botFlowVersions.revision))
        .limit(1);
      const [version] = await tx
        .insert(botFlowVersions)
        .values({ revision: (latest?.revision ?? 0) + 1, definition, author })
        .returning();
      await tx.insert(configurationAudits).values({
        scope: 'bot-flow',
        action: restoreId ? 'restored' : 'published',
        author,
        revision: revision + 1,
        snapshot: { versionId: version!.id, restoredFrom: restoreId ?? null },
      });
      await tx
        .insert(botFlowDrafts)
        .values({
          id: 'sales',
          revision: revision + 1,
          definition,
          author,
          activeVersionId: version!.id,
        })
        .onConflictDoUpdate({
          target: botFlowDrafts.id,
          set: {
            revision: revision + 1,
            definition,
            author,
            activeVersionId: version!.id,
            updatedAt: new Date(),
          },
        });
    });
    return this.get();
  }
}
