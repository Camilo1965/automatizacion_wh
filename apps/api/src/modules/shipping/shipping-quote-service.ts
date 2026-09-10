import type { CarrierQuote, QuoteInput } from './99envios-client.js';
import { selectRecommendedCarrier } from './shipping-selection.js';
import {
  shippingOfferInsurances,
  type InsuranceMode,
  type ShippingPolicy,
} from './shipping-policy.js';

export class ShippingDomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ShippingDomainError';
  }
}

export type ShippingQuoteRecord = CarrierQuote &
  Readonly<{
    id: string;
    quotedAt: Date;
    expiresAt: Date;
    recommended: boolean;
    selected: boolean;
    insuranceMode: InsuranceMode;
    insuranceCop: number;
  }>;

export type ShippingOfferQuote = CarrierQuote &
  Readonly<{ insuranceMode?: InsuranceMode; insuranceCop?: number }>;

export type ShippingRuleRecord = ShippingPolicy &
  Readonly<{
    localityCarrierCode: string;
    active: boolean;
    updatedAt: Date;
  }>;

export type ShippingGuideRecord = Readonly<{
  status: 'pending' | 'processing' | 'created' | 'uncertain' | 'failed';
  carrier: string;
  preShipmentNumber: string | null;
  freightCop: number | null;
  errorCode: string | null;
  pdfAvailable: boolean;
  updatedAt: Date;
}>;

type Repository = Readonly<{
  shippingPolicy(localityCode: string): Promise<ShippingPolicy>;
  replaceQuotes(
    input: Readonly<{
      orderId: string;
      draftVersion: number;
      quotes: readonly ShippingOfferQuote[];
      recommendedCarrier: string;
      recommendedQuotes: readonly Readonly<{
        carrier: string;
        insuranceMode: InsuranceMode;
      }>[];
      automaticallySelect: boolean;
      policy: ShippingPolicy;
      quotedAt: Date;
      expiresAt: Date;
    }>,
  ): Promise<readonly ShippingQuoteRecord[]>;
  selectQuote(
    orderId: string,
    quoteId: string,
    now: Date,
  ): Promise<readonly ShippingQuoteRecord[]>;
  getShipping(orderId: string): Promise<
    Readonly<{
      quotes: readonly ShippingQuoteRecord[];
      guide: ShippingGuideRecord | null;
    }>
  >;
  upsertCarrierRule(localityCode: string, carrier: string): Promise<void>;
  upsertShippingPolicy(
    localityCode: string,
    policy: ShippingPolicy,
  ): Promise<void>;
  defaultShippingPolicy(): Promise<ShippingPolicy>;
  setDefaultShippingPolicy(policy: ShippingPolicy): Promise<void>;
  listShippingRules(): Promise<readonly ShippingRuleRecord[]>;
  deactivateShippingRule(localityCode: string): Promise<void>;
  listObservedCarriers(): Promise<readonly string[]>;
}>;

type OrderPort = Readonly<{
  get(orderId: string): Promise<Readonly<{
    id: string;
    status: string;
    draftVersion: number;
    unitPriceCop: number;
    quantity: number;
    destination: Readonly<{ localityCarrierCode: string | null }>;
  }> | null>;
}>;

type QuoteClient = Readonly<{
  quote(input: QuoteInput): Promise<readonly CarrierQuote[]>;
}>;

