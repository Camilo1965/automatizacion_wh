import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { z } from 'zod';
import {
  BotFlowSimulationResponseSchema,
  BotFlowSimulationResultSchema,
} from '@camila/contracts';
import type { UseMutationResult } from '@tanstack/react-query';

import { getErrorMessage } from '../api/client';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type SimulationResponse = z.infer<typeof BotFlowSimulationResponseSchema>;
type SimulationResult = z.infer<typeof BotFlowSimulationResultSchema>;
type SimulationRequest = { scenario: string; messages: string[] };

const scenarioExamples: ReadonlyArray<{
  id: string;
  label: string;
}> = [
  { id: 'available', label: 'Compra disponible' },
  { id: 'out_of_stock', label: 'Talla agotada' },
  { id: 'invalid_locality', label: 'Municipio inválido' },
  { id: 'blocked_carrier', label: 'Transportadora bloqueada' },
  { id: 'fallback', label: 'Alternativa permitida' },
  { id: 'expired_quote', label: 'Cotización vencida' },
];

const exampleCustomerMessages = [
  'hola',
  '37',
  '01',
  'Ana Ejemplo',
  '3000000000',
  'Antioquia',
  'Medellín',
  'Calle 10 # 20-30',
  'ninguna',
  'confirmar',
];

const messagesByScenario: Readonly<Record<string, readonly string[]>> = {
  available: exampleCustomerMessages,
  out_of_stock: exampleCustomerMessages.slice(0, 2),
  invalid_locality: [...exampleCustomerMessages.slice(0, 6), 'Bogotá'],
  blocked_carrier: exampleCustomerMessages.slice(0, 9),
  fallback: exampleCustomerMessages,
  expired_quote: exampleCustomerMessages,
};

