export const CARRIER_CATALOG = [
  { id: 'interrapidisimo', name: 'Interrapidísimo' },
  { id: 'tcc', name: 'TCC' },
  { id: 'servientrega', name: 'Servientrega' },
  { id: 'coordinadora', name: 'Coordinadora' },
  { id: 'envia', name: 'Envia' },
] as const;

export type CarrierId = (typeof CARRIER_CATALOG)[number]['id'];

export function isCarrierId(value: string): value is CarrierId {
  return CARRIER_CATALOG.some((carrier) => carrier.id === value);
}
