import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IntegrationLifecycleResponseSchema } from '@camila/contracts';

import { apiRequest, getErrorMessage } from '../api/client';
import { Button } from '@/components/Button';
import { ErrorMessage } from '@/components/ErrorMessage';
import { StatusBadge } from '@/components/StatusBadge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function IntegrationLifecycle() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['integration-lifecycle'],
    queryFn: () =>
      apiRequest('/integrations/lifecycle', {
        schema: IntegrationLifecycleResponseSchema,
      }),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: ({
      provider,
      revision,
      action,
    }: {
      provider: string;
      revision: number;
      action: 'test' | 'activate';
    }) =>
      apiRequest(`/integrations/${provider}/${action}`, {
        method: 'POST',
        ...(action === 'activate' ? { body: { revision } } : {}),
        schema: IntegrationLifecycleResponseSchema,
      }),
    onSuccess: (response) => {
      client.setQueryData(['integration-lifecycle'], response);
      void client.invalidateQueries({ queryKey: ['integration-settings'] });
      void client.invalidateQueries({ queryKey: ['integration-health'] });
    },
  });
  if (query.isError)
    return (
      <p className="text-sm text-muted-foreground">
        Para editar conexiones de forma segura, configura la clave de cifrado
        del servidor.
      </p>
    );
  return (
    <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
      <CardHeader>
        <CardTitle className="text-lg">Probar y activar conexiones</CardTitle>
        <CardDescription>
          Guardar solo deja la conexión configurada. Pruébala para marcarla como
          verificada y actívala para que la operación la use. Las pruebas no
          envían mensajes ni crean guías y vencen en 15 minutos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          {query.data?.data.drafts.map((draft) => (
            <article
              className="space-y-4 rounded-[1.125rem] border border-border bg-muted/40 p-4"
              key={draft.provider}
            >
              <header className="flex items-start justify-between gap-3">
                <h3 className="text-base font-medium text-foreground">
                  {draft.provider === 'shipping' ? '99envíos' : 'WhatsApp'}
                </h3>
                <span className="text-xs text-muted-foreground">
                  Borrador {draft.revision}
                </span>
              </header>
              <ul className="flex flex-wrap gap-2">
                <li>
                  <StatusBadge tone="info">Configurado</StatusBadge>
                </li>
                <li>
                  <StatusBadge tone={draft.tested ? 'success' : 'warning'}>
                    {draft.tested ? 'Verificado' : 'Sin verificar'}
                  </StatusBadge>
                </li>
                <li>
                  <StatusBadge tone="neutral">No activo</StatusBadge>
                </li>
              </ul>
              {draft.testedAt ? (
                <p className="text-sm text-muted-foreground">
                  Último éxito: verificado{' '}
                  {new Date(draft.testedAt).toLocaleString('es-CO')}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aún sin prueba exitosa.
                </p>
              )}
              {mutation.isError &&
              mutation.variables?.provider === draft.provider ? (
                <p className="text-sm text-destructive" role="status">
                  Último fallo:{' '}
                  {getErrorMessage(
                    mutation.error,
                    'La prueba o activación no completó',
                  )}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  loading={mutation.isPending}
                  onClick={() => mutation.mutate({ ...draft, action: 'test' })}
                >
                  Probar conexión
                </Button>
                <Button
                  type="button"
                  disabled={!draft.tested || mutation.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        '¿Activar estas credenciales para las operaciones nuevas?',
                      )
                    )
                      mutation.mutate({ ...draft, action: 'activate' });
                  }}
                >
                  Activar conexión
                </Button>
              </div>
            </article>
          ))}
        </div>
        {mutation.isError && (
          <ErrorMessage
            message={getErrorMessage(
              mutation.error,
              'No se pudo completar la operación.',
            )}
          />
        )}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">
            Historial de activaciones
          </h3>
          <ul className="space-y-2">
            {query.data?.data.versions.map((version) => (
              <li
                key={version.id}
                className="flex flex-wrap items-center gap-2 rounded-[1.125rem] border border-border px-3 py-2 text-sm"
              >
                <strong className="font-medium text-foreground">
                  {version.provider === 'shipping' ? '99envíos' : 'WhatsApp'}
                </strong>
                <span className="text-muted-foreground">
                  · revisión {version.revision}
                </span>
                <StatusBadge
                  tone={version.status === 'active' ? 'success' : 'neutral'}
                >
                  {version.status === 'active' ? 'Activo' : 'Anterior'}
                </StatusBadge>
                <span className="text-muted-foreground">
                  · {new Date(version.createdAt).toLocaleString('es-CO')} ·{' '}
                  {version.author}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
