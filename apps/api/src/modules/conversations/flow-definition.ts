import { botFlowVariablesForStep } from '@camila/contracts';

export const FLOW_STEP_KEYS = [
  'welcome',
  'size',
  'catalog',
  'reference',
  'name',
  'phone',
  'department',
  'locality',
  'address',
  'notes',
  'quote',
  'summary',
  'confirmation',
  'guide',
  'complete',
  'human',
] as const;
export type FlowStepKey = (typeof FLOW_STEP_KEYS)[number];

export type BotFlowDefinition = Readonly<{
  commands: Readonly<{
    human: string;
    reset: string;
    more: string;
    confirm: string;
    cancel: string;
  }>;
  pageSize: number;
  steps: Record<
    FlowStepKey,
    Readonly<{
      enabled: boolean;
      message: string;
      invalidMessage?: string | undefined;
      maxAttempts?: number | undefined;
    }>
  >;
  optionalSteps: Readonly<{
    notes: boolean;
    showCarrierInSummary: boolean;
    sendGuideToCustomer: boolean;
  }>;
}>;
export type FlowValidationIssue = Readonly<{ code: string; message: string }>;

const requiredSteps: readonly FlowStepKey[] = [
  'welcome',
  'size',
  'catalog',
  'reference',
  'name',
  'phone',
  'department',
  'locality',
  'address',
  'quote',
  'summary',
  'confirmation',
  'complete',
  'human',
];

export function createDefaultBotFlow(): BotFlowDefinition {
  const steps = Object.fromEntries(
    FLOW_STEP_KEYS.map((key) => [
      key,
      {
        enabled: key !== 'guide',
        message: '',
      },
    ]),
  ) as BotFlowDefinition['steps'];
  return {
    commands: {
      human: 'asesora',
      reset: 'reiniciar',
      more: 'más modelos',
      confirm: 'confirmar',
      cancel: 'cancelar',
    },
    pageSize: 6,
    steps: {
      ...steps,
      welcome: {
        enabled: true,
        message: '¡Hola! Soy KAIRO. ¿Qué talla buscas?',
      },
      size: { enabled: true, message: 'Confirma la talla que buscas.' },
      catalog: { enabled: true, message: 'Estos son los modelos disponibles.' },
      reference: {
        enabled: true,
        message: 'Escribe la referencia que te gustó.',
      },
      name: { enabled: true, message: '¿Cuál es tu nombre completo?' },
      phone: { enabled: true, message: 'Comparte tu número de contacto.' },
      department: { enabled: true, message: '¿En qué departamento estás?' },
      locality: { enabled: true, message: '¿En qué ciudad o municipio?' },
      address: { enabled: true, message: 'Escribe la dirección completa.' },
      notes: { enabled: true, message: '¿Alguna indicación de entrega?' },
      quote: { enabled: true, message: 'Estamos calculando tu envío.' },
      summary: { enabled: true, message: 'Revisa el resumen de tu pedido.' },
      confirmation: {
        enabled: true,
        message: 'Responde confirmar para reservar o cancelar.',
      },
      guide: { enabled: true, message: 'Tu guía está lista.' },
      complete: { enabled: true, message: 'Tu pedido quedó confirmado.' },
      human: { enabled: true, message: 'Una asesora continuará contigo.' },
    },
    optionalSteps: {
      notes: true,
      showCarrierInSummary: true,
      sendGuideToCustomer: true,
    },
  };
}

export function validateBotFlow(
  flow: BotFlowDefinition,
): readonly FlowValidationIssue[] {
  const issues: FlowValidationIssue[] = [];
  if (
    !Number.isInteger(flow.pageSize) ||
    flow.pageSize < 1 ||
    flow.pageSize > 10
  )
    issues.push({
      code: 'invalid_page_size',
      message: 'La página debe tener entre 1 y 10 referencias.',
    });
  const commands = Object.values(flow.commands).map((value) =>
    value
      .trim()
      .toLocaleLowerCase('es-CO')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''),
  );
  if (
    commands.some((value) => value === '') ||
    new Set(commands).size !== commands.length
  )
    issues.push({
      code: 'invalid_commands',
      message: 'Los comandos deben ser distintos y no estar vacíos.',
    });
  for (const step of requiredSteps)
    if (!flow.steps[step].enabled)
      issues.push({
        code: 'required_step_disabled',
        message: `El paso ${step} es obligatorio.`,
      });
  for (const step of FLOW_STEP_KEYS)
    if (flow.steps[step].enabled && flow.steps[step].message.trim() === '')
      issues.push({
        code: 'empty_message',
        message: `El mensaje de ${step} no puede estar vacío.`,
      });
  for (const step of FLOW_STEP_KEYS) {
    const definition = flow.steps[step];
    if (
      definition.maxAttempts !== undefined &&
      (!Number.isInteger(definition.maxAttempts) ||
        definition.maxAttempts < 1 ||
        definition.maxAttempts > 10)
    )
      issues.push({
        code: 'invalid_attempts',
        message: `Los intentos de ${step} deben estar entre 1 y 10.`,
      });
    for (const message of [
      definition.message,
      definition.invalidMessage ?? '',
    ]) {
      if (/[{}]/.test(message.replace(/\{\{\s*\w+\s*\}\}/g, '')))
        issues.push({
          code: 'malformed_variable',
          message: `Revisa las llaves de las variables del paso ${step}.`,
        });
      for (const variable of message.matchAll(/\{\{\s*(\w+)\s*\}\}/g))
        if (
          ![
            'talla',
            'referencia',
            'nombre',
            'pedido',
            'total',
            'transportadora',
          ].includes(variable[1]!)
        )
          issues.push({
            code: 'unknown_variable',
            message: `La variable ${variable[1]} no está disponible.`,
          });
        else if (!botFlowVariablesForStep(step).includes(variable[1]!))
          issues.push({
            code: 'unavailable_variable',
            message: `La variable ${variable[1]} todavía no está disponible en ${step}.`,
          });
    }
  }
  return issues;
}
