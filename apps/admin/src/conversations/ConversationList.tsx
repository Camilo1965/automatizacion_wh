import type { ConversationPublic } from '../api/conversations-api';
import { StatusBadge } from '../components/StatusBadge';
import { cn } from '@/lib/utils';

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
            <strong className="block truncate text-sm font-semibold">
              {conversation.customerPhone}
            </strong>
            <small
              className={cn(
                'block truncate text-xs',
                conversation.id === selectedId
                  ? 'text-primary-foreground/80'
                  : 'text-muted-foreground',
              )}
            >
              {conversation.state.replaceAll('_', ' ')}
            </small>
          </span>
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
