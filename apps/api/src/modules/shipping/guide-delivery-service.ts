import { eq, sql } from 'drizzle-orm';
import type { PostgresDatabase } from '../../database/client.js';
import { shippingGuideJobs } from '../../database/schema/index.js';
import type { PostgresOutboundRepository } from '../whatsapp/postgres-outbound-repository.js';
import type { ShippingGuideOperations } from './shipping-guide-service.js';
import { renderFlowMessage } from '../conversations/configured-flow.js';
import type { AlertService } from '../alerts/alert-service.js';
import { evaluateServiceWindow } from '../conversations/service-window.js';

export const GUIDE_CUSTOMER_DELIVERY_POLICY = 'operator_only' as const;

export class GuideDeliveryService {
  constructor(
    private readonly database: PostgresDatabase,
    private readonly guides: ShippingGuideOperations,
    private readonly outbound: PostgresOutboundRepository,
    private readonly alerts?: AlertService,
  ) {}
  async runOnce() {
    const rows = await this.database.orm.execute(sql`
      SELECT job.id, job.order_id, job.carrier, job.confirmed_total_cop, orders.size, orders.customer_name, orders.order_number, reference.code,
        conversation.id AS conversation_id, conversation.customer_phone, conversation.last_inbound_message_at,
        conversation.flow_snapshot->'steps'->'guide'->>'message' AS caption
      FROM shipping_guide_jobs job JOIN whatsapp_conversations conversation ON conversation.active_order_id = job.order_id
        JOIN sales_orders orders ON orders.id = job.order_id JOIN catalog_references reference ON reference.id = orders.reference_id
      WHERE job.status = 'created' AND job.guide_pdf_retired_at IS NULL
        AND job.pdf_delivery_attempts < 3
        AND (job.pdf_last_attempt_at IS NULL OR job.pdf_last_attempt_at < now() - interval '60 seconds')
        AND conversation.last_inbound_message_at > now() - interval '24 hours'
        AND NOT EXISTS (SELECT 1 FROM whatsapp_outbound_messages outbound WHERE outbound.idempotency_key = concat('guide:', job.id, ':', job.guide_pdf_sha256))
      ORDER BY job.created_at LIMIT 1
    `);
    const row = (
      rows as unknown as Array<{
        id: string;
        order_id: string;
        conversation_id: string;
        customer_phone: string;
        caption: string | null;
        carrier: string;
        confirmed_total_cop: number | null;
        size: string;
        customer_name: string | null;
        order_number: number;
        code: string;
        last_inbound_message_at: Date;
      }>
    )[0];
    if (!row) return false;
    if (!evaluateServiceWindow(row.last_inbound_message_at).open) return false;
    // This product policy overrides every flow snapshot, including historical
    // versions that enabled customer delivery. The authenticated operator
    // download remains available through the shipping guide endpoint.
    if (GUIDE_CUSTOMER_DELIVERY_POLICY === 'operator_only') return false;
    await this.database.orm
      .update(shippingGuideJobs)
      .set({
        pdfDeliveryAttempts: sql`${shippingGuideJobs.pdfDeliveryAttempts} + 1`,
        pdfLastAttemptAt: new Date(),
      })
      .where(eq(shippingGuideJobs.id, row.id));
    try {
      await this.guides.fetchPdf(row.order_id);
    } catch (error) {
      const [failed] = await this.database.orm
        .select()
        .from(shippingGuideJobs)
        .where(eq(shippingGuideJobs.id, row.id));
      const attempts = failed?.pdfDeliveryAttempts ?? 0;
      await this.alerts?.open({
        type: 'guide_pdf_unavailable',
        severity: attempts >= 3 ? 'critical' : 'warning',
        title: 'No se pudo descargar el PDF de la guía',
        detail:
          attempts >= 3
            ? 'La guía ya existe. Revisa el pedido y descarga el PDF desde el panel; no crees otra guía.'
            : 'La guía ya existe, pero su PDF aún no está disponible. Revisa el pedido y reintenta desde el panel; no crees otra guía.',
        entityUrl: `/orders/${row.order_id}`,
        entityId: row.id,
        retrySafe: true,
      });
      throw error;
    }
    const [job] = await this.database.orm
      .select()
      .from(shippingGuideJobs)
      .where(eq(shippingGuideJobs.id, row.id));
    if (!job?.guidePdfStorageKey || !job.guidePdfSha256)
      throw new Error('Guide PDF was not stored');
    await this.outbound.enqueueDocument({
      conversationId: row.conversation_id,
      customerPhone: row.customer_phone,
      storageKey: job.guidePdfStorageKey,
      caption: renderFlowMessage(
        row.caption ||
          'Tu guía de envío está lista. Conserva este documento para consultar tu pedido.',
        {
          talla: row.size,
          nombre: row.customer_name ?? '',
          pedido: `PED-${String(row.order_number).padStart(6, '0')}`,
          referencia: row.code,
          transportadora: row.carrier,
          total:
            row.confirmed_total_cop == null
              ? ''
              : new Intl.NumberFormat('es-CO', {
                  style: 'currency',
                  currency: 'COP',
                  maximumFractionDigits: 0,
                }).format(row.confirmed_total_cop),
        },
      ).slice(0, 1024),
      idempotencyKey: `guide:${row.id}:${job.guidePdfSha256}`,
    });
    return true;
  }
}
