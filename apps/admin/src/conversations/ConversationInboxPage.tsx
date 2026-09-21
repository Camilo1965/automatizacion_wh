import { useEffect, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';

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
import { useSearchParams } from 'react-router-dom';

export function ConversationInboxPage() {
  const client = useQueryClient();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const requestedId = searchParams.get('conversation');
  const attentionOnly = searchParams.get('attention') === 'true';
  const conversations = useInfiniteQuery({
    queryKey: ['conversations'],
    queryFn: ({ pageParam }) => listConversations(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    refetchInterval: 5000,
  });
  const conversationItems =
    conversations.data?.pages.flatMap((page) => page.items) ?? [];
  const visibleConversations = attentionOnly
    ? conversationItems.filter((item) => item.mode === 'human')
    : conversationItems;
  const effectiveSelectedId =
    selectedId ??
    visibleConversations?.find((item) => item.id === requestedId)?.id ??
    visibleConversations?.[0]?.id ??
    null;
  const selected = visibleConversations?.find(
    (item) => item.id === effectiveSelectedId,
  );

  useEffect(() => {
    if (requestedId) setMobileThreadOpen(true);
  }, [requestedId]);

  function selectConversation(id: string) {
    setSelectedId(id);
    setMobileThreadOpen(true);
  }
  const messages = useInfiniteQuery({
    queryKey: ['conversation-messages', effectiveSelectedId],
    queryFn: ({ pageParam }) =>
      listConversationMessages(effectiveSelectedId!, pageParam),
    enabled: effectiveSelectedId !== null,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    refetchInterval: 5000,
  });
  const activeDraft =
    effectiveSelectedId === null ? '' : (drafts[effectiveSelectedId] ?? '');
  const send = useMutation({
    mutationFn: (input: { conversationId: string; text: string }) =>
      sendConversationMessage(input.conversationId, input.text),
    onSuccess: async (_data, input) => {
      showToast('Mensaje en cola');
      setDrafts((current) => {
        const next = { ...current };
        if (next[input.conversationId]?.trim() === input.text) {
          delete next[input.conversationId];
        }
        return next;
      });
      await client.invalidateQueries({
        queryKey: ['conversation-messages', input.conversationId],
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
      {!conversations.isLoading && conversationItems.length === 0 ? (
        <EmptyState
          title="Sin conversaciones"
          description="Los mensajes que lleguen al número conectado aparecerán aquí."
        />
      ) : null}
      {visibleConversations.length > 0 ? (
        <div
          className={`inbox-layout inbox-layout--triple${mobileThreadOpen ? ' inbox-layout--thread' : ' inbox-layout--list'}`}
        >
          <div className="inbox-list-column">
            <ConversationList
              items={visibleConversations}
              selectedId={effectiveSelectedId}
              onSelect={selectConversation}
            />
            {conversations.hasNextPage ? (
              <Button
                loading={conversations.isFetchingNextPage}
                onClick={() => void conversations.fetchNextPage()}
                variant="secondary"
              >
                Cargar más conversaciones
              </Button>
            ) : null}
          </div>
          <section
            className="conversation-panel"
            aria-label="Conversación seleccionada"
          >
            <header className="conversation-panel-header">
              <div>
                <Button
                  className="inbox-back"
                  variant="secondary"
                  onClick={() => setMobileThreadOpen(false)}
                >
                  Conversaciones
                </Button>
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
              <>
                {messages.hasNextPage ? (
                  <div className="conversation-history-control">
                    <Button
                      loading={messages.isFetchingNextPage}
                      onClick={() => void messages.fetchNextPage()}
                      variant="secondary"
                    >
                      Cargar mensajes anteriores
                    </Button>
                  </div>
                ) : null}
                <ConversationTimeline
                  messages={messages.data.pages
                    .slice()
                    .reverse()
                    .flatMap((page) => page.items)}
                />
              </>
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
              text={activeDraft}
              onTextChange={(next) => {
                if (effectiveSelectedId === null) return;
                setDrafts((current) => ({
                  ...current,
                  [effectiveSelectedId]: next,
                }));
              }}
              onSend={async (text) => {
                if (effectiveSelectedId === null) return;
                await send.mutateAsync({
                  conversationId: effectiveSelectedId,
                  text,
                });
              }}
            />
          </section>
          <aside
            className="conversation-context"
            aria-label="Contexto del cliente"
          >
            <h3>Contexto</h3>
            {selected ? (
              <dl className="context-dl">
                <div>
                  <dt>Teléfono</dt>
                  <dd>{selected.customerPhone}</dd>
                </div>
                <div>
                  <dt>Modo</dt>
                  <dd>{selected.mode === 'human' ? 'Propietaria' : 'Bot'}</dd>
                </div>
                <div>
                  <dt>Etapa</dt>
                  <dd>{operationalLabel(selected.state)}</dd>
                </div>
                <div>
                  <dt>Talla</dt>
                  <dd>{selected.selectedSize ?? 'Sin confirmar'}</dd>
                </div>
                <div>
                  <dt>Pedido activo</dt>
                  <dd>
                    {selected.activeOrderId ? (
                      <a href={`/orders/${selected.activeOrderId}`}>
                        Abrir pedido
                      </a>
                    ) : (
                      'Ninguno'
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Mensajes en cola</dt>
                  <dd>{selected.pendingOutbound}</dd>
                </div>
              </dl>
            ) : (
              <p className="muted">Selecciona una conversación.</p>
            )}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
