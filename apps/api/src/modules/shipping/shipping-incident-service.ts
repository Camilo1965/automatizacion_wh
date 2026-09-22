import { desc, eq, sql } from 'drizzle-orm';
import type { PostgresDatabase } from '../../database/client.js';
import {
  shippingGuideJobs,
  shippingIncidents,
  configurationAudits,
} from '../../database/schema/index.js';
import type { ConfiguredNinetyNineEnviosClient } from '../integrations/configured-clients.js';
import { ShippingRequestError } from './99envios-client.js';
export class ShippingIncidentService {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly client: Pick<
      ConfiguredNinetyNineEnviosClient,
      'getIncidents' | 'respondIncident'
    >,
  ) {}
  async list() {
    const rows = await this.database.orm
      .select()
      .from(shippingIncidents)
      .orderBy(desc(shippingIncidents.syncedAt));
    return rows.map((row) => ({
      ...row,
      syncedAt: row.syncedAt.toISOString(),
      respondedAt: row.respondedAt?.toISOString() ?? null,
    }));
  }
  async sync() {
    const incidents = await this.client.getIncidents();
    await this.database.orm.transaction(async (tx) => {
      for (const incident of incidents) {
        await tx.insert(configurationAudits).values({
          scope: 'shipping-incident',
          action: 'synced',
          author: '99envios-sync',
          snapshot: {
            id: incident.id,
            guide: incident.numero_preenvio,
            description: incident.novedad,
            observations: incident.observaciones ?? null,
          },
        });
        const [guide] = await tx
          .select({ orderId: shippingGuideJobs.orderId })
          .from(shippingGuideJobs)
          .where(
            eq(shippingGuideJobs.preShipmentNumber, incident.numero_preenvio),
          );
        await tx
          .insert(shippingIncidents)
          .values({
            id: incident.id,
            preShipmentNumber: incident.numero_preenvio,
            orderId: guide?.orderId ?? null,
            description: incident.novedad,
            observations: incident.observaciones ?? null,
          })
          .onConflictDoUpdate({
            target: shippingIncidents.id,
            set: {
              description: incident.novedad,
              observations: incident.observaciones ?? null,
              orderId: guide?.orderId ?? null,
              syncedAt: new Date(),
            },
          });
      }
    });
    return this.list();
  }
  async respond(
    id: number,
    description: string,
    observations: string,
    author: string,
  ) {
    const claimed = await this.database.orm.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${id})`);
      const [incident] = await tx
        .select()
        .from(shippingIncidents)
        .where(eq(shippingIncidents.id, id));
      if (!incident || incident.responseStatus !== 'open')
        throw new Error(
          'La novedad no está disponible para responder. Revisa su estado.',
        );
      await tx
        .update(shippingIncidents)
        .set({ responseStatus: 'processing', response: description, author })
        .where(eq(shippingIncidents.id, id));
      await tx.insert(configurationAudits).values({
        scope: 'shipping-incident',
        action: 'response_claimed',
        author,
        snapshot: {
          id,
          description,
          observations,
          guide: incident.preShipmentNumber,
        },
      });
      return incident;
    });
    try {
      await this.client.respondIncident(
        id,
        claimed.preShipmentNumber,
        description,
        observations,
      );
      await this.database.orm
        .update(shippingIncidents)
        .set({ responseStatus: 'sent', respondedAt: new Date() })
        .where(eq(shippingIncidents.id, id));
      await this.database.orm.insert(configurationAudits).values({
        scope: 'shipping-incident',
        action: 'response_sent',
        author,
        snapshot: { id },
      });
    } catch (error) {
      await this.database.orm
        .update(shippingIncidents)
        .set({
          responseStatus:
            error instanceof ShippingRequestError ? 'open' : 'uncertain',
        })
        .where(eq(shippingIncidents.id, id));
      await this.database.orm.insert(configurationAudits).values({
        scope: 'shipping-incident',
        action:
          error instanceof ShippingRequestError
            ? 'response_rejected'
            : 'response_uncertain',
        author,
        snapshot: { id },
      });
      throw error;
    }
    return this.list();
  }
}
