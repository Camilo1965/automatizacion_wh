import { eq, sql } from 'drizzle-orm';
import type { PostgresDatabase } from '../../database/client.js';
import { ownerAlertDeliveries } from '../../database/schema.js';
import type { IntegrationSettingsService } from '../integrations/integration-settings-service.js';
import { MetaWhatsAppClient } from '../whatsapp/meta-whatsapp-client.js';

/** Claims once before sending; ambiguous outcomes are never sent twice automatically. */
export class OwnerAlertWorker {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly settings: Pick<IntegrationSettingsService, 'getWhatsApp'>,
  ) {}
  async runOnce() {
    const config = await this.settings.getWhatsApp();
    if (!config?.ownerAlertPhone || !config.ownerAlertTemplate) return false;
    const rows = await this.database.orm.execute(sql`
      WITH candidate AS (
        SELECT alert.id, alert.title, alert.detail FROM owner_alerts alert
        WHERE alert.status <> 'resolved' AND alert.created_at > now() - interval '1 day'
          AND NOT EXISTS (SELECT 1 FROM owner_alert_deliveries delivery WHERE delivery.alert_id = alert.id)
        ORDER BY alert.created_at FOR UPDATE SKIP LOCKED LIMIT 1
      ), claimed AS (
        INSERT INTO owner_alert_deliveries (alert_id) SELECT id FROM candidate ON CONFLICT DO NOTHING RETURNING alert_id
      ) SELECT candidate.* FROM candidate JOIN claimed ON claimed.alert_id = candidate.id
    `);
    const row = (
      rows as unknown as Array<{ id: string; title: string; detail: string }>
    )[0];
    if (!row) return false;
    try {
      const sent = await new MetaWhatsAppClient(config).sendOwnerAlert(
        config.ownerAlertPhone,
        config.ownerAlertTemplate,
        `${row.title}\n${row.detail}`,
      );
      await this.database.orm
        .update(ownerAlertDeliveries)
        .set({
          status: 'sent',
          messageId: sent.whatsappMessageId,
          completedAt: new Date(),
        })
        .where(eq(ownerAlertDeliveries.alertId, row.id));
    } catch {
      await this.database.orm
        .update(ownerAlertDeliveries)
        .set({ status: 'uncertain', completedAt: new Date() })
        .where(eq(ownerAlertDeliveries.alertId, row.id));
    }
    return true;
  }
}
