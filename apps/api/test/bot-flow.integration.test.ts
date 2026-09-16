import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createPostgresDatabase } from '../src/database/client.js';
import { runMigrations } from '../src/database/migrate.js';
import { BotFlowService } from '../src/modules/conversations/bot-flow-service.js';
import { createDefaultBotFlow } from '../src/modules/conversations/flow-definition.js';
import { PostgresConversationRepository } from '../src/modules/conversations/postgres-conversation-repository.js';
import { requireTestDatabaseUrl } from './helpers/test-database.js';

describe('published bot flow persistence', () => {
  const url = requireTestDatabaseUrl();
  const database = createPostgresDatabase(url);
  const service = new BotFlowService(database);
  const conversations = new PostgresConversationRepository(database);
  beforeAll(() => runMigrations(url));
  beforeEach(() =>
    database.orm.execute(
      'TRUNCATE bot_flow_versions, bot_flow_drafts, whatsapp_conversations CASCADE',
    ),
  );
  afterAll(() => database.close());
  it('bootstraps existing conversations once and preserves an unpublished draft', async () => {
    const draft = createDefaultBotFlow();
    draft.steps.welcome = { enabled: true, message: 'Borrador no publicado' };
    await service.save(0, draft, 'owner');
    await conversations.receive({
      whatsappMessageId: 'legacy-bootstrap',
      customerPhone: '573000000009',
      text: 'hola',
    });
    await service.bootstrap();
    await service.bootstrap();
    const state = await service.get();
    expect(state.versions).toHaveLength(1);
    expect(state.definition.steps.welcome.message).toBe(
      'Borrador no publicado',
    );
    expect(state.versions[0]?.definition.steps.welcome.message).not.toBe(
      'Borrador no publicado',
    );
    const [row] = await database.orm.execute(
      'SELECT flow_version_id, flow_snapshot FROM whatsapp_conversations',
    );
    expect(row?.flow_version_id).toBe(state.activeVersionId);
  });
  it('pins messages to the conversation and restores as a new immutable version', async () => {
    const first = createDefaultBotFlow();
    first.steps.welcome = { enabled: true, message: 'Hola versión uno' };
    first.steps.phone = { enabled: true, message: 'Celular versión uno' };
    await service.save(0, first, 'owner');
    const initial = await service.publish(1, 'owner');
    expect(
      (
        await conversations.receive({
          whatsappMessageId: 'flow-a',
          customerPhone: '573000000001',
          text: 'hola',
        })
      ).reply,
    ).toBe('Hola versión uno');
    const second = createDefaultBotFlow();
    second.steps.welcome = { enabled: true, message: 'Hola versión dos' };
    second.steps.phone = { enabled: true, message: 'Celular versión dos' };
    await service.save(2, second, 'owner');
    expect(
      (
        await conversations.receive({
          whatsappMessageId: 'flow-unpublished',
          customerPhone: '573000000004',
          text: 'hola',
        })
      ).reply,
    ).toBe('Hola versión uno');
    await service.publish(3, 'owner');
    expect(
      (
        await conversations.receive({
          whatsappMessageId: 'flow-b',
          customerPhone: '573000000002',
          text: 'hola',
        })
      ).reply,
    ).toBe('Hola versión dos');
    const existing = await conversations.receive({
      whatsappMessageId: 'flow-c',
      customerPhone: '573000000001',
      text: '37',
    });
    expect(existing.flow?.steps.phone.message).toBe('Celular versión uno');
    const restored = await service.publish(
      4,
      'owner',
      initial.activeVersionId!,
    );
    expect(restored.versions).toHaveLength(3);
    expect(restored.activeVersionId).not.toBe(initial.activeVersionId);
    expect(
      (
        await conversations.receive({
          whatsappMessageId: 'flow-d',
          customerPhone: '573000000003',
          text: 'hola',
        })
      ).reply,
    ).toBe('Hola versión uno');
  });
  it('serializes simultaneous draft edits and rejects stale writes', async () => {
    const results = await Promise.allSettled([
      service.save(0, createDefaultBotFlow(), 'owner'),
      service.save(0, createDefaultBotFlow(), 'owner'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect((await service.get()).revision).toBe(1);
  });
  it('refuses publishing a draft that disables confirmation', async () => {
    const flow = createDefaultBotFlow();
    flow.steps.confirmation = { enabled: false, message: '' };
    await service.save(0, flow, 'owner');
    await expect(service.publish(1, 'owner')).rejects.toMatchObject({
      code: 'invalid_flow',
    });
    expect((await service.get()).activeVersionId).toBeNull();
  });
});
