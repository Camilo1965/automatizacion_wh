import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  listConversations,
  setConversationControl,
} from '../api/conversations-api';
import { getErrorMessage } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';

export function ConversationsListPage() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['conversations'],
    queryFn: () => listConversations(),
  });
  const conversations = query.data?.items ?? [];
  const control = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: 'take-control' | 'release-control';
    }) => setConversationControl(id, action),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
  return (
    <section aria-labelledby="conversations-title">
      <div className="section-header">
        <h2 id="conversations-title">Conversaciones</h2>
        <p className="muted">Toma el control para responder personalmente.</p>
      </div>
      {query.isLoading ? (
        <LoadingState label="Cargando conversaciones…" />
      ) : null}
      {query.isError ? (
        <ErrorMessage
          message={getErrorMessage(
            query.error,
            'No se pudieron cargar las conversaciones',
          )}
        />
      ) : null}
      {control.isError ? (
        <ErrorMessage
          message={getErrorMessage(
            control.error,
            'No se pudo cambiar el control',
          )}
        />
      ) : null}
      {!query.isLoading && conversations.length === 0 ? (
        <p>No hay conversaciones todavía.</p>
      ) : null}
      {conversations.map((conversation) => (
        <article className="card" key={conversation.id}>
          <h3>{conversation.customerPhone}</h3>
          <p>
            Estado: {conversation.state} · {conversation.pendingOutbound}{' '}
            mensaje(s) pendientes
          </p>
          <p className="muted">
            Control: {conversation.mode === 'human' ? 'propietaria' : 'bot'}
          </p>
          <button
            type="button"
            className={
              conversation.mode === 'human'
                ? 'button-secondary'
                : 'button-primary'
            }
            disabled={control.isPending}
            onClick={() =>
              control.mutate({
                id: conversation.id,
                action:
                  conversation.mode === 'human'
                    ? 'release-control'
                    : 'take-control',
              })
            }
          >
            {conversation.mode === 'human'
              ? 'Devolver al bot'
              : 'Tomar control'}
          </button>
        </article>
      ))}
    </section>
  );
}
