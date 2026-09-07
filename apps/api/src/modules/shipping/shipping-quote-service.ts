import type { CarrierQuote, QuoteInput } from './99envios-client.js';
import { selectRecommendedCarrier } from './shipping-selection.js';

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
  preferredCarrier(localityCode: string): Promise<string | null>;
  replaceQuotes(
    input: Readonly<{
      orderId: string;
      draftVersion: number;
      quotes: readonly CarrierQuote[];
      recommendedCarrier: string;
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
    const quotes = await this.client.quote({
      localityCode,
      declaredValueCop: order.unitPriceCop * order.quantity,
      weightKg: 1,
      lengthCm: 30,
      widthCm: 20,
      heightCm: 12,
      shippingDate: shippingDate(quotedAt),
    });
    if (quotes.length === 0)
      throw new ShippingDomainError(
        'shipping_unavailable',
        'No carrier returned a usable quote',
      );
    const preferred = await this.repository.preferredCarrier(localityCode);
    const recommendedCarrier = selectRecommendedCarrier(quotes, preferred);
    if (recommendedCarrier === null)
      throw new ShippingDomainError(
        'shipping_unavailable',
        'No carrier returned a usable quote',
      );
    return this.repository.replaceQuotes({
      orderId,
      draftVersion: order.draftVersion,
      quotes,
      recommendedCarrier,
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
}

export type ShippingQuoteOperations = Pick<
  ShippingQuoteService,
  'createQuotes' | 'selectQuote' | 'getShipping' | 'setCarrierRule'
>;
