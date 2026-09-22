import type { IntegrationHealth } from '@camila/contracts';

export const INTEGRATION_LABELS = {
  database: 'Base de datos',
  mediaStorage: 'Archivos y fotografías',
  whatsapp: 'WhatsApp',
  shipping: '99envíos',
  scheduler: 'Scheduler',
} as const;

export type InternalServiceKey = 'database' | 'mediaStorage' | 'scheduler';

export const LIFECYCLE_STEPS = [
  '1. Credenciales',
  '2. Prueba segura',
  '3. Activación',
  '4. Verificación operativa',
] as const;

type Check = IntegrationHealth[keyof IntegrationHealth];

export function internalServiceDiagnostic(
  key: InternalServiceKey,
  check: Check,
): { outcome: string; nextStep: string; actionLabel: string } {
  if (key === 'database') {
    if (check.status === 'up') {
      return {
        outcome: 'PostgreSQL responde y el pool está disponible.',
        nextStep: 'Continúa con WhatsApp o 99envíos si necesitas operar canales.',
        actionLabel: 'Ver detalle del pool',
      };
    }
    if (check.status === 'degraded') {
      return {
        outcome: 'PostgreSQL responde con latencia o conexiones limitadas.',
        nextStep: 'Revisa la conexión a PostgreSQL y el uso del pool en el servidor.',
        actionLabel: 'Revisar salud de base de datos',
      };
    }
    return {
      outcome: 'La base de datos no responde a la comprobación.',
      nextStep: 'Revisa la conexión a PostgreSQL y reinicia la API si el fallo persiste.',
      actionLabel: 'Diagnosticar base de datos',
    };
  }

  if (key === 'mediaStorage') {
    if (check.status === 'up') {
      return {
        outcome: 'El almacenamiento de medios está operativo.',
        nextStep: 'Puedes subir fotografías desde el catálogo.',
        actionLabel: 'Abrir catálogo',
      };
    }
    if (check.status === 'degraded') {
      return {
        outcome: 'El almacenamiento de medios responde con degradación.',
        nextStep: 'Verifica el almacenamiento de medios y el espacio disponible.',
        actionLabel: 'Revisar medios',
      };
    }
    return {
      outcome: 'No se pudo comprobar el almacenamiento de medios.',
      nextStep: 'Verifica el almacenamiento de medios y los permisos del volumen.',
      actionLabel: 'Diagnosticar medios',
    };
  }

  if (check.status === 'up') {
    return {
      outcome: 'El scheduler del worker reporta heartbeat reciente.',
      nextStep: 'No requiere acción. Supervisa alertas si el heartbeat se atrasa.',
      actionLabel: 'Ver estado del worker',
    };
  }
  if (check.status === 'degraded') {
    return {
      outcome: 'El scheduler responde, pero el heartbeat está atrasado.',
      nextStep: 'Revisa el heartbeat del worker y reinicia el proceso si hace falta.',
      actionLabel: 'Revisar scheduler',
    };
  }
  return {
    outcome: 'El scheduler no reporta heartbeat.',
    nextStep: 'Reinicia el worker y confirma que el heartbeat vuelve a registrarse.',
    actionLabel: 'Reiniciar / diagnosticar worker',
  };
}

export function providerLifecycleNextStep(input: {
  configured: boolean;
  tested: boolean;
  active: boolean;
}): string {
  if (!input.configured) {
    return 'guarda las credenciales del canal.';
  }
  if (!input.tested) {
    return 'probar la conexión de forma segura (sin mensajes ni guías).';
  }
  if (!input.active) {
    return 'activar la revisión verificada para operación.';
  }
  return 'confirma la verificación operativa con un pedido o mensaje de prueba controlado.';
}
