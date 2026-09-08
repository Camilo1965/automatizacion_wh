import { and, asc, eq } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import {
  salesOrders,
  shippingCarrierRules,
  shippingGuideJobs,
  shippingQuotes,
} from '../../database/schema.js';
import type { CarrierQuote } from './99envios-client.js';
import {
  ShippingDomainError,
  type ShippingGuideRecord,
  type ShippingQuoteRecord,
} from './shipping-quote-service.js';

function mapQuote(
  row: typeof shippingQuotes.$inferSelect,
): ShippingQuoteRecord {
  return {
    id: row.id,
    carrier: row.carrier,
    serviceId: row.serviceId,
    freightCop: row.freightCop,
    cashOnDeliveryCop: row.cashOnDeliveryCop,
    surchargeCop: row.surchargeCop,
    estimatedDays: row.estimatedDays,
    quotedAt: row.quotedAt,
    expiresAt: row.expiresAt,
    recommended: row.recommended,
    selected: row.selected,
  };
}

export class PostgresShippingQuoteRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async preferredCarrier(localityCode: string): Promise<string | null> {
    const [row] = await this.database.orm
      .select({ carrier: shippingCarrierRules.carrier })
      .from(shippingCarrierRules)
      .where(
        and(
          eq(shippingCarrierRules.localityCarrierCode, localityCode),
          eq(shippingCarrierRules.active, true),
        ),
      )
      .limit(1);
    return row?.carrier ?? null;
  }

  async upsertCarrierRule(
    localityCode: string,
    carrier: string,
  ): Promise<void> {
    await this.database.orm
      .insert(shippingCarrierRules)
      .values({ localityCarrierCode: localityCode, carrier })
      .onConflictDoUpdate({
        target: shippingCarrierRules.localityCarrierCode,
        set: { carrier, active: true, updatedAt: new Date() },
      });
  }

  async replaceQuotes(
    input: Readonly<{
      orderId: string;
      draftVersion: number;
      quotes: readonly CarrierQuote[];
      recommendedCarrier: string;
      quotedAt: Date;
      expiresAt: Date;
    }>,
  ): Promise<readonly ShippingQuoteRecord[]> {
    return this.database.orm.transaction(async (tx) => {
      await tx
        .delete(shippingQuotes)
        .where(eq(shippingQuotes.orderId, input.orderId));
      const inserted = await tx
        .insert(shippingQuotes)
        .values(
          input.quotes.map((quote) => ({
            orderId: input.orderId,
            draftVersion: input.draftVersion,
            carrier: quote.carrier,
            serviceId: quote.serviceId,
            freightCop: quote.freightCop,
            cashOnDeliveryCop: quote.cashOnDeliveryCop,
            surchargeCop: quote.surchargeCop,
            estimatedDays: quote.estimatedDays,
            quotedAt: input.quotedAt,
            expiresAt: input.expiresAt,
            recommended: quote.carrier === input.recommendedCarrier,
            selected: quote.carrier === input.recommendedCarrier,
          })),
        )
        .returning();
      return inserted.map(mapQuote);
    });
  }

  async selectQuote(
    orderId: string,
    quoteId: string,
    now: Date,
  ): Promise<readonly ShippingQuoteRecord[]> {
    return this.database.orm.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(salesOrders)
        .where(eq(salesOrders.id, orderId))
        .limit(1)
        .for('update');
      const [quote] = await tx
        .select()
        .from(shippingQuotes)
        .where(
          and(
            eq(shippingQuotes.id, quoteId),
            eq(shippingQuotes.orderId, orderId),
          ),
        )
        .limit(1);
      if (order === undefined || quote === undefined)
        throw new ShippingDomainError(
          'shipping_quote_not_found',
          'Shipping quote was not found',
        );
      if (order.status !== 'draft' || quote.draftVersion !== order.draftVersion)
        throw new ShippingDomainError(
          'shipping_quote_stale',
          'Shipping quote no longer matches the draft',
        );
      if (quote.expiresAt <= now)
        throw new ShippingDomainError(
          'shipping_quote_expired',
          'Shipping quote has expired',
        );
      await tx
        .update(shippingQuotes)
        .set({ selected: false })
        .where(eq(shippingQuotes.orderId, orderId));
      await tx
        .update(shippingQuotes)
        .set({ selected: true })
        .where(eq(shippingQuotes.id, quoteId));
      const rows = await tx
        .select()
        .from(shippingQuotes)
        .where(eq(shippingQuotes.orderId, orderId))
        .orderBy(asc(shippingQuotes.carrier));
      return rows.map(mapQuote);
    });
  }

  async getShipping(orderId: string): Promise<
    Readonly<{
      quotes: readonly ShippingQuoteRecord[];
      guide: ShippingGuideRecord | null;
    }>
  > {
    const quoteRows = await this.database.orm
      .select()
      .from(shippingQuotes)
      .where(eq(shippingQuotes.orderId, orderId))
      .orderBy(asc(shippingQuotes.carrier));
    const [guide] = await this.database.orm
      .select()
      .from(shippingGuideJobs)
      .where(eq(shippingGuideJobs.orderId, orderId))
      .limit(1);
    return {
      quotes: quoteRows.map(mapQuote),
      guide:
        guide === undefined
          ? null
          : {
              status: guide.status as ShippingGuideRecord['status'],
              carrier: guide.carrier,
              preShipmentNumber: guide.preShipmentNumber,
              freightCop: guide.freightCop,
              errorCode: guide.errorCode,
              pdfAvailable: guide.guidePdfStorageKey !== null,
              updatedAt: guide.updatedAt,
            },
    };
  }
}
