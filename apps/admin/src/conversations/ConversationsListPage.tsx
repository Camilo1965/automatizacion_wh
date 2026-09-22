import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  listConversations,
  setConversationControl,
} from '../api/conversations-api';
import { getErrorMessage } from '../api/client';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { PageHeader } from '../components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
    <section aria-labelledby="conversations-title" className="space-y-6">
      <PageHeader
        title="Conversaciones"
        titleId="conversations-title"
        description="Toma el control para responder personalmente."
      />
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
        <p className="text-sm text-muted-foreground">
          No hay conversaciones todavía.
        </p>
      ) : null}
      <div className="space-y-3">
        {conversations.map((conversation) => (
          <Card
            className="rounded-3xl border-border shadow-[var(--shadow-card)]"
            key={conversation.id}
          >
            <CardHeader className="space-y-1">
              <CardTitle className="text-base font-semibold">
                {conversation.customerPhone}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Estado: {conversation.state} · {conversation.pendingOutbound}{' '}
                mensaje(s) pendientes
              </p>
              <p className="text-sm text-muted-foreground">
                Control: {conversation.mode === 'human' ? 'propietaria' : 'bot'}
              </p>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                variant={
                  conversation.mode === 'human' ? 'secondary' : 'primary'
                }
                loading={control.isPending}
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
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
