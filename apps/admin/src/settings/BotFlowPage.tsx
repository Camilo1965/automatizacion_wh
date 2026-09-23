import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BotFlowStateResponseSchema,
  BotFlowStepKeys,
  BotFlowDefinitionSchema,
  botFlowVariablesForStep,
} from '@camila/contracts';
import { z } from 'zod';

import { apiRequest, getErrorMessage } from '../api/client';
import { PageHeader } from '@/components/PageHeader';
import { ErrorMessage } from '@/components/ErrorMessage';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/Button';
import { StatusBadge } from '@/components/StatusBadge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { BotFlowSimulatePanel } from './BotFlowSimulatePanel';

type Definition = z.infer<typeof BotFlowDefinitionSchema>;
function recoverDraft(): { definition: Definition; revision: number } | null {
  try {
    const text = sessionStorage.getItem('kairo.bot-flow-draft');
    return text
      ? z
          .object({
            definition: BotFlowDefinitionSchema,
            revision: z.number().int().nonnegative(),
          })
          .parse(JSON.parse(text))
      : null;
  } catch {
    return null;
  }
}
const labels: Record<(typeof BotFlowStepKeys)[number], string> = {
  welcome: 'Bienvenida',
  size: 'Talla',
  catalog: 'Catálogo',
  reference: 'Referencia',
  name: 'Nombre',
  phone: 'Celular',
  department: 'Departamento',
  locality: 'Municipio',
  address: 'Dirección',
  notes: 'Indicaciones',
  quote: 'Envío automático',
  summary: 'Resumen',
  confirmation: 'Confirmación',
  guide: 'Guía',
  complete: 'Pedido confirmado',
  human: 'Atención de la propietaria',
};
const SimulationSchema = z.object({
  data: z.object({
    events: z.array(
      z.object({
        input: z.string(),
        state: z.string(),
        reply: z.string().nullable(),
        action: z.string().nullable(),
      }),
    ),
    sideEffects: z.literal(false),
  }),
});

