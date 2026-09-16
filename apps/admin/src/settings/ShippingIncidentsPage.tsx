import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShippingIncidentsResponseSchema } from '@camila/contracts';
import { apiRequest, getErrorMessage } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { ErrorMessage } from '../components/ErrorMessage';
import { ConfirmDialog } from '../components/ConfirmDialog';
export function ShippingIncidentsPage() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['shipping-incidents'],
    queryFn: () =>
      apiRequest('/shipping/incidents', {
        schema: ShippingIncidentsResponseSchema,
      }),
  });
  const [selected, setSelected] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [observations, setObservations] = useState('');
  const [confirm, setConfirm] = useState(false);
  const mutation = useMutation({
    mutationFn: ({ sync }: { sync: boolean }) =>
      apiRequest(
        sync
          ? '/shipping/incidents/sync'
          : `/shipping/incidents/${selected}/respond`,
        {
          method: 'POST',
          ...(sync ? {} : { body: { description, observations } }),
          schema: ShippingIncidentsResponseSchema,
        },
      ),
    onSuccess: (response) => {
      client.setQueryData(['shipping-incidents'], response);
      setConfirm(false);
      setSelected(null);
      setDescription('');
      setObservations('');
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ['shipping-incidents'] });
    },
  });
  return (
    <section className="operational-config">
      <PageHeader
        eyebrow="Envíos"
        title="Novedades de entrega"
        description="Consulta las incidencias de la sucursal y responde desde el panel. Esta consulta no crea guías."
      />
      <button
        type="button"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate({ sync: true })}
      >
        Consultar novedades en 99envíos
      </button>
      <p>
        Configura la sucursal en{' '}
        <Link to="/settings/integrations">Integraciones</Link>.
      </p>
      {query.isError && (
        <ErrorMessage message="No se pudieron cargar las novedades." />
      )}
      {mutation.isError && (
        <ErrorMessage
          message={getErrorMessage(
            mutation.error,
            'No se pudo completar la operación.',
          )}
        />
      )}
      {query.data?.data.incidents.length === 0 && (
        <div className="card">
          <h2>No hay novedades guardadas</h2>
          <p>Consulta la sucursal para actualizar esta lista.</p>
        </div>
      )}
      {query.data?.data.incidents.map((incident) => (
        <article className="card" key={incident.id}>
          <h2>Guía {incident.preShipmentNumber}</h2>
          <p>{incident.description}</p>
          <p>{incident.observations}</p>
          <p>
            {
              {
                open: 'Pendiente',
                processing: 'Respuesta en proceso',
                sent: 'Respuesta enviada',
                uncertain:
                  'Resultado incierto: revisa en 99envíos antes de continuar',
              }[incident.responseStatus]
            }
          </p>
          {incident.orderId && (
            <Link to={`/orders/${incident.orderId}`}>Abrir pedido</Link>
          )}
          {incident.responseStatus === 'open' && (
            <button type="button" onClick={() => setSelected(incident.id)}>
              Responder novedad
            </button>
          )}
          {incident.response && (
            <p>Respuesta registrada: {incident.response}</p>
          )}
        </article>
      ))}
      {selected !== null && (
        <div className="card">
          <h2>Responder novedad</h2>
          <label htmlFor="incident-response">
            Indicación para la transportadora
          </label>
          <textarea
            id="incident-response"
            maxLength={2000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <label htmlFor="incident-observations">Observaciones</label>
          <textarea
            id="incident-observations"
            maxLength={2000}
            value={observations}
            onChange={(event) => setObservations(event.target.value)}
          />
          <button
            type="button"
            disabled={description.trim().length < 3 || mutation.isPending}
            onClick={() => setConfirm(true)}
          >
            Revisar y enviar respuesta
          </button>
          <button type="button" onClick={() => setSelected(null)}>
            Cancelar
          </button>
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        title="Enviar respuesta a 99envíos"
        message={description}
        confirmLabel="Enviar respuesta"
        busy={mutation.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={() => mutation.mutate({ sync: false })}
      />
    </section>
  );
}
