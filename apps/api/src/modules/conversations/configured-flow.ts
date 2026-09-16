import {
  advanceConversation,
  type ConversationState,
  type ConversationTransition,
} from './conversation-state.js';
import type { BotFlowDefinition, FlowStepKey } from './flow-definition.js';

const steps: Partial<Record<ConversationState, FlowStepKey>> = {
  awaiting_size: 'size',
  showing_models: 'reference',
  awaiting_name: 'name',
  awaiting_phone: 'phone',
  awaiting_department: 'department',
  awaiting_locality: 'locality',
  awaiting_address: 'address',
  awaiting_notes: 'notes',
  awaiting_confirmation: 'confirmation',
  completed: 'complete',
};

export function renderFlowMessage(
  message: string,
  variables: Record<string, string> = {},
): string {
  return message.replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (_, key: string) => variables[key] ?? '',
  );
}

export function advanceConfiguredConversation(
  state: ConversationState | null,
  text: string,
  attempts: number,
  flow: BotFlowDefinition,
  variables: Record<string, string> = {},
): ConversationTransition {
  const normalize = (value: string) =>
    value
      .trim()
      .toLocaleLowerCase('es-CO')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  const command = Object.entries(flow.commands).find(
    ([, value]) => normalize(value) === normalize(text),
  )?.[0];
  const canonical: Record<string, string> = {
    human: 'asesora',
    reset: 'volver',
    more: 'más modelos',
    confirm: 'confirmar',
    cancel: 'cancelar',
  };
  const transition = advanceConversation(
    state,
    command === undefined ? text : canonical[command]!,
    attempts,
  );
  if (transition.action === 'collect_address' && !flow.optionalSteps.notes)
    return { ...transition, state: 'awaiting_confirmation', reply: null };
  let key: FlowStepKey | undefined;
  if (state === null) key = 'welcome';
  else if (transition.action === 'human_takeover') key = 'human';
  else if (transition.reply !== null) key = steps[transition.state];
  if (key === undefined)
    return {
      ...transition,
      ...(transition.state !== state ? { invalidAttempts: 0 } : {}),
    };
  const step = flow.steps[key];
  const invalid =
    transition.state === state &&
    transition.action === undefined &&
    state !== 'completed';
  if (invalid && attempts + 1 >= (step.maxAttempts ?? 3))
    return {
      ...transition,
      invalidAttempts: attempts + 1,
      action: 'human_takeover',
      reply: flow.steps.human.message,
    };
  if (invalid)
    return {
      ...transition,
      invalidAttempts: attempts + 1,
      reply: renderFlowMessage(
        step.invalidMessage || transition.reply || step.message,
        variables,
      ),
    };
  return {
    ...transition,
    invalidAttempts: 0,
    reply: renderFlowMessage(step.message, {
      ...variables,
      talla: transition.selectedSize ?? variables.talla ?? '',
      nombre:
        transition.action === 'collect_name'
          ? (transition.input ?? '')
          : (variables.nombre ?? ''),
    }),
  };
}
