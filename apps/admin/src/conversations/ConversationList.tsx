import type { ConversationPublic } from '../api/conversations-api';
import { StatusBadge } from '../components/StatusBadge';

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
    <div className="inbox-list" aria-label="Lista de conversaciones">
      {items.map((conversation) => (
        <button
          className="conversation-row"
          data-selected={conversation.id === selectedId}
          key={conversation.id}
          onClick={() => onSelect(conversation.id)}
          type="button"
        >
          <span className="conversation-avatar" aria-hidden="true">
            {conversation.customerPhone.slice(-2)}
          </span>
          <span className="conversation-row-copy">
            <strong>{conversation.customerPhone}</strong>
            <small>{conversation.state.replaceAll('_', ' ')}</small>
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