function shippingDate(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${date.getUTCFullYear()}`;
}

export class ShippingQuoteService {
  constructor(
    private readonly repository: Repository,
    private readonly orders: OrderPort,
    private readonly client: QuoteClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createQuotes(orderId: string): Promise<readonly ShippingQuoteRecord[]> {
    const order = await this.orders.get(orderId);
    if (order === null)
      throw new ShippingDomainError('order_not_found', 'Order was not found');
    if (order.status !== 'draft')
      throw new ShippingDomainError(
        'order_not_editable',
        'Only draft orders can be quoted',
      );
    const localityCode = order.destination.localityCarrierCode;
    if (localityCode === null || !/^\d{8}$/.test(localityCode)) {
      throw new ShippingDomainError(
        'invalid_shipping_locality',
        'An eight-digit DANE locality is required',
      );
    }
    const quotedAt = this.now();
    const policy = await this.repository.shippingPolicy(localityCode);
    const offers: ShippingOfferQuote[] = [];
    const recommendedQuotes: Array<{
      carrier: string;
      insuranceMode: InsuranceMode;
    }> = [];
    for (const insurance of shippingOfferInsurances(policy)) {
      const quotes = await this.client.quote({
        localityCode,
        declaredValueCop: order.unitPriceCop * order.quantity,
        weightKg: 1,
        lengthCm: 30,
        widthCm: 20,
        heightCm: 12,
        shippingDate: shippingDate(quotedAt),
        insurance,
      });
      const recommendedCarrier = selectRecommendedCarrier(quotes, policy);
      if (recommendedCarrier === null) {
        throw new ShippingDomainError(
          policy.fallbackPolicy === 'block'
            ? 'preferred_carrier_unavailable'
            : 'shipping_unavailable',
          policy.fallbackPolicy === 'block'
            ? 'The required carrier is unavailable for this municipality'
            : 'No carrier returned a usable quote',
        );
      }
      offers.push(
        ...quotes.map((quote) => ({
          ...quote,
          insuranceMode: insurance,
          insuranceCop: quote.insuranceCop ?? 0,
        })),
      );
      recommendedQuotes.push({
        carrier: recommendedCarrier,
        insuranceMode: insurance,
      });
    }
    const recommendedCarrier = recommendedQuotes[0]?.carrier;
    if (recommendedCarrier === undefined)
      throw new ShippingDomainError(
        'shipping_unavailable',
        'No carrier returned a usable quote',
      );
    return this.repository.replaceQuotes({
      orderId,
      draftVersion: order.draftVersion,
      quotes: offers,
      recommendedCarrier,
      recommendedQuotes,
      automaticallySelect: policy.offerMode !== 'customer_choice',
      policy,
      quotedAt,
      expiresAt: new Date(quotedAt.getTime() + 30 * 60 * 1000),
    });
  }

  selectQuote(orderId: string, quoteId: string) {
    return this.repository.selectQuote(orderId, quoteId, this.now());
  }

  getShipping(orderId: string) {
    return this.repository.getShipping(orderId);
  }

  setCarrierRule(localityCode: string, carrier: string) {
    return this.repository.upsertCarrierRule(
      localityCode,
      carrier.trim().toLowerCase(),
    );
  }

  getDefaultPolicy() {
    return this.repository.defaultShippingPolicy();
  }

  setDefaultPolicy(policy: ShippingPolicy) {
    return this.repository.setDefaultShippingPolicy(policy);
  }

  setShippingPolicy(localityCode: string, policy: ShippingPolicy) {
    return this.repository.upsertShippingPolicy(localityCode, policy);
  }

  listShippingRules() {
    return this.repository.listShippingRules();
  }

  deactivateShippingRule(localityCode: string) {
    return this.repository.deactivateShippingRule(localityCode);
  }

  listObservedCarriers() {
    return this.repository.listObservedCarriers();
  }

  async previewPolicy(localityCarrierCode: string) {
    const [policy, rules] = await Promise.all([
      this.repository.shippingPolicy(localityCarrierCode),
      this.repository.listShippingRules(),
    ]);
    return {
      localityCarrierCode,
      source: rules.some(
        (rule) =>
          rule.localityCarrierCode === localityCarrierCode && rule.active,
      )
        ? ('municipality' as const)
        : ('global' as const),
      policy,
    };
  }
}

export type ShippingQuoteOperations = Pick<
  ShippingQuoteService,
  | 'createQuotes'
  | 'selectQuote'
  | 'getShipping'
  | 'setCarrierRule'
  | 'getDefaultPolicy'
  | 'setDefaultPolicy'
  | 'setShippingPolicy'
  | 'listShippingRules'
  | 'deactivateShippingRule'
  | 'listObservedCarriers'
  | 'previewPolicy'
>;
