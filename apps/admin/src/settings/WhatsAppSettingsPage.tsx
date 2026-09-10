import { useQuery } from '@tanstack/react-query';
import { getWhatsAppConnection } from '../api/whatsapp-api';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';

export function WhatsAppSettingsPage() {
  const connection = useQuery({
    queryKey: ['whatsapp-connection'],
    queryFn: getWhatsAppConnection,
  });

  if (connection.isPending) return <LoadingState label="Revisando WhatsApp…" />;
  if (connection.isError)
    return (
      <ErrorMessage message="No se pudo consultar la conexión de WhatsApp" />
    );

  const data = connection.data;
  return (
    <section aria-labelledby="whatsapp-settings-title">
      <PageHeader
        title="WhatsApp Business"
        description="Estado real del número, el webhook y la aplicación móvil."
      />
      <div className="card settings-card">
        <div className="section-header">
          <h2 id="whatsapp-settings-title">
            {data.mode === 'cloud_api_only'
              ? 'Solo API de WhatsApp'
              : 'WhatsApp Business con coexistencia'}
          </h2>
          <StatusBadge tone={data.webhookConfigured ? 'success' : 'warning'}>
            {data.webhookConfigured
              ? 'Webhook configurado'
              : 'Webhook pendiente'}
          </StatusBadge>
        </div>
        <dl className="detail-list">
          <div>
            <dt>ID del número</dt>
            <dd>{data.phoneNumberId ?? 'No configurado'}</dd>
          </div>
          <div>
            <dt>ID de cuenta WABA</dt>
            <dd>{data.wabaId ?? 'No registrado'}</dd>
          </div>
          <div>
            <dt>Ventana de atención</dt>
            <dd>{data.serviceWindowHours} horas</dd>
          </div>
        </dl>
        {data.mobileAppAvailable ? (
          <p>La aplicación móvil está verificada para coexistir con la API.</p>
        ) : (
          <p className="callout-warning">
            La aplicación móvil todavía no está verificada para coexistir con la
            API. Responde desde Conversaciones hasta que Meta confirme esta
            capacidad.
          </p>
        )}
        <h3>Checklist para producción</h3>
        <ul>
          <li>Webhook firmado y suscrito al campo messages.</li>
          <li>Número comercial registrado y verificado.</li>
          <li>Plantillas aprobadas para mensajes fuera de 24 horas.</li>
          <li>
            Coexistencia confirmada por evidencia de Meta antes de usar el
            teléfono.
          </li>
        </ul>
      </div>
    </section>
  );
}
