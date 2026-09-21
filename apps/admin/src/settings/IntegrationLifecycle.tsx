import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IntegrationLifecycleResponseSchema } from '@camila/contracts';
import { apiRequest, getErrorMessage } from '../api/client';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { StatusBadge } from '../components/StatusBadge';

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
      <p className="muted">
        Para editar conexiones de forma segura, configura la clave de cifrado
        del servidor.
      </p>
    );
  return (
    <div className="card lifecycle-panel">
      <h2>Probar y activar conexiones</h2>
      <p className="muted">
        Guardar solo deja la conexión configurada. Pruébala para marcarla como
        verificada y actívala para que la operación la use. Las pruebas no
        envían mensajes ni crean guías y vencen en 15 minutos.
      </p>
      <div className="lifecycle-grid">
        {query.data?.data.drafts.map((draft) => (
          <article className="lifecycle-card" key={draft.provider}>
            <header className="lifecycle-card-header">
              <h3>{draft.provider === 'shipping' ? '99envíos' : 'WhatsApp'}</h3>
              <span className="muted">Borrador {draft.revision}</span>
            </header>
            <ul className="lifecycle-states">
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
              <p className="muted">
                Último éxito: verificado{' '}
                {new Date(draft.testedAt).toLocaleString('es-CO')}
              </p>
            ) : (
              <p className="muted">Aún sin prueba exitosa.</p>
            )}
            {mutation.isError &&
            mutation.variables?.provider === draft.provider ? (
              <p className="error-text" role="status">
                Último fallo:{' '}
                {getErrorMessage(
                  mutation.error,
                  'La prueba o activación no completó',
                )}
              </p>
            ) : null}
            <div className="lifecycle-actions">
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
      <h3>Historial de activaciones</h3>
      <ul className="lifecycle-history">
        {query.data?.data.versions.map((version) => (
          <li key={version.id}>
            <strong>
              {version.provider === 'shipping' ? '99envíos' : 'WhatsApp'}
            </strong>{' '}
            · revisión {version.revision} ·{' '}
            <StatusBadge
              tone={version.status === 'active' ? 'success' : 'neutral'}
            >
              {version.status === 'active' ? 'Activo' : 'Anterior'}
            </StatusBadge>{' '}
            · {new Date(version.createdAt).toLocaleString('es-CO')} ·{' '}
            {version.author}
          </li>
        ))}
      </ul>
    </div>
  );
}
