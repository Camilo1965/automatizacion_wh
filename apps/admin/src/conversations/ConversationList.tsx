import type { ConversationPublic } from '../api/conversations-api';
import { StatusBadge } from '../components/StatusBadge';
import { cn } from '@/lib/utils';

function activityTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  }).format(date);
}

export function ConversationList({
  items,
  selectedId,
  onSelect,
}: {
  items: readonly ConversationPublic[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className="space-y-2 rounded-3xl border border-border bg-card p-2 shadow-[var(--shadow-card)]"
      aria-label="Lista de conversaciones"
    >
      {items.map((conversation) => (
        <button
          className={cn(
            'control-target flex w-full items-center gap-3 rounded-[1.125rem] border px-3 py-3 text-left transition-colors',
            conversation.id === selectedId
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-transparent bg-transparent hover:bg-muted',
          )}
          data-selected={conversation.id === selectedId}
          key={conversation.id}
          onClick={() => onSelect(conversation.id)}
          type="button"
        >
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-[1.125rem] text-xs font-semibold',
              conversation.id === selectedId
                ? 'bg-primary-foreground/15 text-primary-foreground'
                : 'bg-muted text-muted-foreground',
            )}
            aria-hidden="true"
          >
            {conversation.customerPhone.slice(-2)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <strong className="block min-w-0 flex-1 truncate text-sm font-semibold">
                {conversation.customerName?.trim() ||
                  conversation.customerPhone}
              </strong>
              {activityTime(
                conversation.lastMessageAt ?? conversation.lastInboundMessageAt,
              ) ? (
                <time
                  className={cn(
                    'shrink-0 text-[0.6875rem]',
                    conversation.id === selectedId
                      ? 'text-primary-foreground/70'
                      : 'text-muted-foreground',
                  )}
                  dateTime={
                    conversation.lastMessageAt ??
                    conversation.lastInboundMessageAt
                  }
                >
                  {activityTime(
                    conversation.lastMessageAt ??
                      conversation.lastInboundMessageAt,
                  )}
                </time>
              ) : null}
            </span>
            <small
              className={cn(
                'block truncate text-xs',
                conversation.id === selectedId
                  ? 'text-primary-foreground/80'
                  : 'text-muted-foreground',
              )}
            >
              {conversation.customerName?.trim()
                ? conversation.customerPhone
                : conversation.lastPreview?.trim() ||
                  conversation.state.replaceAll('_', ' ')}
            </small>
            {conversation.customerName?.trim() ? (
              <small
                className={cn(
                  'mt-1 block truncate text-xs',
                  conversation.id === selectedId
                    ? 'text-primary-foreground/80'
                    : 'text-muted-foreground',
                )}
              >
                {conversation.lastPreview?.trim() ||
                  conversation.state.replaceAll('_', ' ')}
              </small>
            ) : null}
          </span>
          {(conversation.unreadCount ?? 0) > 0 ? (
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-1 text-[0.6875rem] font-semibold',
                conversation.id === selectedId
                  ? 'bg-primary-foreground text-primary'
                  : 'bg-primary text-primary-foreground',
              )}
              aria-label={`${conversation.unreadCount} sin leer`}
            >
              {conversation.unreadCount} sin leer
            </span>
          ) : null}
          <StatusBadge
            tone={conversation.mode === 'human' ? 'info' : 'success'}
          >
            {conversation.mode === 'human' ? 'Propietaria' : 'Bot'}
          </StatusBadge>
        </button>
      ))}
    </div>
  );
}
