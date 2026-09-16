import { useQuery } from '@tanstack/react-query';
import { ConfigurationAuditResponseSchema } from '@camila/contracts';
import { apiRequest } from '../api/client';
import { PageHeader } from '../components/PageHeader';
import { LoadingState } from '../components/LoadingState';
import { ErrorMessage } from '../components/ErrorMessage';
const scopes: Record<string, string> = {
  'bot-flow': 'Flujo del bot',
  localities: 'Municipios',
  'integration.whatsapp': 'WhatsApp',
  'integration.shipping': '99envíos',
  'shipping-incident': 'Novedades de entrega',
  'shipping-policy': 'Preferencias de envío',
};
const actions: Record<string, string> = {
  draft_saved: 'Borrador guardado',
  published: 'Publicado',
  restored: 'Restaurado',
  activated: 'Conexión activada',
  synced: 'Novedad sincronizada',
  response_claimed: 'Respuesta registrada',
  response_sent: 'Respuesta enviada',
  response_uncertain: 'Respuesta sin confirmación',
  response_rejected: 'Respuesta rechazada',
  deactivated: 'Regla desactivada',
};
export function ConfigurationAuditPage() {
  const query = useQuery({
    queryKey: ['configuration-audit'],
    queryFn: () =>
      apiRequest('/configuration/audit', {
        schema: ConfigurationAuditResponseSchema,
      }),
  });
  return (
    <section className="operational-config">
      <PageHeader
        title="Historial de configuración"
        description="Registro de cambios y acciones. Las credenciales nunca aparecen en este historial."
      />
      {query.isPending ? (
        <LoadingState label="Cargando historial…" />
      ) : query.isError ? (
        <ErrorMessage message="No se pudo cargar el historial." />
      ) : (
        <div className="stack">
          {query.data.data.items.length ? (
            query.data.data.items.map((item) => (
              <article className="card" key={item.id}>
                <h3>
                  {scopes[item.scope] ?? 'Configuración'} ·{' '}
                  {actions[item.action] ?? 'Acción registrada'}
                </h3>
                <p>
                  {item.author} ·{' '}
                  {new Date(item.createdAt).toLocaleString('es-CO', {
                    timeZone: 'America/Bogota',
                  })}
                  {item.revision !== null ? ` · Revisión ${item.revision}` : ''}
                </p>
              </article>
            ))
          ) : (
            <p>No hay cambios registrados todavía.</p>
          )}
        </div>
      )}
    </section>
  );
}