export function BotFlowSimulatePanel({
  scenario,
  setScenario,
  messages,
  setMessages,
  simulation,
}: {
  scenario: string;
  setScenario: (value: string) => void;
  messages: string;
  setMessages: (value: string) => void;
  simulation: UseMutationResult<SimulationResponse, Error, SimulationRequest>;
}) {
  const [conversationMessages, setConversationMessages] = useState<string[]>(
    [],
  );
  const [customerReply, setCustomerReply] = useState('');
  const transcriptRef = useRef<HTMLDivElement>(null);
  const replyInputRef = useRef<HTMLInputElement>(null);
  const result: SimulationResult | undefined = simulation.data?.data;

  useEffect(() => {
    if (transcriptRef.current)
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [result]);

  useEffect(() => {
    if (conversationMessages.length === 1)
      replyInputRef.current?.focus({ preventScroll: true });
  }, [conversationMessages]);

  function run(value: string, inputs: readonly string[]) {
    setScenario(value);
    setConversationMessages([...inputs]);
    setCustomerReply('');
    setMessages(inputs.join('\n'));
    simulation.mutate({ scenario: value, messages: [...inputs] });
  }

  function startManualConversation() {
    simulation.reset();
    run(scenario, ['hola']);
  }

  function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = customerReply.trim();
    if (!next || simulation.isPending) return;
    const nextMessages = [...conversationMessages, next];
    setConversationMessages(nextMessages);
    setCustomerReply('');
    setMessages(nextMessages.join('\n'));
    simulation.mutate({ scenario, messages: nextMessages });
  }

  function runAdvanced() {
    const advancedMessages = messages
      .split('\n')
      .map((message) => message.trim())
      .filter(Boolean);
    if (advancedMessages.length > 0) run(scenario, advancedMessages);
  }

  function reset() {
    setConversationMessages([]);
    setCustomerReply('');
    setMessages('');
    setScenario('available');
    simulation.reset();
  }

  return (
    <Card className="min-w-0 w-full rounded-3xl border-border shadow-[var(--shadow-card)]">
      <CardHeader>
        <CardTitle className="text-lg">Simular conversación</CardTitle>
        <CardDescription>
          Recorre un ejemplo completo o responde paso a paso. Todo ocurre en
          memoria: no se envían mensajes ni se crean pedidos o guías.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            Escenarios de ejemplo
          </p>
          <div
            className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3"
            role="group"
            aria-label="Escenarios de ejemplo"
          >
            {scenarioExamples.map((example) => (
              <Button
                key={example.id}
                type="button"
                variant={scenario === example.id ? 'primary' : 'secondary'}
                disabled={simulation.isPending}
                onClick={() =>
                  run(example.id, messagesByScenario[example.id] ?? [])
                }
                className="h-auto min-h-11 min-w-0 justify-start whitespace-normal px-3 py-2 text-left leading-snug"
              >
                {example.label}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={simulation.isPending}
              onClick={startManualConversation}
            >
              Conversación paso a paso
            </Button>
            {result && (
              <Button
                type="button"
                variant="ghost"
                disabled={simulation.isPending}
                onClick={reset}
              >
                Reiniciar simulación
              </Button>
            )}
          </div>
        </div>

        {result?.fixture && (
          <Card className="min-w-0 rounded-2xl border-dashed shadow-none">
            <CardContent className="flex min-w-0 items-start gap-3 pt-4">
              {result.fixture.imageUrl ? (
                <img
                  src={result.fixture.imageUrl}
                  alt={result.fixture.productName}
                  className="size-16 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-muted text-xs font-semibold text-muted-foreground"
                >
                  REF {result.fixture.reference}
                </div>
              )}
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-semibold text-primary">
                  {result.fixture.label}
                </p>
                <p className="break-words font-medium text-foreground">
                  {result.fixture.productName} · REF {result.fixture.reference}
                </p>
                <p className="break-words text-sm text-muted-foreground">
                  Talla {result.fixture.size} · Producto{' '}
                  {new Intl.NumberFormat('es-CO', {
                    style: 'currency',
                    currency: 'COP',
                    maximumFractionDigits: 0,
                  }).format(result.fixture.productSubtotalCop)}
                </p>
                <p className="break-words text-sm text-muted-foreground">
                  Envío {result.fixture.carrier} ·{' '}
                  {new Intl.NumberFormat('es-CO', {
                    style: 'currency',
                    currency: 'COP',
                    maximumFractionDigits: 0,
                  }).format(result.fixture.shippingCostCop)}
                </p>
                <p className="break-words text-sm text-muted-foreground">
                  Pedido {result.fixture.orderNumber} · {result.fixture.address}
                  , {result.fixture.locality}, {result.fixture.department}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {result && (
          <div
            ref={transcriptRef}
            role="log"
            aria-label="Conversación simulada"
            aria-live="polite"
            aria-busy={simulation.isPending}
            className="flex max-h-[34rem] min-w-0 flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-muted/30 p-3 sm:p-4"
          >
            {result.events.map((event, index) => (
              <div
                key={`${index}-${event.input}`}
                className="flex min-w-0 flex-col gap-2"
              >
                <div className="ml-auto max-w-[92%] break-words whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground sm:max-w-[85%]">
                  {event.input}
                </div>
                {event.reply ? (
                  <div className="mr-auto max-w-[96%] break-words whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-background px-3 py-2 text-sm text-foreground shadow-sm sm:max-w-[85%]">
                    {event.reply}
                  </div>
                ) : event.action ? (
                  <p className="mr-auto max-w-[96%] break-words text-xs text-muted-foreground">
                    Acción simulada: {event.action}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <form className="flex min-w-0 gap-2" onSubmit={submitReply}>
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="flow-customer-reply">Respuesta del cliente</Label>
            <Input
              id="flow-customer-reply"
              ref={replyInputRef}
              autoComplete="off"
              value={customerReply}
              onChange={(event) => setCustomerReply(event.target.value)}
              placeholder="Escribe una respuesta…"
              disabled={
                conversationMessages.length === 0 || simulation.isPending
              }
              className="h-11 min-w-0 rounded-xl"
            />
          </div>
          <Button
            type="submit"
            disabled={
              conversationMessages.length === 0 ||
              simulation.isPending ||
              !customerReply.trim()
            }
            loading={simulation.isPending}
            className="mt-6 shrink-0"
          >
            Enviar
          </Button>
        </form>

        {simulation.isError && (
          <ErrorMessage
            message={getErrorMessage(
              simulation.error,
              'No se pudo simular el flujo.',
            )}
          />
        )}

        <details className="min-w-0 rounded-2xl border border-border p-3">
          <summary className="cursor-pointer font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Pruebas avanzadas
          </summary>
          <div className="mt-3 space-y-2">
            <Label htmlFor="flow-advanced-messages">
              Mensajes para pruebas avanzadas
            </Label>
            <Textarea
              id="flow-advanced-messages"
              rows={5}
              value={messages}
              onChange={(event) => setMessages(event.target.value)}
              className="min-w-0 rounded-xl bg-muted"
            />
            <Button
              type="button"
              variant="secondary"
              disabled={simulation.isPending || !messages.trim()}
              onClick={runAdvanced}
            >
              Probar mensajes avanzados
            </Button>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
