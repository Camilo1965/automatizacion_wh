export type SelectableCarrierQuote = Readonly<{
  carrier: string;
  freightCop: number;
  cashOnDeliveryCop: number;
  surchargeCop: number;
  insuranceCop?: number;
}>;

export type CarrierSelectionPolicy = Readonly<{
  preferredCarrier: string | null;
  fallbackPolicy: 'allow' | 'block';
  allowedCarriers?: readonly string[] | undefined;
  excludedCarriers?: readonly string[] | undefined;
  orderedCarriers?: readonly string[] | undefined;
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
  const eligible = quotes.filter(
    (quote) =>
      (!policy.allowedCarriers?.length ||
        policy.allowedCarriers.includes(quote.carrier.toLowerCase())) &&
      !policy.excludedCarriers?.includes(quote.carrier.toLowerCase()) &&
      [
        quote.freightCop,
        quote.cashOnDeliveryCop,
        quote.surchargeCop,
        quote.insuranceCop ?? 0,
      ].every((cost) => Number.isFinite(cost) && cost >= 0),
  );
  const normalizedRule = policy.preferredCarrier?.trim().toLowerCase() ?? null;
  const configured = eligible.find(
    (quote) => quote.carrier.toLowerCase() === normalizedRule,
  );
  if (configured !== undefined) return configured.carrier;

  if (normalizedRule !== null && policy.fallbackPolicy === 'block') {
    return null;
  }

  for (const carrier of policy.orderedCarriers ?? []) {
    const alternative = eligible.find(
      (quote) => quote.carrier.toLowerCase() === carrier,
    );
    if (alternative) return alternative.carrier;
  }

  return (
    eligible
      .slice()
      .sort(
        (left, right) =>
          left.freightCop +
          left.cashOnDeliveryCop +
          left.surchargeCop +
          (left.insuranceCop ?? 0) -
          (right.freightCop +
            right.cashOnDeliveryCop +
            right.surchargeCop +
            (right.insuranceCop ?? 0)),
      )[0]?.carrier ?? null
  );
}
