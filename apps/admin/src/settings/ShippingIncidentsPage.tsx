import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShippingIncidentsResponseSchema } from '@camila/contracts';

import { apiRequest, getErrorMessage } from '../api/client';
import { PageHeader } from '@/components/PageHeader';
import { ErrorMessage } from '@/components/ErrorMessage';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/Button';
import { StatusBadge } from '@/components/StatusBadge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const responseTone = {
  open: 'warning',
  processing: 'info',
  sent: 'success',
  uncertain: 'danger',
} as const;

const responseLabel = {
  open: 'Pendiente',
  processing: 'Respuesta en proceso',
  sent: 'Respuesta enviada',
  uncertain: 'Resultado incierto: revisa en 99envíos antes de continuar',
} as const;

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
    <section className="space-y-6">
      <PageHeader
        eyebrow="Envíos"
        title="Novedades de entrega"
        description="Consulta las incidencias de la sucursal y responde desde el panel. Esta consulta no crea guías."
        actions={
          <Button
            type="button"
            variant="secondary"
            disabled={mutation.isPending}
            loading={mutation.isPending}
            onClick={() => mutation.mutate({ sync: true })}
          >
            Consultar novedades en 99envíos
          </Button>
        }
      />
      <p className="text-sm text-muted-foreground">
        Configura la sucursal en{' '}
        <Link
          to="/settings/integrations"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Integraciones
        </Link>
        .
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
        <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-lg">No hay novedades guardadas</CardTitle>
            <CardDescription>
              Consulta la sucursal para actualizar esta lista.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
      <div className="space-y-3">
        {query.data?.data.incidents.map((incident) => (
          <Card
            className="rounded-3xl border-border shadow-[var(--shadow-card)]"
            key={incident.id}
          >
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-lg">
                  Guía {incident.preShipmentNumber}
                </CardTitle>
                <CardDescription>{incident.description}</CardDescription>
              </div>
              <StatusBadge tone={responseTone[incident.responseStatus]}>
                {responseLabel[incident.responseStatus]}
              </StatusBadge>
            </CardHeader>
            <CardContent className="space-y-3">
              {incident.observations ? (
                <p className="text-sm text-muted-foreground">
                  {incident.observations}
                </p>
              ) : null}
              {incident.orderId && (
                <Link
                  to={`/orders/${incident.orderId}`}
                  className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Abrir pedido
                </Link>
              )}
              {incident.responseStatus === 'open' && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSelected(incident.id)}
                >
                  Responder novedad
                </Button>
              )}
              {incident.response && (
                <p className="text-sm text-foreground">
                  Respuesta registrada: {incident.response}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      {selected !== null && (
        <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="text-lg">Responder novedad</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="incident-response">
                Indicación para la transportadora
              </Label>
              <Textarea
                id="incident-response"
                maxLength={2000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-24 rounded-[1.125rem] bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="incident-observations">Observaciones</Label>
              <Textarea
                id="incident-observations"
                maxLength={2000}
                value={observations}
                onChange={(event) => setObservations(event.target.value)}
                className="min-h-24 rounded-[1.125rem] bg-muted"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={description.trim().length < 3 || mutation.isPending}
                onClick={() => setConfirm(true)}
              >
                Revisar y enviar respuesta
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSelected(null)}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
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
