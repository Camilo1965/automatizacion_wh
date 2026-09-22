import type { BotFlowDefinitionSchema } from '@camila/contracts';
import type { UseMutationResult } from '@tanstack/react-query';
import type { z } from 'zod';

import { getErrorMessage } from '../api/client';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type BotFlowDefinition = z.infer<typeof BotFlowDefinitionSchema>;

const selectClassName =
  'h-11 w-full rounded-[1.125rem] border border-input bg-muted px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

type SimulationEvent = Readonly<{
  input: string;
  reply?: string | null;
  action?: string | null;
}>;

type SimulationResponse = Readonly<{
  data: { events: readonly SimulationEvent[] };
}>;

export function BotFlowSimulatePanel({
  definition,
  update,
  scenario,
  setScenario,
  messages,
  setMessages,
  simulation,
}: {
  definition: BotFlowDefinition;
  update: (next: BotFlowDefinition) => void;
  scenario: string;
  setScenario: (value: string) => void;
  messages: string;
  setMessages: (value: string) => void;
  simulation: UseMutationResult<SimulationResponse, Error, void>;
}) {
  return (
    <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
      <CardHeader>
        <CardTitle className="text-lg">Simular conversación</CardTitle>
        <CardDescription>
          Una respuesta por línea. Esta prueba no reserva inventario ni crea
          guías.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <fieldset className="space-y-3 rounded-[1.125rem] border border-border p-4">
          <legend className="px-1 text-sm font-medium text-foreground">
            Opciones del flujo
          </legend>
          {(
            ['notes', 'showCarrierInSummary', 'sendGuideToCustomer'] as const
          ).map((key) => (
            <label
              key={key}
              className="flex items-center justify-between gap-3 text-sm text-foreground"
            >
              <span>
                {
                  {
                    notes: 'Solicitar indicaciones de entrega',
                    showCarrierInSummary:
                      'Mostrar transportadora en el resumen',
                    sendGuideToCustomer: 'Enviar la guía como PDF al cliente',
                  }[key]
                }
              </span>
              <Switch
                checked={definition.optionalSteps[key]}
                onCheckedChange={(checked) =>
                  update({
                    ...definition,
                    optionalSteps: {
                      ...definition.optionalSteps,
                      [key]: checked,
                    },
                  })
                }
              />
            </label>
          ))}
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="flow-scenario">Escenario controlado</Label>
          <select
            id="flow-scenario"
            className={selectClassName}
            value={scenario}
            onChange={(event) => setScenario(event.target.value)}
          >
            <option value="available">Compra con inventario disponible</option>
            <option value="out_of_stock">Talla agotada</option>
            <option value="invalid_locality">Municipio no encontrado</option>
            <option value="blocked_carrier">
              Transportadora obligatoria no disponible
            </option>
            <option value="fallback">
              Transportadora alternativa permitida
            </option>
            <option value="expired_quote">Cotización vencida</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="flow-test">Mensajes del cliente</Label>
          <Textarea
            id="flow-test"
            rows={5}
            value={messages}
            onChange={(event) => setMessages(event.target.value)}
            className="rounded-[1.125rem] bg-muted"
          />
        </div>
        <Button
          type="button"
          disabled={simulation.isPending}
          loading={simulation.isPending}
          onClick={() => simulation.mutate()}
        >
          Probar borrador
        </Button>
        {simulation.isError && (
          <ErrorMessage
            message={getErrorMessage(
              simulation.error,
              'No se pudo simular el flujo.',
            )}
          />
        )}
        <div className="space-y-3">
          {simulation.data?.data.events.map((event, index) => (
            <Card
              key={index}
              className="rounded-[1.125rem] border-border shadow-none"
            >
              <CardContent className="space-y-1 pt-4">
                <p className="text-sm text-foreground">
                  Cliente: {event.input}
                </p>
                <p className="text-sm text-muted-foreground">
                  Bot:{' '}
                  {event.reply ??
                    'Acción operativa: ' + (event.action ?? 'continuar')}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
