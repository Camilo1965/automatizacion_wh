import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getIntegrationHealth,
  getIntegrationSettings,
  updateIntegrationSettings,
} from '../api/operations-api';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';

const labels = {
  database: 'Base de datos',
  mediaStorage: 'Archivos y fotografías',
  whatsapp: 'WhatsApp',
  shipping: '99envíos',
  scheduler: 'Scheduler',
} as const;

export function IntegrationsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['integration-health'],
    queryFn: getIntegrationHealth,
    refetchInterval: 60_000,
  });
  const settings = useQuery({
    queryKey: ['integration-settings'],
    queryFn: getIntegrationSettings,
    retry: false,
  });
  const save = useMutation({
    mutationFn: updateIntegrationSettings,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['integration-settings'],
      });
      void queryClient.invalidateQueries({ queryKey: ['integration-health'] });
    },
  });
  if (query.isPending)
    return <LoadingState label="Comprobando integraciones…" />;
  if (query.isError)
    return (
      <ErrorMessage message="No se pudo comprobar el estado de las integraciones" />
    );
  return (
    <section>
      <PageHeader
        title="Integraciones"
        description="Comprobaciones seguras que no envían mensajes ni crean guías."
      />
      <div className="metric-grid">
        {Object.entries(query.data).map(([key, check]) => (
          <article
            className={`card integration-card integration-card--${check.status}`}
            key={key}
          >
            <div className="section-header">
              <h3>{labels[key as keyof typeof labels]}</h3>
              <StatusBadge
                tone={
                  check.status === 'up'
                    ? 'success'
                    : check.status === 'down'
                      ? 'danger'
                      : 'warning'
                }
              >
                {check.status === 'up'
                  ? 'Disponible'
                  : check.status === 'down'
                    ? 'Caído'
                    : 'Pendiente'}
              </StatusBadge>
            </div>
            <p className="muted">
              {check.detail ??
                `Última revisión: ${new Date(check.checkedAt).toLocaleString('es-CO')}`}
            </p>
          </article>
        ))}
      </div>
      {settings.isSuccess ? (
        <div className="settings-grid">
          <form
            className="card settings-card"
            onSubmit={(event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              const phoneNumberId = String(
                fields.get('phoneNumberId') ?? '',
              ).trim();
              const accessToken = String(
                fields.get('accessToken') ?? '',
              ).trim();
              const graphApiVersion = String(
                fields.get('graphApiVersion') ?? '',
              ).trim();
              const appSecret = String(fields.get('appSecret') ?? '').trim();
              const webhookVerifyToken = String(
                fields.get('webhookVerifyToken') ?? '',
              ).trim();
              if (
                phoneNumberId === '' &&
                accessToken === '' &&
                graphApiVersion === '' &&
                appSecret === '' &&
                webhookVerifyToken === ''
              )
                return;
              save.mutate({
                whatsapp: {
                  ...(phoneNumberId === '' ? {} : { phoneNumberId }),
                  ...(accessToken === '' ? {} : { accessToken }),
                  ...(graphApiVersion === '' ? {} : { graphApiVersion }),
                  ...(appSecret === '' ? {} : { appSecret }),
                  ...(webhookVerifyToken === '' ? {} : { webhookVerifyToken }),
                },
              });
            }}
          >
            <h2>WhatsApp Cloud API</h2>
            <p className="muted">
              {settings.data.whatsapp.configured
                ? `Número conectado: ${settings.data.whatsapp.phoneNumberId}`
                : 'Aún no hay credenciales guardadas.'}
            </p>
            <label>
              ID del número
              <input
                name="phoneNumberId"
                defaultValue={settings.data.whatsapp.phoneNumberId ?? ''}
              />
            </label>
            <label>
              Nuevo token de acceso
              <input
                name="accessToken"
                type="password"
                autoComplete="new-password"
                placeholder="Se conserva si lo dejas vacío"
              />
            </label>
            <label>
              Versión de Graph API
              <input
                name="graphApiVersion"
                defaultValue={settings.data.whatsapp.graphApiVersion ?? 'v26.0'}
              />
            </label>
            <label>
              App secret de Meta
              <input
                name="appSecret"
                type="password"
                autoComplete="new-password"
                placeholder="Se conserva si lo dejas vacío"
              />
            </label>
            <label>
              Token de verificación del webhook
              <input
                name="webhookVerifyToken"
                type="password"
                autoComplete="new-password"
                placeholder="Se conserva si lo dejas vacío"
              />
            </label>
            <button type="submit" disabled={save.isPending}>
              Guardar conexión
            </button>
          </form>
          <form
            className="card settings-card"
            onSubmit={(event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              const accountEmail = String(
                fields.get('accountEmail') ?? '',
              ).trim();
              const password = String(fields.get('password') ?? '').trim();
              const integrationToken = String(
                fields.get('integrationToken') ?? '',
              ).trim();
              const integrationId = String(
                fields.get('integrationId') ?? '',
              ).trim();
              if (
                accountEmail === '' &&
                password === '' &&
                integrationToken === '' &&
                integrationId === ''
              )
                return;
              save.mutate({
                shipping: {
                  ...(accountEmail === '' ? {} : { accountEmail }),
                  ...(password === '' ? {} : { password }),
                  ...(integrationToken === '' ? {} : { integrationToken }),
                  ...(integrationId === '' ? {} : { integrationId }),
                },
              });
            }}
          >
            <h2>99envíos</h2>
            <p className="muted">
              {settings.data.shipping.configured
                ? `Cuenta conectada: ${settings.data.shipping.accountEmail}`
                : 'Aún no hay credenciales guardadas.'}
            </p>
            <label>
              Correo de cuenta
              <input
                name="accountEmail"
                type="email"
                defaultValue={settings.data.shipping.accountEmail ?? ''}
              />
            </label>
            <label>
              Nueva contraseña
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                placeholder="Se conserva si la dejas vacía"
              />
            </label>
            <label>
              Token de integración (opcional)
              <input
                name="integrationToken"
                type="password"
                autoComplete="new-password"
                placeholder="Se conserva si lo dejas vacío"
              />
            </label>
            <label>
              ID de integración (opcional)
              <input
                name="integrationId"
                defaultValue={settings.data.shipping.integrationId ?? ''}
              />
            </label>
            <button type="submit" disabled={save.isPending}>
              Guardar conexión
            </button>
          </form>
        </div>
      ) : null}
      {settings.isError ? (
        <p className="callout-warning">
          La edición de credenciales se activa al configurar
          INTEGRATION_ENCRYPTION_KEY en el servidor.
        </p>
      ) : null}
      {save.isError ? (
        <ErrorMessage message="No fue posible guardar la conexión" />
      ) : null}
    </section>
  );
}
