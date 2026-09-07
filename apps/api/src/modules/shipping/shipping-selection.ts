export type SelectableCarrierQuote = Readonly<{
  carrier: string;
  freightCop: number;
  cashOnDeliveryCop: number;
  surchargeCop: number;
}>;

export function selectRecommendedCarrier(
  quotes: readonly SelectableCarrierQuote[],
  municipalityCarrier: string | null,
): string | null {
  const normalizedRule = municipalityCarrier?.trim().toLowerCase() ?? null;
  const configured = quotes.find(
    (quote) => quote.carrier.toLowerCase() === normalizedRule,
  );
  if (configured !== undefined) return configured.carrier;

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
