import type { ShippingPolicy } from '@camila/contracts';

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
  return `Prefiere ${carrier}, ${fallback} y ${offer}.`;
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



