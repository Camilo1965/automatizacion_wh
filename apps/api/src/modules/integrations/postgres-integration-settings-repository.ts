import { eq } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import { integrationSettings } from '../../database/schema.js';

export class PostgresIntegrationSettingsRepository {
  constructor(private readonly database: PostgresDatabase) {}

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
