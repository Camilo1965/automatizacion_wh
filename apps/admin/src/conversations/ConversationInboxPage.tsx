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
import { cn } from '@/lib/utils';

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
    <section className="space-y-6" aria-label="Bandeja de WhatsApp">
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
          className={cn(
            'grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_minmax(0,16rem)]',
            mobileThreadOpen
              ? 'max-lg:[&>[data-inbox-list]]:hidden'
              : 'max-lg:[&>[data-inbox-thread]]:hidden max-lg:[&>[data-inbox-context]]:hidden',
          )}
        >
          <div data-inbox-list className="space-y-3">
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
            data-inbox-thread
            className="flex min-h-[28rem] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-card)]"
            aria-label="Conversación seleccionada"
          >
            <header className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <Button
                  className="mb-1 lg:hidden"
                  variant="secondary"
                  onClick={() => setMobileThreadOpen(false)}
                >
                  Conversaciones
                </Button>
                <strong className="block text-sm font-semibold text-foreground">
                  {selected?.customerPhone}
                </strong>
                <small className="text-xs text-muted-foreground">
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
            <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
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
                    <div>
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
            </div>
          </section>
          <aside
            data-inbox-context
            className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
            aria-label="Contexto del cliente"
          >
            <h3 className="text-base font-semibold tracking-tight text-foreground">
              Contexto
            </h3>
            {selected ? (
              <dl className="mt-4 space-y-3">
                <div>
                  <dt className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
                    Teléfono
                  </dt>
                  <dd className="text-sm text-foreground">
                    {selected.customerPhone}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
                    Modo
                  </dt>
                  <dd className="text-sm text-foreground">
                    {selected.mode === 'human' ? 'Propietaria' : 'Bot'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
                    Etapa
                  </dt>
                  <dd className="text-sm text-foreground">
                    {operationalLabel(selected.state)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
                    Talla
                  </dt>
                  <dd className="text-sm text-foreground">
                    {selected.selectedSize ?? 'Sin confirmar'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
                    Pedido activo
                  </dt>
                  <dd className="text-sm text-foreground">
                    {selected.activeOrderId ? (
                      <a
                        className="underline underline-offset-2"
                        href={`/orders/${selected.activeOrderId}`}
                      >
                        Abrir pedido
                      </a>
                    ) : (
                      'Ninguno'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
                    Mensajes en cola
                  </dt>
                  <dd className="text-sm text-foreground">
                    {selected.pendingOutbound}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                Selecciona una conversación.
              </p>
            )}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
