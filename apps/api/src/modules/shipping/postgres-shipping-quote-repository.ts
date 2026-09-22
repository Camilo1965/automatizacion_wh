import { and, asc, eq, sql } from 'drizzle-orm';

import type { PostgresDatabase } from '../../database/client.js';
import {
  salesOrders,
  shippingCarrierRules,
  shippingGuideJobs,
  shippingLocalities,
  shippingObservedCarriers,
  shippingPolicyAudits,
  shippingPreferences,
  shippingQuotes,
  configurationAudits,
} from '../../database/schema/index.js';
import {
  DEFAULT_SHIPPING_POLICY,
  resolveShippingPolicy,
  type ShippingPolicy,
} from './shipping-policy.js';
import {
  ShippingDomainError,
  type ShippingGuideRecord,
  type ShippingOfferQuote,
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
    insuranceMode: row.insuranceMode as ShippingQuoteRecord['insuranceMode'],
    insuranceCop: row.insuranceCop,
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
    return (await this.shippingPolicy(localityCode)).preferredCarrier;
  }

  async defaultShippingPolicy(): Promise<ShippingPolicy> {
    const [row] = await this.database.orm
      .select()
      .from(shippingPreferences)
      .where(eq(shippingPreferences.id, true))
      .limit(1);
    return row === undefined
      ? { ...DEFAULT_SHIPPING_POLICY, revision: 0 }
      : {
          ...(row.policyConfig as Partial<ShippingPolicy> | null),
          preferredCarrier: row.carrier,
          fallbackPolicy:
            row.fallbackPolicy as ShippingPolicy['fallbackPolicy'],
          offerMode: row.offerMode as ShippingPolicy['offerMode'],
          protectedInsurance:
            row.protectedInsurance as ShippingPolicy['protectedInsurance'],
        };
  }

  async setDefaultShippingPolicy(
    policy: ShippingPolicy,
    author = 'owner',
  ): Promise<void> {
    await this.database.orm.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('kairo.shipping.global'))`,
      );
      const [current] = await tx
        .select()
        .from(shippingPreferences)
        .where(eq(shippingPreferences.id, true));
      const revision =
        (current?.policyConfig as Partial<ShippingPolicy> | null)?.revision ??
        0;
      if (policy.revision !== undefined && policy.revision !== revision)
        throw new ShippingDomainError(
          'stale_policy',
          'La preferencia cambió. Recarga la configuración antes de guardar.',
        );
      const snapshot = { ...policy, revision: revision + 1 };
      await tx
        .insert(shippingPreferences)
        .values({
          id: true,
          policyConfig: snapshot,
          carrier: policy.preferredCarrier,
          fallbackPolicy: policy.fallbackPolicy,
          offerMode: policy.offerMode,
          protectedInsurance: policy.protectedInsurance,
        })
        .onConflictDoUpdate({
          target: shippingPreferences.id,
          set: {
            policyConfig: snapshot,
            carrier: policy.preferredCarrier,
            fallbackPolicy: policy.fallbackPolicy,
            offerMode: policy.offerMode,
            protectedInsurance: policy.protectedInsurance,
            updatedAt: new Date(),
          },
        });
      await tx
        .insert(shippingPolicyAudits)
        .values({ scope: 'global', policy: snapshot, action: 'upsert' });
      await tx.insert(configurationAudits).values({
        scope: 'shipping-policy',
        action: 'published',
        author,
        revision: snapshot.revision,
        snapshot: { scope: 'global', policy: snapshot },
      });
    });
  }

  async shippingPolicy(localityCode: string): Promise<ShippingPolicy> {
    const [defaults, rows] = await Promise.all([
      this.defaultShippingPolicy(),
      this.database.orm
        .select()
        .from(shippingCarrierRules)
        .where(eq(shippingCarrierRules.localityCarrierCode, localityCode))
        .limit(1),
    ]);
    const row = rows[0];
    return resolveShippingPolicy(
      defaults,
      row === undefined
        ? null
        : {
            ...(row.policyConfig as Partial<ShippingPolicy> | null),
            preferredCarrier: row.carrier,
            fallbackPolicy:
              row.fallbackPolicy as ShippingPolicy['fallbackPolicy'],
            offerMode: row.offerMode as ShippingPolicy['offerMode'],
            protectedInsurance:
              row.protectedInsurance as ShippingPolicy['protectedInsurance'],
            active: row.active,
          },
    );
  }

  async upsertShippingPolicy(
    localityCode: string,
    policy: ShippingPolicy,
    author = 'owner',
  ): Promise<void> {
    await this.database.orm.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`kairo.shipping.${localityCode}`}))`,
      );
      const [current] = await tx
        .select()
        .from(shippingCarrierRules)
        .where(eq(shippingCarrierRules.localityCarrierCode, localityCode));
      const revision =
        (current?.policyConfig as Partial<ShippingPolicy> | null)?.revision ??
        0;
      if (policy.revision !== undefined && policy.revision !== revision)
        throw new ShippingDomainError(
          'stale_policy',
          'La regla municipal cambió. Recárgala antes de guardar.',
        );
      const snapshot = { ...policy, revision: revision + 1 };
      await tx
        .insert(shippingCarrierRules)
        .values({
          localityCarrierCode: localityCode,
          policyConfig: snapshot,
          carrier: policy.preferredCarrier,
          fallbackPolicy: policy.fallbackPolicy,
          offerMode: policy.offerMode,
          protectedInsurance: policy.protectedInsurance,
        })
        .onConflictDoUpdate({
          target: shippingCarrierRules.localityCarrierCode,
          set: {
            policyConfig: snapshot,
            carrier: policy.preferredCarrier,
            fallbackPolicy: policy.fallbackPolicy,
            offerMode: policy.offerMode,
            protectedInsurance: policy.protectedInsurance,
            active: true,
            updatedAt: new Date(),
          },
        });
      await tx.insert(shippingPolicyAudits).values({
        scope: 'municipality',
        localityCarrierCode: localityCode,
        policy: snapshot,
        action: 'upsert',
      });
      await tx.insert(configurationAudits).values({
        scope: 'shipping-policy',
        action: 'published',
        author,
        revision: snapshot.revision,
        snapshot: { localityCode, policy: snapshot },
      });
    });
  }

  async listShippingRules() {
    const rows = await this.database.orm
      .select({ rule: shippingCarrierRules, locality: shippingLocalities })
      .from(shippingCarrierRules)
      .innerJoin(
        shippingLocalities,
        eq(
          shippingLocalities.carrierCode,
          shippingCarrierRules.localityCarrierCode,
        ),
      )
      .orderBy(asc(shippingCarrierRules.localityCarrierCode));
    return rows.map(({ rule, locality }) => ({
      ...(rule.policyConfig as Partial<ShippingPolicy> | null),
      localityCarrierCode: rule.localityCarrierCode,
      locality: locality.locality,
      department: locality.department,
      preferredCarrier: rule.carrier,
      fallbackPolicy: rule.fallbackPolicy as ShippingPolicy['fallbackPolicy'],
      offerMode: rule.offerMode as ShippingPolicy['offerMode'],
      protectedInsurance:
        rule.protectedInsurance as ShippingPolicy['protectedInsurance'],
      active: rule.active,
      updatedAt: rule.updatedAt,
    }));
  }

  async deactivateShippingRule(
    localityCode: string,
    author = 'owner',
  ): Promise<void> {
    await this.database.orm.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`kairo.shipping.${localityCode}`}))`,
      );
      const [row] = await tx
        .update(shippingCarrierRules)
        .set({
          active: false,
          updatedAt: new Date(),
          policyConfig: sql`COALESCE(${shippingCarrierRules.policyConfig}, '{}'::jsonb) || jsonb_build_object('revision', COALESCE((${shippingCarrierRules.policyConfig}->>'revision')::integer, 0) + 1)`,
        })
        .where(eq(shippingCarrierRules.localityCarrierCode, localityCode))
        .returning();
      if (row !== undefined) {
        await tx.insert(configurationAudits).values({
          scope: 'shipping-policy',
          action: 'deactivated',
          author,
          snapshot: { localityCode, policy: row.policyConfig },
        });
        await tx.insert(shippingPolicyAudits).values({
          scope: 'municipality',
          localityCarrierCode: localityCode,
          policy: {
            preferredCarrier: row.carrier,
            fallbackPolicy: row.fallbackPolicy,
            offerMode: row.offerMode,
            protectedInsurance: row.protectedInsurance,
          },
          action: 'deactivate',
        });
      }
    });
  }

  async listObservedCarriers(): Promise<readonly string[]> {
    const rows = await this.database.orm
      .select({ carrier: shippingObservedCarriers.carrier })
      .from(shippingObservedCarriers)
      .orderBy(asc(shippingObservedCarriers.carrier));
    return rows.map((row) => row.carrier);
  }

  async upsertCarrierRule(
    localityCode: string,
    carrier: string,
  ): Promise<void> {
    await this.upsertShippingPolicy(localityCode, {
      ...DEFAULT_SHIPPING_POLICY,
      preferredCarrier: carrier,
    });
  }

  async replaceQuotes(
    input: Readonly<{
      orderId: string;
      draftVersion: number;
      quotes: readonly ShippingOfferQuote[];
      recommendedCarrier: string;
      recommendedQuotes?: readonly Readonly<{
        carrier: string;
        insuranceMode: ShippingQuoteRecord['insuranceMode'];
      }>[];
      automaticallySelect?: boolean;
      policy?: ShippingPolicy;
      quotedAt: Date;
      expiresAt: Date;
    }>,
  ): Promise<readonly ShippingQuoteRecord[]> {
    return this.database.orm.transaction(async (tx) => {
      await tx
        .delete(shippingQuotes)
        .where(eq(shippingQuotes.orderId, input.orderId));
      for (const carrier of new Set(
        input.quotes.map((quote) => quote.carrier),
      )) {
        await tx
          .insert(shippingObservedCarriers)
          .values({ carrier })
          .onConflictDoUpdate({
            target: shippingObservedCarriers.carrier,
            set: { lastSeenAt: new Date() },
          });
      }
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
            insuranceMode: quote.insuranceMode ?? 'none',
            insuranceCop: quote.insuranceCop ?? 0,
            policySnapshot: input.policy ?? null,
            estimatedDays: quote.estimatedDays,
            quotedAt: input.quotedAt,
            expiresAt: input.expiresAt,
            recommended:
              input.recommendedQuotes?.some(
                (candidate) =>
                  candidate.carrier === quote.carrier &&
                  candidate.insuranceMode === (quote.insuranceMode ?? 'none'),
              ) ?? quote.carrier === input.recommendedCarrier,
            selected:
              (input.automaticallySelect ?? true) &&
              (input.recommendedQuotes?.[0]?.carrier ??
                input.recommendedCarrier) === quote.carrier &&
              (input.recommendedQuotes?.[0]?.insuranceMode ??
                quote.insuranceMode ??
                'none') === (quote.insuranceMode ?? 'none'),
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
