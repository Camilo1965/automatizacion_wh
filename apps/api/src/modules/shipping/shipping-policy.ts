export type ShippingOfferMode =
  'customer_choice' | 'economy_only' | 'protected_only';
export type InsuranceMode = 'none' | 'standard' | 'plus';
export type ShippingFallbackPolicy = 'allow' | 'block';

export type ShippingPolicy = Readonly<{
  revision?: number | undefined;
  preferredCarrier: string | null;
  fallbackPolicy: ShippingFallbackPolicy;
  offerMode: ShippingOfferMode;
  protectedInsurance: Exclude<InsuranceMode, 'none'>;
  allowedCarriers?: readonly string[] | undefined;
  excludedCarriers?: readonly string[] | undefined;
  orderedCarriers?: readonly string[] | undefined;
  insuranceThresholdCop?: number | null | undefined;
  packageDefaults?:
    | Readonly<{
        weightKg: number;
        lengthCm: number;
        widthCm: number;
        heightCm: number;
        contents?: string | undefined;
      }>
    | undefined;
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
  if (municipality === null) return defaults;
  const { active, ...municipalPolicy } = municipality;
  if (!active) return defaults;
  return {
    ...municipalPolicy,
    preferredCarrier: municipality.preferredCarrier,
    fallbackPolicy: municipality.fallbackPolicy,
    offerMode: municipality.offerMode,
    protectedInsurance: municipality.protectedInsurance,
  };
}

export function shippingOfferInsurances(
  policy: ShippingPolicy,
  declaredValueCop = 0,
): readonly InsuranceMode[] {
  if (policy.offerMode === 'economy_only') return ['none'];
  if (
    policy.offerMode === 'protected_only' ||
    (policy.insuranceThresholdCop != null &&
      declaredValueCop >= policy.insuranceThresholdCop)
  )
    return [policy.protectedInsurance];
  return ['none'];
}