export function BotFlowPage() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['bot-flow'],
    queryFn: () =>
      apiRequest('/bot-flow', { schema: BotFlowStateResponseSchema }),
  });
  const [recovered] = useState(recoverDraft);
  const [draftDefinition, setDefinition] = useState<Definition | null>(
    recovered?.definition ?? null,
  );
  const definition = draftDefinition ?? query.data?.data.definition ?? null;
  const [savedRevision, setRevision] = useState<number | null>(
    recovered?.revision ?? null,
  );
  const revision = savedRevision ?? query.data?.data.revision ?? 0;
  const [step, setStep] = useState<(typeof BotFlowStepKeys)[number]>('welcome');
  const [dirty, setDirty] = useState(recovered !== null);
  const [confirm, setConfirm] = useState(false);
  const [messages, setMessages] = useState('hola\n37');
  const [scenario, setScenario] = useState('available');
  const [feedback, setFeedback] = useState('');
  const mutation = useMutation({
    mutationFn: ({
      publish,
      restoreVersionId,
    }: {
      publish: boolean;
      restoreVersionId?: string;
    }) =>
      apiRequest(publish ? '/bot-flow/publish' : '/bot-flow/draft', {
        method: publish ? 'POST' : 'PUT',
        body: publish
          ? { revision, ...(restoreVersionId ? { restoreVersionId } : {}) }
          : { revision, definition },
        schema: BotFlowStateResponseSchema,
      }),
    onSuccess: (response, variables) => {
      sessionStorage.removeItem('kairo.bot-flow-draft');
      setDirty(false);
      setDefinition(response.data.definition);
      setRevision(response.data.revision);
      client.setQueryData(['bot-flow'], response);
      setConfirm(false);
      setFeedback(
        variables.publish
          ? 'Publicado. Las conversaciones nuevas usan esta versión; las abiertas conservan la suya hasta reiniciar.'
          : 'Borrador guardado. Las conversaciones existentes conservan su versión.',
      );
    },
  });
  const simulation = useMutation({
    mutationFn: () =>
      apiRequest('/bot-flow/simulate', {
        method: 'POST',
        body: {
          definition,
          scenario,
          messages: messages.split('\n').filter(Boolean),
        },
        schema: SimulationSchema,
      }),
  });
  function update(value: Definition) {
    try {
      sessionStorage.setItem(
        'kairo.bot-flow-draft',
        JSON.stringify({ definition: value, revision }),
      );
    } catch {
      /* The server draft remains available when browser storage is disabled. */
    }
    setDefinition(value);
    setDirty(true);
    setFeedback('');
  }
  if (query.isError)
    return (
      <ErrorMessage
        message={getErrorMessage(query.error, 'No se pudo cargar el flujo.')}
      />
    );
  if (!definition)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Cargando el flujo…
      </p>
    );
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="WhatsApp"
        title="Flujo del bot"
        description="Edita los mensajes, prueba sin enviar WhatsApp y publica para conversaciones nuevas. Los pasos de compra conservan sus validaciones."
      />
      <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">Estado del borrador</CardTitle>
            <CardDescription>
              Versión activa:{' '}
              {query.data?.data.versions.find(
                (version) => version.id === query.data?.data.activeVersionId,
              )?.revision ?? 'flujo inicial'}
            </CardDescription>
          </div>
          <StatusBadge tone={dirty ? 'warning' : 'success'}>
            {dirty ? 'Cambios sin guardar' : 'Borrador guardado'}
          </StatusBadge>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!dirty || mutation.isPending}
              loading={mutation.isPending}
              onClick={() => mutation.mutate({ publish: false })}
            >
              Guardar borrador
            </Button>
            {dirty && (
              <Button
                type="button"
                variant="ghost"
                disabled={mutation.isPending}
                onClick={() => {
                  sessionStorage.removeItem('kairo.bot-flow-draft');
                  setDefinition(null);
                  setRevision(null);
                  setDirty(false);
                }}
              >
                Descartar cambios locales
              </Button>
            )}
            <Button
              type="button"
              disabled={dirty || mutation.isPending}
              onClick={() => setConfirm(true)}
            >
              Publicar flujo
            </Button>
          </div>
          {feedback && (
            <p role="status" className="text-sm text-foreground">
              {feedback}
            </p>
          )}
          {mutation.isError && (
            <ErrorMessage
              message={getErrorMessage(
                mutation.error,
                'No se pudo guardar el flujo.',
              )}
            />
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="editor" className="gap-4">
        <TabsList className="h-auto rounded-[1.125rem] p-1">
          <TabsTrigger value="editor" className="rounded-[0.875rem] px-3 py-2">
            Editor
          </TabsTrigger>
          <TabsTrigger
            value="simulate"
            className="rounded-[0.875rem] px-3 py-2"
          >
            Simular
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-[0.875rem] px-3 py-2">
            Historial
          </TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[16rem_minmax(0,1fr)_18rem]">
            <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
              <CardHeader>
                <CardTitle className="text-base">Pasos del flujo</CardTitle>
              </CardHeader>
              <CardContent>
                <nav
                  className="flex max-h-[28rem] flex-col gap-1 overflow-y-auto"
                  aria-label="Pasos del flujo"
                >
                  {BotFlowStepKeys.map((key, index) => (
                    <button
                      type="button"
                      key={key}
                      aria-pressed={step === key}
                      onClick={() => setStep(key)}
                      className={cn(
                        'rounded-[1.125rem] px-3 py-2 text-left text-sm transition-colors',
                        step === key
                          ? 'bg-primary text-primary-foreground'
                          : 'text-foreground hover:bg-muted',
                      )}
                    >
                      {index + 1}. {labels[key]}
                    </button>
                  ))}
                </nav>
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
              <CardHeader>
                <CardTitle className="text-lg">{labels[step]}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="flow-message">Mensaje para el cliente</Label>
                  <Textarea
                    id="flow-message"
                    rows={5}
                    maxLength={4096}
                    value={definition.steps[step].message}
                    onChange={(event) =>
                      update({
                        ...definition,
                        steps: {
                          ...definition.steps,
                          [step]: {
                            ...definition.steps[step],
                            message: event.target.value,
                          },
                        },
                      })
                    }
                    className="rounded-[1.125rem] bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="flow-invalid">
                    Mensaje cuando la respuesta no es válida
                  </Label>
                  <Textarea
                    id="flow-invalid"
                    rows={3}
                    value={definition.steps[step].invalidMessage ?? ''}
                    onChange={(event) =>
                      update({
                        ...definition,
                        steps: {
                          ...definition.steps,
                          [step]: {
                            ...definition.steps[step],
                            invalidMessage: event.target.value,
                          },
                        },
                      })
                    }
                    className="rounded-[1.125rem] bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="flow-attempts">
                    Intentos antes de solicitar atención humana
                  </Label>
                  <Input
                    id="flow-attempts"
                    type="number"
                    min={1}
                    max={10}
                    value={definition.steps[step].maxAttempts ?? 3}
                    onChange={(event) =>
                      update({
                        ...definition,
                        steps: {
                          ...definition.steps,
                          [step]: {
                            ...definition.steps[step],
                            maxAttempts: Number(event.target.value),
                          },
                        },
                      })
                    }
                    className="h-11 rounded-[1.125rem] bg-muted"
                  />
                </div>
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label="Insertar variables disponibles"
                >
                  {botFlowVariablesForStep(step).map((variable) => (
                    <Button
                      key={variable}
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        update({
                          ...definition,
                          steps: {
                            ...definition.steps,
                            [step]: {
                              ...definition.steps[step],
                              message:
                                definition.steps[step].message +
                                ` {{${variable}}}`,
                            },
                          },
                        })
                      }
                    >{`Insertar ${variable}`}</Button>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">
                  Solo se ofrecen variables cuyos datos ya existen en este paso.
                </p>
              </CardContent>
            </Card>

            <aside
              className="rounded-3xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
              aria-label="Vista previa tipo teléfono"
            >
              <div className="mx-auto flex min-h-[22rem] w-full max-w-[16rem] flex-col rounded-[1.75rem] border border-border bg-muted/40 p-4">
                <p className="mb-3 text-center text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase">
                  {labels[step]}
                </p>
                <div className="rounded-[1.125rem] bg-background px-3 py-2 text-sm text-foreground shadow-[var(--shadow-card)]">
                  {definition.steps[step].message || 'Escribe un mensaje…'}
                </div>
              </div>
            </aside>
          </div>

          <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-lg">Comandos y catálogo</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {Object.entries(definition.commands).map(([key, value]) => (
                <div className="space-y-2" key={key}>
                  <Label htmlFor={`flow-command-${key}`}>
                    {
                      (
                        {
                          human: 'Pedir ayuda',
                          reset: 'Reiniciar',
                          more: 'Más modelos',
                          confirm: 'Confirmar',
                          cancel: 'Cancelar',
                        } as Record<string, string>
                      )[key]
                    }
                  </Label>
                  <Input
                    id={`flow-command-${key}`}
                    value={value}
                    maxLength={40}
                    onChange={(event) =>
                      update({
                        ...definition,
                        commands: {
                          ...definition.commands,
                          [key]: event.target.value,
                        },
                      })
                    }
                    className="h-11 rounded-[1.125rem] bg-muted"
                  />
                </div>
              ))}
              <div className="space-y-2">
                <Label htmlFor="flow-page-size">Fotos por página</Label>
                <Input
                  id="flow-page-size"
                  type="number"
                  min={1}
                  max={10}
                  value={definition.pageSize}
                  onChange={(event) =>
                    update({
                      ...definition,
                      pageSize: Number(event.target.value),
                    })
                  }
                  className="h-11 rounded-[1.125rem] bg-muted"
                />
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-lg">Opciones del flujo</CardTitle>
              <CardDescription>
                Estos cambios afectan las conversaciones nuevas después de
                guardar y publicar el flujo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(
                [
                  'notes',
                  'showCarrierInSummary',
                  'sendGuideToCustomer',
                ] as const
              ).map((key) => {
                const label = {
                  notes: 'Solicitar indicaciones de entrega',
                  showCarrierInSummary: 'Mostrar transportadora en el resumen',
                  sendGuideToCustomer: 'Enviar la guía como PDF al cliente',
                }[key];
                return (
                  <label
                    key={key}
                    className="flex items-center justify-between gap-3 text-sm text-foreground"
                  >
                    <span>{label}</span>
                    <Switch
                      aria-label={label}
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
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="simulate" className="space-y-4">
          <BotFlowSimulatePanel
            scenario={scenario}
            setScenario={setScenario}
            messages={messages}
            setMessages={setMessages}
            simulation={simulation}
          />
        </TabsContent>

        <TabsContent value="history">
          <Card className="rounded-3xl border-border shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="text-lg">
                Historial de publicaciones
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {query.data?.data.versions.map((version) => (
                <div
                  key={version.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[1.125rem] border border-border p-4"
                >
                  <p className="text-sm text-foreground">
                    Versión {version.revision} ·{' '}
                    {new Date(version.createdAt).toLocaleString('es-CO')} ·{' '}
                    {version.author}
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={dirty || mutation.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          '¿Restaurar esta versión como una publicación nueva?',
                        )
                      )
                        mutation.mutate({
                          publish: true,
                          restoreVersionId: version.id,
                        });
                    }}
                  >
                    Restaurar versión {version.revision}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirm}
        title="Publicar flujo"
        message="Las conversaciones nuevas usarán esta versión. Las abiertas conservan la suya hasta reiniciar o completar el pedido."
        confirmLabel="Publicar"
        busy={mutation.isPending}
        onConfirm={() => mutation.mutate({ publish: true })}
        onCancel={() => setConfirm(false)}
      />
    </section>
  );
}
