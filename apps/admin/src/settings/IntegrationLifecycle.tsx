import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IntegrationLifecycleResponseSchema } from '@camila/contracts';
import { apiRequest, getErrorMessage } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';
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
      <p>
        Para editar conexiones de forma segura, configura la clave de cifrado
        del servidor.
      </p>
    );
  return (
    <div className="card">
      <h2>Probar y activar conexiones</h2>
      <p>
        Guardar crea un borrador. Pruébalo y actívalo para que el bot lo
        utilice. Las pruebas no envían mensajes ni crean guías y vencen en 15
        minutos.
      </p>
      {query.data?.data.drafts.map((draft) => (
        <article key={draft.provider}>
          <h3>
            {draft.provider === 'shipping' ? '99envíos' : 'WhatsApp'} · borrador{' '}
            {draft.revision}
          </h3>
          <p>
            {draft.tested ? 'Credenciales verificadas' : 'Pendiente de prueba'}
          </p>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ ...draft, action: 'test' })}
          >
            Probar conexión
          </button>
          <button
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
          </button>
        </article>
      ))}
      {mutation.isError && (
        <ErrorMessage
          message={getErrorMessage(
            mutation.error,
            'No se pudo completar la operación.',
          )}
        />
      )}
      <h3>Historial de activaciones</h3>
      {query.data?.data.versions.map((version) => (
        <p key={version.id}>
          {version.provider === 'shipping' ? '99envíos' : 'WhatsApp'} · revisión{' '}
          {version.revision} ·{' '}
          {version.status === 'active' ? 'Activa' : 'Anterior'} ·{' '}
          {new Date(version.createdAt).toLocaleString('es-CO')} ·{' '}
          {version.author}
        </p>
      ))}
    </div>
  );
}
