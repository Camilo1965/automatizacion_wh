import type { ConversationMessagePublic } from '../api/conversations-api';

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
      className="conversation-timeline"
      role="log"
      aria-label="Mensajes"
      aria-live="polite"
    >
      {messages.map((message) => (
        <article
          className={`message-bubble message-bubble--${message.source}`}
          key={message.id}
        >
          {message.mediaUrl ? (
            <img
              src={message.mediaUrl}
              alt="Imagen enviada en la conversación"
            />
          ) : null}
          {message.text ? <p>{message.text}</p> : null}
          <small>
            {new Date(message.occurredAt).toLocaleTimeString('es-CO', {
              hour: '2-digit',
              minute: '2-digit',
            })}{' '}
            · {statusLabels[message.status]}
          </small>
        </article>
      ))}
    </div>
  );
}
