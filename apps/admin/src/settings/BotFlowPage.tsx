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
import { PageHeader } from '../components/PageHeader';
import { ErrorMessage } from '../components/ErrorMessage';
import { ConfirmDialog } from '../components/ConfirmDialog';

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
  if (!definition) return <p role="status">Cargando el flujo…</p>;
  return (
    <section className="operational-config">
      <PageHeader
        eyebrow="WhatsApp"
        title="Flujo del bot"
        description="Edita los mensajes, prueba sin enviar WhatsApp y publica para conversaciones nuevas. Los pasos de compra conservan sus validaciones."
      />
      <div className="card">
        <p>
          Versión activa:{' '}
          {query.data?.data.versions.find(
            (version) => version.id === query.data?.data.activeVersionId,
          )?.revision ?? 'flujo inicial'}{' '}
          · {dirty ? 'Cambios sin guardar' : 'Borrador guardado'}
        </p>
        <div className="toolbar">
          <button
            type="button"
            className="ui-button ui-button--secondary control-target"
            disabled={!dirty || mutation.isPending}
            onClick={() => mutation.mutate({ publish: false })}
          >
            Guardar borrador
          </button>
          {dirty && (
            <button
              type="button"
              className="ui-button ui-button--ghost control-target"
              disabled={mutation.isPending}
              onClick={() => {
                sessionStorage.removeItem('kairo.bot-flow-draft');
                setDefinition(null);
                setRevision(null);
                setDirty(false);
              }}
            >
              Descartar cambios locales
            </button>
          )}
          <button
            type="button"
            className="ui-button ui-button--primary control-target"
            disabled={dirty || mutation.isPending}
            onClick={() => setConfirm(true)}
          >
            Publicar flujo
          </button>
        </div>
        {feedback && <p role="status">{feedback}</p>}
        {mutation.isError && (
          <ErrorMessage
            message={getErrorMessage(
              mutation.error,
              'No se pudo guardar el flujo.',
            )}
          />
        )}
      </div>
      <div className="flow-editor flow-editor--with-phone">
        <div className="flow-editor-main">
          <nav className="card" aria-label="Pasos del flujo">
            {BotFlowStepKeys.map((key, index) => (
              <button
                type="button"
                key={key}
                aria-pressed={step === key}
                onClick={() => setStep(key)}
              >
                {index + 1}. {labels[key]}
              </button>
            ))}
          </nav>
          <div className="card">
            <h2>{labels[step]}</h2>
            <label htmlFor="flow-message">Mensaje para el cliente</label>
            <textarea
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
            />
            <label htmlFor="flow-invalid">
              Mensaje cuando la respuesta no es válida
            </label>
            <textarea
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
            />
            <label htmlFor="flow-attempts">
              Intentos antes de solicitar atención humana
            </label>
            <input
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
            />
            <div
              className="toolbar"
              role="group"
              aria-label="Insertar variables disponibles"
            >
              {botFlowVariablesForStep(step).map((variable) => (
                <button
                  key={variable}
                  type="button"
                  onClick={() =>
                    update({
                      ...definition,
                      steps: {
                        ...definition.steps,
                        [step]: {
                          ...definition.steps[step],
                          message:
                            definition.steps[step].message + ` {{${variable}}}`,
                        },
                      },
                    })
                  }
                >{`Insertar ${variable}`}</button>
              ))}
            </div>
            <p>
              Solo se ofrecen variables cuyos datos ya existen en este paso.
            </p>
          </div>
        </div>
        <aside
          className="bot-phone-preview"
          aria-label="Vista previa tipo teléfono"
        >
          <div className="bot-phone-frame">
            <p className="bot-phone-label">{labels[step]}</p>
            <div className="bot-phone-bubble">
              {definition.steps[step].message || 'Escribe un mensaje…'}
            </div>
          </div>
        </aside>
      </div>
      <div className="card">
        <h2>Comandos y catálogo</h2>
        {Object.entries(definition.commands).map(([key, value]) => (
          <label key={key}>
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
            <input
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
            />
          </label>
        ))}
        <label>
          Fotos por página
          <input
            type="number"
            min={1}
            max={10}
            value={definition.pageSize}
            onChange={(event) =>
              update({ ...definition, pageSize: Number(event.target.value) })
            }
          />
        </label>
      </div>
      <div className="card">
        <h2>Simular conversación</h2>
        <fieldset>
          <legend>Opciones del flujo</legend>
          {(
            ['notes', 'showCarrierInSummary', 'sendGuideToCustomer'] as const
          ).map((key) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={definition.optionalSteps[key]}
                onChange={(event) =>
                  update({
                    ...definition,
                    optionalSteps: {
                      ...definition.optionalSteps,
                      [key]: event.target.checked,
                    },
                  })
                }
              />
              {
                {
                  notes: 'Solicitar indicaciones de entrega',
                  showCarrierInSummary: 'Mostrar transportadora en el resumen',
                  sendGuideToCustomer: 'Enviar la guía como PDF al cliente',
                }[key]
              }
            </label>
          ))}
        </fieldset>
        <p>
          Una respuesta por línea. Esta prueba no reserva inventario ni crea
          guías.
        </p>
        <label htmlFor="flow-scenario">Escenario controlado</label>
        <select
          id="flow-scenario"
          value={scenario}
          onChange={(event) => setScenario(event.target.value)}
        >
          <option value="available">Compra con inventario disponible</option>
          <option value="out_of_stock">Talla agotada</option>
          <option value="invalid_locality">Municipio no encontrado</option>
          <option value="blocked_carrier">
            Transportadora obligatoria no disponible
          </option>
          <option value="fallback">Transportadora alternativa permitida</option>
          <option value="expired_quote">Cotización vencida</option>
        </select>
        <label htmlFor="flow-test">Mensajes del cliente</label>
        <textarea
          id="flow-test"
          rows={5}
          value={messages}
          onChange={(event) => setMessages(event.target.value)}
        />
        <button
          type="button"
          disabled={simulation.isPending}
          onClick={() => simulation.mutate()}
        >
          Probar borrador
        </button>
        {simulation.isError && (
          <ErrorMessage
            message={getErrorMessage(
              simulation.error,
              'No se pudo simular el flujo.',
            )}
          />
        )}
        {simulation.data?.data.events.map((event, index) => (
          <div key={index} className="card">
            <p>Cliente: {event.input}</p>
            <p>
              Bot:{' '}
              {event.reply ??
                'Acción operativa: ' + (event.action ?? 'continuar')}
            </p>
          </div>
        ))}
      </div>
      <div className="card">
        <h2>Historial de publicaciones</h2>
        {query.data?.data.versions.map((version) => (
          <div key={version.id}>
            <p>
              Versión {version.revision} ·{' '}
              {new Date(version.createdAt).toLocaleString('es-CO')} ·{' '}
              {version.author}
            </p>
            <button
              type="button"
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
            </button>
          </div>
        ))}
      </div>
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
