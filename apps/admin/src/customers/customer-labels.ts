import type { CustomerSegment } from '@camila/contracts';

export function segmentLabel(segment: CustomerSegment): string {
  if (segment === 'buyer') return 'Compra acreditada';
  if (segment === 'needs_review') return 'Revisar identidad';
  return 'Sin compra acreditada';
}
