import { sql } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import type {
  DashboardCounts,
  DashboardRepository,
} from './dashboard-service.js';

type DashboardRow = {
  conversations: number;
  guide_incidents: number;
  ready_to_dispatch: number;
  awaiting_confirmation: number;
  closure_pending: boolean;
  low_stock_references: number;
  new_conversations: number;
  confirmed_orders: number;
  dispatched_orders: number;
  cod_value_cop: number;
  guides_created: number;
  reserved_units: number;
};

export class PostgresDashboardRepository implements DashboardRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async getSummary(dayStart: Date, dayEnd: Date): Promise<DashboardCounts> {
    const start = dayStart.toISOString();
    const end = dayEnd.toISOString();
    const rows = await this.database.orm.execute<DashboardRow>(sql`
      SELECT
        (SELECT count(*)::int FROM whatsapp_conversations WHERE mode = 'human') AS conversations,
        (SELECT count(*)::int FROM shipping_guide_jobs WHERE status IN ('uncertain', 'failed')) AS guide_incidents,
        (
          SELECT count(*)::int
          FROM sales_orders AS orders
          WHERE orders.status = 'confirmed'
            AND EXISTS (
              SELECT 1 FROM shipping_guide_jobs AS jobs
              WHERE jobs.order_id = orders.id AND jobs.status = 'created'
            )
        ) AS ready_to_dispatch,
        (
          SELECT count(*)::int
          FROM sales_orders
          WHERE status = 'draft' AND latest_summary_version > 0
        ) AS awaiting_confirmation,
        EXISTS (
          SELECT 1
          FROM inventory_closures
          WHERE status = 'generated' AND acknowledged_at IS NULL
        ) AS closure_pending,
        (
          SELECT count(*)::int
          FROM (
            SELECT cr.id
            FROM catalog_references AS cr
            JOIN catalog_stock AS stock ON stock.reference_id = cr.id
            WHERE cr.active = true
            GROUP BY cr.id
            HAVING sum(stock.physical_quantity - stock.reserved_quantity) BETWEEN 1 AND 2
          ) AS low_stock
        ) AS low_stock_references,
        (
          SELECT count(*)::int FROM whatsapp_conversations
          WHERE created_at >= ${start}::timestamptz AND created_at < ${end}::timestamptz
        ) AS new_conversations,
        (
          SELECT count(*)::int FROM order_status_events
          WHERE next_status = 'confirmed' AND created_at >= ${start}::timestamptz AND created_at < ${end}::timestamptz
        ) AS confirmed_orders,
        (
          SELECT count(*)::int FROM order_status_events
          WHERE next_status = 'dispatched' AND created_at >= ${start}::timestamptz AND created_at < ${end}::timestamptz
        ) AS dispatched_orders,
        (
          SELECT coalesce(sum((summaries.snapshot->>'totalCop')::int), 0)::int
          FROM order_confirmations AS confirmations
          JOIN order_summaries AS summaries
            ON summaries.order_id = confirmations.order_id
            AND summaries.version = confirmations.summary_version
          WHERE confirmations.created_at >= ${start}::timestamptz AND confirmations.created_at < ${end}::timestamptz
        ) AS cod_value_cop,
        (
          SELECT count(*)::int FROM shipping_guide_jobs
          WHERE status = 'created' AND updated_at >= ${start}::timestamptz AND updated_at < ${end}::timestamptz
        ) AS guides_created,
        (
          SELECT coalesce(sum(delta), 0)::int FROM reservation_movements
          WHERE reason = 'confirmed' AND delta > 0 AND created_at >= ${start}::timestamptz AND created_at < ${end}::timestamptz
        ) AS reserved_units
    `);
    const row = rows[0];
    if (!row) throw new Error('Dashboard aggregate returned no row');

    return {
      queues: {
        conversations: row.conversations,
        guideIncidents: row.guide_incidents,
        readyToDispatch: row.ready_to_dispatch,
        awaitingConfirmation: row.awaiting_confirmation,
        closurePending: row.closure_pending,
        lowStockReferences: row.low_stock_references,
        integrationFailures: 0,
      },
      today: {
        newConversations: row.new_conversations,
        confirmedOrders: row.confirmed_orders,
        dispatchedOrders: row.dispatched_orders,
        codValueCop: row.cod_value_cop,
        guidesCreated: row.guides_created,
        reservedUnits: row.reserved_units,
        averageFirstResponseSeconds: null,
      },
    };
  }
}
