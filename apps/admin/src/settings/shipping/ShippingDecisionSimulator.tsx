import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  ShippingSimulationResponseSchema,
  type LocalityPublic,
} from '@camila/contracts';

import { apiRequest, getErrorMessage } from '../../api/client';
import { OperationalOutcome } from '@/components/OperationalOutcome';
import { LocalityPicker } from '@/components/LocalityPicker';
import { Button } from '@/components/Button';
import { StatusBadge } from '@/components/StatusBadge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function ShippingDecisionSimulator() {
  const [locality, setLocality] = useState<LocalityPublic | null>(null);
  const [value, setValue] = useState('120000');
  const mutation = useMutation({
    mutationFn: () =>
      apiRequest('/shipping/simulate', {
        method: 'POST',
        body: {
          localityCarrierCode: locality?.carrierCode,
          declaredValueCop: Number(value),
        },
        schema: ShippingSimulationResponseSchema,
      }),
  });
  return (
    <section aria-label="Simulador de decisión">
      <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
        <CardHeader>
          <CardTitle className="text-lg">Probar cobertura y costos</CardTitle>
          <CardDescription>
            Consulta las cotizaciones reales con la regla guardada. No crea
            pedidos, reservas ni guías.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <LocalityPicker
            value={locality}
            onChange={(item) => {
              setLocality(item);
              mutation.reset();
            }}
          />
          <div className="space-y-2">
            <Label htmlFor="simulated-price">Valor del producto (COP)</Label>
            <Input
              id="simulated-price"
              type="number"
              min={1}
              max={100000000}
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                mutation.reset();
              }}
              className="h-11 rounded-[1.125rem] bg-muted"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!locality || Number(value) <= 0 || mutation.isPending}
              loading={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              Cotizar sin crear guía
            </Button>
            {mutation.isError ? (
              <Button
                type="button"
                variant="secondary"
                disabled={!locality || Number(value) <= 0 || mutation.isPending}
                loading={mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                Reintentar cotización
              </Button>
            ) : null}
          </div>
          {mutation.isError ? (
            <OperationalOutcome
              tone="danger"
              outcome={getErrorMessage(
                mutation.error,
                'No se pudo consultar la cobertura. Revisa la conexión de 99envíos.',
              )}
              nextStep="reintentar la cotización o revisa la conexión de 99envíos."
            />
          ) : null}
          {mutation.data ? (
            <div className="space-y-3">
              <OperationalOutcome
                tone={mutation.data.data.blocked ? 'warning' : 'success'}
                outcome={
                  mutation.data.data.blocked
                    ? 'Envío bloqueado: ninguna cotización cumple la regla.'
                    : `Transportadora seleccionada: ${mutation.data.data.selectedCarrier}`
                }
                nextStep={
                  mutation.data.data.blocked
                    ? 'ajusta la regla municipal o la preferencia general.'
                    : 'revisa la regla o crea el pedido cuando corresponda.'
                }
              />
              {mutation.data.data.quotes.map((quote) => (
                <article
                  key={quote.carrier}
                  className="space-y-2 rounded-[1.125rem] border border-border bg-muted/40 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm font-medium text-foreground">
                      {quote.carrier}
                    </strong>
                    <StatusBadge tone={quote.selected ? 'success' : 'neutral'}>
                      {quote.selected ? 'Seleccionada' : 'Descartada'}
                    </StatusBadge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Total contraentrega:{' '}
                    {new Intl.NumberFormat('es-CO', {
                      style: 'currency',
                      currency: 'COP',
                      maximumFractionDigits: 0,
                    }).format(quote.totalCop)}{' '}
                    ·{' '}
                    {
                      {
                        none: 'Sin seguro adicional',
                        standard: 'Seguro 99 estándar',
                        plus: 'Seguro 99 Plus',
                      }[quote.insuranceMode]
                    }
                  </p>
                  {!quote.selected ? (
                    <p className="text-sm text-muted-foreground">
                      {
                        {
                          selected: '',
                          excluded: 'Excluida por la propietaria',
                          not_allowed: 'No incluida entre las permitidas',
                          higher_cost_or_preference:
                            'Otra cotización tiene prioridad por precio o preferencia',
                          required_unavailable:
                            'La transportadora obligatoria no tiene cobertura',
                        }[quote.reason]
                      }
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
