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
import { IntegrationLifecycle } from './IntegrationLifecycle';
import { useState } from 'react';
import type { LocalityPublic } from '@camila/contracts';
import { LocalityPicker } from '../components/LocalityPicker';

const labels = {
  database: 'Base de datos',
  mediaStorage: 'Archivos y fotografías',
  whatsapp: 'WhatsApp',
  shipping: '99envíos',
  scheduler: 'Scheduler',
} as const;

export function IntegrationsPage() {
  const [origin, setOrigin] = useState<LocalityPublic | null>(null);
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
      document
        .querySelectorAll<HTMLInputElement>('form input[type="password"]')
        .forEach((input) => {
          input.value = '';
        });
      void queryClient.invalidateQueries({
        queryKey: ['integration-lifecycle'],
      });
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
    <section className="operational-config">
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
                  ? 'Activo'
                  : check.status === 'down'
                    ? 'Incidencia'
                    : 'Sin verificar'}
              </StatusBadge>
            </div>
            <p className="muted">
              {check.status === 'up'
                ? `Último éxito: ${new Date(check.checkedAt).toLocaleString('es-CO')}`
                : check.status === 'down'
                  ? `Último fallo: ${new Date(check.checkedAt).toLocaleString('es-CO')}`
                  : `Última revisión: ${new Date(check.checkedAt).toLocaleString('es-CO')}`}
            </p>
            {check.detail ? <p className="muted">{check.detail}</p> : null}
            <p className="integration-state-hint muted">
              Guardar credenciales solo marca Configurado. Probar marca
              Verificado. Activar pone el canal en operación.
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
                  timezone: 'America/Bogota',
                  serviceHours:
                    fields.get('hoursEnabled') === 'on'
                      ? {
                          days: fields.getAll('hoursDays').map(Number),
                          start: String(fields.get('hoursStart')),
                          end: String(fields.get('hoursEnd')),
                        }
                      : null,
                  ...(String(fields.get('wabaId') ?? '').trim()
                    ? { wabaId: String(fields.get('wabaId')).trim() }
                    : {}),
                  ...(String(fields.get('ownerAlertPhone') ?? '').trim()
                    ? {
                        ownerAlertPhone: String(
                          fields.get('ownerAlertPhone'),
                        ).trim(),
                      }
                    : {}),
                  ...(String(fields.get('ownerAlertTemplate') ?? '').trim()
                    ? {
                        ownerAlertTemplate: String(
                          fields.get('ownerAlertTemplate'),
                        ).trim(),
                      }
                    : {}),
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
                ? `Número configurado en el editor: ${settings.data.whatsapp.phoneNumberId}`
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
              Cuenta de WhatsApp Business (WABA ID)
              <input
                name="wabaId"
                inputMode="numeric"
                defaultValue={settings.data.whatsapp.wabaId ?? ''}
              />
            </label>
            <label>
              WhatsApp de la propietaria para alertas
              <input
                name="ownerAlertPhone"
                type="tel"
                placeholder="+573001234567"
                defaultValue={settings.data.whatsapp.ownerAlertPhone ?? ''}
              />
            </label>
            <label>
              Plantilla aprobada para alertas
              <input
                name="ownerAlertTemplate"
                defaultValue={settings.data.whatsapp.ownerAlertTemplate ?? ''}
                placeholder="alerta_operativa"
              />
            </label>
            <p className="muted">
              La plantilla debe estar aprobada por Meta, en español (es_CO), con
              una variable de texto en el cuerpo. Sin plantilla se conservan las
              alertas en el panel.
            </p>
            <label>
              Versión de Graph API
              <input
                name="graphApiVersion"
                defaultValue={settings.data.whatsapp.graphApiVersion ?? 'v26.0'}
              />
            </label>
            <fieldset>
              <legend>Horario de atención de la propietaria</legend>
              <p className="muted">
                El bot vende las 24 horas. Al solicitar atención humana fuera de
                este horario, informa cuándo responderás. Zona: Colombia.
              </p>
              <label>
                <input
                  type="checkbox"
                  name="hoursEnabled"
                  defaultChecked={settings.data.whatsapp.serviceHours != null}
                />{' '}
                Informar un horario de atención
              </label>
              {[
                'Domingo',
                'Lunes',
                'Martes',
                'Miércoles',
                'Jueves',
                'Viernes',
                'Sábado',
              ].map((day, index) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    name="hoursDays"
                    value={index}
                    defaultChecked={
                      settings.data.whatsapp.serviceHours?.days.includes(
                        index,
                      ) ??
                      (index > 0 && index < 6)
                    }
                  />{' '}
                  {day}
                </label>
              ))}
              <label>
                Hora de inicio
                <input
                  name="hoursStart"
                  type="time"
                  defaultValue={
                    settings.data.whatsapp.serviceHours?.start ?? '09:00'
                  }
                />
              </label>
              <label>
                Hora de cierre
                <input
                  name="hoursEnd"
                  type="time"
                  defaultValue={
                    settings.data.whatsapp.serviceHours?.end ?? '18:00'
                  }
                />
              </label>
            </fieldset>
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
                  ...(origin ? { originLocalityCode: origin.carrierCode } : {}),
                  ...(String(fields.get('branchCode') ?? '').trim()
                    ? { branchCode: String(fields.get('branchCode')).trim() }
                    : {}),
                  pdfType: Number(fields.get('pdfType') ?? 2),
                  ...(accountEmail === '' ? {} : { accountEmail }),
                  ...(password === '' ? {} : { password }),
                  ...(integrationToken === '' ? {} : { integrationToken }),
                  ...(integrationId === '' ? {} : { integrationId }),
                },
              });
            }}
          >
            <h2>99envíos</h2>
            <h3>Municipio de origen para cotizaciones</h3>
            <LocalityPicker value={origin} onChange={setOrigin} />
            <p className="muted">
              Opcional. Si no cambias el origen, se conserva la configuración
              activa o el origen de tu cuenta en 99envíos.
            </p>
            <label>
              Sucursal de 99envíos
              <input
                name="branchCode"
                inputMode="numeric"
                pattern="[0-9]+"
                defaultValue={settings.data.shipping.branchCode ?? ''}
              />
            </label>
            <label>
              Formato de guía
              <select
                name="pdfType"
                defaultValue={settings.data.shipping.pdfType ?? 2}
              >
                <option value={2}>Normal</option>
                <option value={1}>Etiqueta adhesiva</option>
              </select>
            </label>
            <p className="muted">
              {settings.data.shipping.configured
                ? `Cuenta configurada en el editor: ${settings.data.shipping.accountEmail}`
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
                type="password"
                autoComplete="new-password"
                placeholder="Se conserva si lo dejas vacío"
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
      {save.isSuccess ? (
        <p role="status">
          Borrador guardado. Prueba y activa la conexión para utilizarla.
        </p>
      ) : null}
      <IntegrationLifecycle />
    </section>
  );
}
