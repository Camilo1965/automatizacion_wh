import { useState } from 'react';

import type { ConversationMessagePublic } from '../api/conversations-api';
import { getErrorMessage } from '../api/client';
import { downloadGuidePdf } from '../api/orders-api';
import { Button } from '../components/Button';
import { cn } from '@/lib/utils';

const statusLabels: Record<
  Exclude<ConversationMessagePublic['status'], 'internal'>,
  string
> = {
  received: 'Recibido',
  queued: 'En cola',
  sent: 'Enviado',
  delivered: 'Entregado',
  read: 'Leído',
  failed: 'Falló',
  cancelled: 'Cancelado',
};

export function ConversationTimeline({
  messages,
}: {
  messages: readonly ConversationMessagePublic[];
}) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
      role="log"
      aria-label="Mensajes"
      aria-live="polite"
    >
      {messages.map((message) => {
        if (message.source === 'system') {
          return <GuideEventCard key={message.id} event={message} />;
        }
        const outbound = message.source !== 'customer';
        const attachmentLabel =
          message.messageType === 'document'
            ? 'Documento adjunto no disponible'
            : message.messageType === 'image'
              ? 'Imagen adjunta no disponible'
              : null;
        return (
          <article
            className={cn(
              'max-w-[85%] rounded-[1.125rem] border px-3 py-2 text-sm shadow-[var(--shadow-card)]',
              outbound
                ? 'ml-auto border-foreground bg-foreground text-background'
                : 'mr-auto border-border bg-muted text-foreground',
            )}
            key={message.id}
          >
            {message.text ? (
              <p className="whitespace-pre-wrap">{message.text}</p>
            ) : null}
            {attachmentLabel ? (
              <p className="mt-1 rounded-lg border border-current/20 px-2 py-1 text-xs">
                {attachmentLabel}
              </p>
            ) : null}
            <small
              className={cn(
                'mt-1 block text-[0.7rem]',
                outbound ? 'text-background/70' : 'text-muted-foreground',
              )}
            >
              {new Date(message.occurredAt).toLocaleTimeString('es-CO', {
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              · {statusLabels[message.status]}
            </small>
          </article>
        );
      })}
    </div>
  );
}

function GuideEventCard({
  event,
}: {
  event: Extract<ConversationMessagePublic, { source: 'system' }>;
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function download() {
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadGuidePdf(
        event.orderId,
        event.orderNumber,
        event.preShipmentNumber,
      );
    } catch (error) {
      setDownloadError(
        getErrorMessage(
          error,
          'No se pudo descargar la guía. Intenta de nuevo.',
        ),
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <article className="w-full max-w-full rounded-2xl border border-primary/30 bg-card p-4 text-sm text-foreground shadow-[var(--shadow-card)] sm:max-w-[34rem]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">Guía de envío creada</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Solo visible para el equipo de KAIRO
          </p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
          {event.carrier}
        </span>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Número de guía</dt>
          <dd className="mt-0.5 break-all font-medium">
            {event.preShipmentNumber}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Pedido</dt>
          <dd className="mt-0.5">
            <a
              className="font-medium underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              href={`/orders/${event.orderId}`}
            >
              {event.orderNumber}
            </a>
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
        <Button
          className="w-full sm:w-auto"
          variant="secondary"
          loading={downloading}
          onClick={() => void download()}
        >
          {downloadError ? 'Reintentar descarga' : 'Descargar guía PDF'}
        </Button>
        {downloadError ? (
          <p className="text-xs text-destructive" role="alert">
            {downloadError}
          </p>
        ) : null}
      </div>
      <small className="mt-3 block text-xs text-muted-foreground">
        {new Date(event.occurredAt).toLocaleString('es-CO', {
          dateStyle: 'medium',
          timeStyle: 'short',
        })}
      </small>
    </article>
  );
}
