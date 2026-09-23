import { ShippingPolicySchema, type ShippingPolicy } from '@camila/contracts';

export const selectClassName =
  'h-11 w-full rounded-[1.125rem] border border-input bg-muted px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50';

export const checkboxClassName =
  'size-4 shrink-0 rounded border border-input accent-foreground';

export function carrierName(value: string): string {
  const names: Record<string, string> = {
    interrapidisimo: 'Interrapidísimo',
    tcc: 'TCC',
    servientrega: 'Servientrega',
    coordinadora: 'Coordinadora',
    envia: 'Envia',
  };
  return names[value.toLowerCase()] ?? value;
}

export const DEFAULT_POLICY: ShippingPolicy = {
  revision: 0,
  preferredCarrier: null,
  fallbackPolicy: 'allow',
  offerMode: 'customer_choice',
  protectedInsurance: 'standard',
};

export function copyGlobalForMunicipality(
  policy: ShippingPolicy,
  revision = 0,
): ShippingPolicy {
  return {
    ...policy,
    revision,
    allowedCarriers: policy.allowedCarriers?.slice(),
    excludedCarriers: policy.excludedCarriers?.slice(),
    orderedCarriers: policy.orderedCarriers?.slice(),
    packageDefaults: policy.packageDefaults
      ? { ...policy.packageDefaults }
      : undefined,
  };
}

export function policyValidationMessage(policy: ShippingPolicy): string | null {
  const allowed = policy.allowedCarriers;
  const excluded = policy.excludedCarriers ?? [];
  if (allowed !== undefined && allowed.length === 0)
    return 'Selecciona al menos una transportadora permitida o desactiva el límite.';
  if (policy.preferredCarrier && excluded.includes(policy.preferredCarrier))
    return `La transportadora preferida ${carrierName(policy.preferredCarrier)} está excluida.`;
  if (
    policy.preferredCarrier &&
    allowed !== undefined &&
    !allowed.includes(policy.preferredCarrier)
  )
    return `La transportadora preferida ${carrierName(policy.preferredCarrier)} no está permitida.`;
  for (const carrier of policy.orderedCarriers ?? []) {
    if (excluded.includes(carrier))
      return `La transportadora secundaria ${carrierName(carrier)} está excluida.`;
    if (allowed !== undefined && !allowed.includes(carrier))
      return `La transportadora secundaria ${carrierName(carrier)} no está permitida.`;
  }
  const result = ShippingPolicySchema.safeParse(policy);
  return result.success
    ? null
    : (result.error.issues[0]?.message ?? 'Revisa la política de envío.');
}

export function describePolicy(policy: ShippingPolicy): string {
  const carrier = policy.preferredCarrier
    ? carrierName(policy.preferredCarrier)
    : 'la mejor transportadora disponible';
  const fallback =
    policy.fallbackPolicy === 'allow'
      ? 'permite otra transportadora si hace falta'
      : 'se detiene si no está disponible';
  const offer =
    policy.offerMode === 'customer_choice'
      ? 'selecciona automáticamente la alternativa económica'
      : policy.offerMode === 'economy_only'
        ? 'envía sin seguro adicional'
        : `exige envío protegido con seguro ${policy.protectedInsurance === 'plus' ? 'Plus' : 'estándar'}`;
  const allowed = policy.allowedCarriers;
  const scope =
    allowed === undefined
      ? ''
      : allowed.length === 1
        ? ` Solo ${carrierName(allowed[0]!)} está permitida.`
        : ` Permitidas: ${allowed.map(carrierName).join(', ')}.`;
  const excluded = policy.excludedCarriers?.length
    ? ` Excluidas: ${policy.excludedCarriers.map(carrierName).join(', ')}.`
    : '';
  return `Prefiere ${carrier}, ${fallback} y ${offer}.${scope}${excluded}`;
}

export function policyModeLabel(policy: ShippingPolicy): string {
  if (policy.offerMode === 'economy_only') {
    return 'Sin seguro adicional';
  }
  if (policy.offerMode === 'protected_only') {
    return `Protegido ${policy.protectedInsurance === 'plus' ? 'Plus' : 'estándar'}`;
  }
  return 'Económico automático';
}
