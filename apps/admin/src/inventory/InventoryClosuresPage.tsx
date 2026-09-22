import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acknowledgeInventoryClosure,
  getInventoryClosures,
  reopenInventoryClosure,
} from '../api/operations-api';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { Button as UiButton } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ClosureAction = 'acknowledge' | 'reopen';

export function InventoryClosuresPage() {
  const client = useQueryClient();
  const [confirmation, setConfirmation] = useState<{
    id: string;
    action: ClosureAction;
  } | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const query = useQuery({
    queryKey: ['inventory-closures'],
    queryFn: getInventoryClosures,
  });
  const acknowledge = useMutation({
    mutationFn: acknowledgeInventoryClosure,
    onSuccess: async () => {
      setConfirmation(null);
      await client.invalidateQueries({ queryKey: ['inventory-closures'] });
    },
  });
  const reopen = useMutation({
    mutationFn: reopenInventoryClosure,
    onSuccess: async () => {
      setConfirmation(null);
      await client.invalidateQueries({ queryKey: ['inventory-closures'] });
    },
  });
  if (query.isPending) return <LoadingState label="Cargando cierres…" />;
  if (query.isError)
    return <ErrorMessage message="No se pudieron cargar los cierres" />;
  const pending = acknowledge.isPending || reopen.isPending;
  const confirmationCopy =
    confirmation?.action === 'acknowledge'
      ? {
          title: 'Marcar cierre como aplicado',
          message:
            'Confirma solo después de aplicar manualmente el CSV en Treinta.',
          label: 'Marcar como aplicado',
        }
      : {
          title: 'Reabrir cierre',
          message:
            'El cierre volverá a quedar pendiente para descargarlo y aplicarlo otra vez.',
          label: 'Reabrir cierre',
        };
  return (
    <section className="space-y-6">
      <PageHeader
        title="Cierres diarios de Treinta"
        description="Descarga el ajuste y reconócelo después de aplicarlo manualmente en Treinta."
      />
      {query.data.items.length === 0 ? (
        <EmptyState
          title="Todavía no hay cierres"
          description="El sistema generará el cierre después de las 19:00, hora de Colombia."
        />
      ) : (
        <div className="space-y-3">
          {query.data.items.map((closure) => (
            <Card
              className="rounded-3xl border-border shadow-[var(--shadow-card)]"
              key={closure.id}
            >
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <CardTitle className="text-base font-semibold">
                  {new Intl.DateTimeFormat('es-CO', {
                    dateStyle: 'long',
                    timeZone: 'UTC',
                  }).format(new Date(`${closure.businessDate}T12:00:00Z`))}
                </CardTitle>
                <StatusBadge
                  tone={
                    closure.status === 'acknowledged' ? 'success' : 'warning'
                  }
                >
                  {closure.status === 'acknowledged' ? 'Aplicado' : 'Pendiente'}
                </StatusBadge>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-foreground">
                  {closure.movementCount} movimientos · {closure.totalUnits}{' '}
                  unidades · versión {closure.version}
                </p>
                {closure.movementCount === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    0 movimientos = día sin ajustes. El archivo no trae cambios
                    de inventario.
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <UiButton
                    asChild
                    variant="secondary"
                    className="control-target rounded-[1.125rem]"
                  >
                    <a
                      href={`/api/admin/inventory/closures/${closure.id}/download`}
                    >
                      Descargar CSV
                    </a>
                  </UiButton>
                  {closure.status === 'generated' ? (
                    <Button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        setConfirmation({
                          id: closure.id,
                          action: 'acknowledge',
                        })
                      }
                    >
                      Marcar como aplicado en Treinta
                    </Button>
                  ) : null}
                  {closure.status === 'acknowledged' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => {
                        setReopenReason('');
                        setConfirmation({ id: closure.id, action: 'reopen' });
                      }}
                    >
                      Reabrir cierre
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={confirmation !== null}
        title={confirmationCopy.title}
        message={confirmationCopy.message}
        confirmLabel={confirmationCopy.label}
        busy={pending}
        confirmDisabled={
          confirmation?.action === 'reopen' && reopenReason.trim().length < 3
        }
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          if (confirmation?.action === 'acknowledge') {
            acknowledge.mutate(confirmation.id);
          } else if (confirmation?.action === 'reopen') {
            reopen.mutate({
              id: confirmation.id,
              reason: reopenReason.trim(),
            });
          }
        }}
      >
        {confirmation?.action === 'reopen' ? (
          <div className="space-y-2">
            <Label htmlFor="closure-reopen-reason">Motivo de reapertura</Label>
            <Textarea
              id="closure-reopen-reason"
              className="rounded-[1.125rem] bg-muted"
              rows={3}
              maxLength={250}
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
            />
          </div>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}
