import type { ConversationMessagePublic } from '../api/conversations-api';
import { cn } from '@/lib/utils';

const statusLabels: Record<ConversationMessagePublic['status'], string> = {
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
        const outbound = message.source !== 'customer';
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
            {message.mediaUrl ? (
              <img
                className="mb-2 max-h-48 rounded-[0.75rem] object-cover"
                src={message.mediaUrl}
                alt="Imagen enviada en la conversación"
              />
            ) : null}
            {message.text ? (
              <p className="whitespace-pre-wrap">{message.text}</p>
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
