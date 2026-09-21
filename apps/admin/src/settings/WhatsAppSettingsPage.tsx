import { useQuery } from '@tanstack/react-query';

import { getWhatsAppConnection } from '../api/whatsapp-api';
import { ErrorMessage } from '@/components/ErrorMessage';
import { LoadingState } from '@/components/LoadingState';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

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
    <section className="space-y-6" aria-labelledby="whatsapp-settings-title">
      <PageHeader
        title="WhatsApp Business"
        description="Estado real del número, el webhook y la aplicación móvil."
      />
      <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle id="whatsapp-settings-title" className="text-lg">
              {data.mode === 'cloud_api_only'
                ? 'Solo API de WhatsApp'
                : 'WhatsApp Business con coexistencia'}
            </CardTitle>
            <CardDescription>
              Conexión y checklist operativo del canal.
            </CardDescription>
          </div>
          <StatusBadge tone={data.webhookConfigured ? 'success' : 'warning'}>
            {data.webhookConfigured
              ? 'Webhook configurado'
              : 'Webhook pendiente'}
          </StatusBadge>
        </CardHeader>
        <CardContent className="space-y-5">
          <dl className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <dt className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
                ID del número
              </dt>
              <dd className="text-sm text-foreground">
                {data.phoneNumberId ?? 'No configurado'}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
                ID de cuenta WABA
              </dt>
              <dd className="text-sm text-foreground">
                {data.wabaId ?? 'No registrado'}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
                Ventana de atención
              </dt>
              <dd className="text-sm text-foreground">
                {data.serviceWindowHours} horas
              </dd>
            </div>
          </dl>
          {data.mobileAppAvailable ? (
            <p className="text-sm text-foreground">
              La aplicación móvil está verificada para coexistir con la API.
            </p>
          ) : (
            <p className="rounded-[1.125rem] border border-border bg-muted/50 px-4 py-3 text-sm text-foreground">
              La aplicación móvil todavía no está verificada para coexistir con
              la API. Responde desde Conversaciones hasta que Meta confirme esta
              capacidad.
            </p>
          )}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-foreground">
              Checklist para producción
            </h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Webhook firmado y suscrito al campo messages.</li>
              <li>Número comercial registrado y verificado.</li>
              <li>Plantillas aprobadas para mensajes fuera de 24 horas.</li>
              <li>
                Coexistencia confirmada por evidencia de Meta antes de usar el
                teléfono.
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
