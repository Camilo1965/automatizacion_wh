import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  ShippingSimulationResponseSchema,
  type LocalityPublic,
} from '@camila/contracts';
import { apiRequest, getErrorMessage } from '../api/client';
import { LocalityPicker } from '../components/LocalityPicker';
import { ErrorMessage } from '../components/ErrorMessage';
export function ShippingSimulator() {
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
    <section className="card">
      <h2>Probar cobertura y costos</h2>
      <p>
        Consulta las cotizaciones reales con la regla guardada. No crea pedidos,
        reservas ni guías.
      </p>
      <LocalityPicker
        value={locality}
        onChange={(item) => {
          setLocality(item);
          mutation.reset();
        }}
      />
      <label htmlFor="simulated-price">Valor del producto (COP)</label>
      <input
        id="simulated-price"
        type="number"
        min={1}
        max={100000000}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          mutation.reset();
        }}
      />
      <button
        type="button"
        disabled={!locality || Number(value) <= 0 || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        Cotizar sin crear guía
      </button>
      {mutation.isError && (
        <ErrorMessage
          message={getErrorMessage(
            mutation.error,
            'No se pudo consultar la cobertura. Revisa la conexión de 99envíos.',
          )}
        />
      )}
      {mutation.data && (
        <div>
          <p role="status">
            {mutation.data.data.blocked
              ? 'Envío bloqueado: ninguna cotización cumple la regla.'
              : `Transportadora seleccionada: ${mutation.data.data.selectedCarrier}`}
          </p>
          {mutation.data.data.quotes.map((quote) => (
            <article key={quote.carrier}>
              <strong>
                {quote.carrier} ·{' '}
                {quote.selected ? 'Seleccionada' : 'Descartada'}
              </strong>
              <p>
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
              {!quote.selected && (
                <p>
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
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
