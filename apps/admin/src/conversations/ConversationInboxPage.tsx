import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  listConversationMessages,
  listConversations,
  sendConversationMessage,
  setConversationControl,
} from '../api/conversations-api';
import { getErrorMessage } from '../api/client';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { ErrorMessage } from '../components/ErrorMessage';
import { PageHeader } from '../components/PageHeader';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../components/toast-context';
import { ConversationList } from './ConversationList';
import { ConversationTimeline } from './ConversationTimeline';
import { MessageComposer } from './MessageComposer';
import { operationalLabel } from '../lib/operational-label';

export function ConversationInboxPage() {
  const client = useQueryClient();
  const { showToast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const conversations = useQuery({
    queryKey: ['conversations'],
    queryFn: listConversations,
    refetchInterval: 5000,
  });
  const effectiveSelectedId = selectedId ?? conversations.data?.[0]?.id ?? null;
  const selected = conversations.data?.find(
    (item) => item.id === effectiveSelectedId,
  );
  const messages = useQuery({
    queryKey: ['conversation-messages', effectiveSelectedId],
    queryFn: () => listConversationMessages(effectiveSelectedId!),
    enabled: effectiveSelectedId !== null,
    refetchInterval: 5000,
  });
  const send = useMutation({
    mutationFn: (text: string) =>
      sendConversationMessage(effectiveSelectedId!, text),
    onSuccess: async () => {
      showToast('Mensaje en cola');
      await client.invalidateQueries({
        queryKey: ['conversation-messages', effectiveSelectedId],
      });
    },
  });
  const control = useMutation({
    mutationFn: (action: 'take-control' | 'release-control') =>
      setConversationControl(effectiveSelectedId!, action),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  return (
    <section className="conversation-inbox" aria-label="Bandeja de WhatsApp">
      <PageHeader
        eyebrow="WhatsApp Business"
        title="Conversaciones"
        description="Lee y responde desde aquí. El bot se pausa cuando tomas el control."
      />
      {conversations.isLoading ? (
        <Skeleton lines={5} label="Cargando conversaciones" />
      ) : null}
      {conversations.isError ? (
        <ErrorMessage
          message={getErrorMessage(
            conversations.error,
            'No se pudieron cargar las conversaciones',
          )}
        />
      ) : null}
      {conversations.data?.length === 0 ? (
        <EmptyState
          title="Sin conversaciones"
          description="Los mensajes que lleguen al número conectado aparecerán aquí."
        />
      ) : null}
      {conversations.data && conversations.data.length > 0 ? (
        <div className="inbox-layout">
          <ConversationList
            items={conversations.data}
            selectedId={effectiveSelectedId}
            onSelect={setSelectedId}
          />
          <section
            className="conversation-panel"
            aria-label="Conversación seleccionada"
          >
            <header className="conversation-panel-header">
              <div>
                <strong>{selected?.customerPhone}</strong>
                <small>
                  El bot espera: {operationalLabel(selected?.state)}
                </small>
              </div>
              <Button
                variant={selected?.mode === 'human' ? 'secondary' : 'primary'}
                loading={control.isPending}
                onClick={() =>
                  control.mutate(
                    selected?.mode === 'human'
                      ? 'release-control'
                      : 'take-control',
                  )
                }
              >
                {selected?.mode === 'human'
                  ? 'Devolver al bot'
                  : 'Tomar control'}
              </Button>
            </header>
            {messages.isLoading ? (
              <Skeleton lines={4} label="Cargando mensajes" />
            ) : null}
            {messages.isError ? (
              <ErrorMessage
                message={getErrorMessage(
                  messages.error,
                  'No se pudieron cargar los mensajes',
                )}
              />
            ) : null}
            {messages.data ? (
              <ConversationTimeline messages={messages.data.items} />
            ) : null}
            {send.isError ? (
              <ErrorMessage
                message={getErrorMessage(
                  send.error,
                  'No se pudo enviar el mensaje',
                )}
              />
            ) : null}
            <MessageComposer
              enabled={selected?.mode === 'human'}
              pending={send.isPending}
              onSend={async (text) => {
                await send.mutateAsync(text);
              }}
            />
          </section>
        </div>
      ) : null}
    </section>
  );
}
