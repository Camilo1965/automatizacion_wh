export function operationalLabel(value: string | null | undefined): string {
  const labels: Record<string, string> = {
    draft: 'Esperando al cliente',
    confirmed: 'Confirmado',
    dispatched: 'Despachado',
    delivered: 'Entregado',
    cancelled: 'Cancelado',
    returned: 'Devuelto',
    human: 'Atención humana',
    bot: 'Automático',
    choose_size: 'Esperando talla',
    choose_reference: 'Esperando referencia',
    collect_address: 'Esperando datos de envío',
    choose_shipping: 'Esperando tipo de envío',
    confirm_order: 'Esperando confirmación',
  };
  return value === null || value === undefined
    ? 'Pendiente'
    : (labels[value] ?? value.replaceAll('_', ' '));
}
