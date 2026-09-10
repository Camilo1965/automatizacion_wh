export type ShippingOfferMode =
  'customer_choice' | 'economy_only' | 'protected_only';
export type InsuranceMode = 'none' | 'standard' | 'plus';
export type ShippingFallbackPolicy = 'allow' | 'block';

export type ShippingPolicy = Readonly<{
  preferredCarrier: string | null;
  fallbackPolicy: ShippingFallbackPolicy;
  offerMode: ShippingOfferMode;
  protectedInsurance: Exclude<InsuranceMode, 'none'>;
}>;

export type MunicipalityShippingPolicy = ShippingPolicy &
  Readonly<{ active: boolean }>;

export const DEFAULT_SHIPPING_POLICY: ShippingPolicy = {
  preferredCarrier: null,
  fallbackPolicy: 'allow',
  offerMode: 'customer_choice',
  protectedInsurance: 'standard',
};

export function resolveShippingPolicy(
  defaults: ShippingPolicy,
  municipality: MunicipalityShippingPolicy | null,
): ShippingPolicy {
  if (municipality === null || !municipality.active) return defaults;
  return {
    preferredCarrier: municipality.preferredCarrier,
    fallbackPolicy: municipality.fallbackPolicy,
    offerMode: municipality.offerMode,
    protectedInsurance: municipality.protectedInsurance,
  };
}

export function shippingOfferInsurances(
  policy: ShippingPolicy,
): readonly InsuranceMode[] {
  if (policy.offerMode === 'economy_only') return ['none'];
  if (policy.offerMode === 'protected_only') return [policy.protectedInsurance];
  return ['none', policy.protectedInsurance];
}
