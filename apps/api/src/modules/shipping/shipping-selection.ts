export type SelectableCarrierQuote = Readonly<{
  carrier: string;
  freightCop: number;
  cashOnDeliveryCop: number;
  surchargeCop: number;
}>;

export type CarrierSelectionPolicy = Readonly<{
  preferredCarrier: string | null;
  fallbackPolicy: 'allow' | 'block';
}>;

function normalizePolicy(
  policy: string | null | CarrierSelectionPolicy,
): CarrierSelectionPolicy {
  if (typeof policy === 'string' || policy === null) {
    return { preferredCarrier: policy, fallbackPolicy: 'allow' };
  }
  return policy;
}

export function selectRecommendedCarrier(
  quotes: readonly SelectableCarrierQuote[],
  policyInput: string | null | CarrierSelectionPolicy,
): string | null {
  const policy = normalizePolicy(policyInput);
  const normalizedRule = policy.preferredCarrier?.trim().toLowerCase() ?? null;
  const configured = quotes.find(
    (quote) => quote.carrier.toLowerCase() === normalizedRule,
  );
  if (configured !== undefined) return configured.carrier;

  if (normalizedRule !== null && policy.fallbackPolicy === 'block') {
    return null;
  }

  const envia = quotes.find((quote) => quote.carrier.toLowerCase() === 'envia');
  if (envia !== undefined) return envia.carrier;

  return (
    quotes
      .slice()
      .sort(
        (left, right) =>
          left.freightCop +
          left.cashOnDeliveryCop +
          left.surchargeCop -
          (right.freightCop + right.cashOnDeliveryCop + right.surchargeCop),
      )[0]?.carrier ?? null
  );
}
