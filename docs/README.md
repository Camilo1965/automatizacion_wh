# Documentación — Camila

Índice organizado con [Diátaxis](https://diataxis.fr/): tutoriales, guías prácticas (how-to), explicación y referencia.

## Tutoriales

Aprende haciendo, de cero a un entorno local útil.

| Documento | Audiencia |
| --- | --- |
| [Inicio local](./getting-started.md) | Ingeniería / operaciones técnicas |

## How-to

Resuelve una tarea concreta.

| Documento | Cuándo usarlo |
| --- | --- |
| [Piloto y despliegue](./how-to/pilot-and-deploy.md) | Preparar piloto, túnel HTTPS, checklist operativa |
| Importar catálogo CSV | Panel → **Importar catálogo** (plantilla en UI; ver README raíz) |
| Importar localidades | `pnpm --filter @camila/api localities:import -- --input <csv>` |

## Explanation

Entiende el porqué y el diseño.

| Documento | Contenido |
| --- | --- |
| [Arquitectura](./architecture.md) | Límites, módulos, flujo de pedido y envío |
| [ROADMAP](../ROADMAP.md) | Dirección de producto (raíz del repo) |

## Reference

Hechos y contratos concretos.

| Documento | Contenido |
| --- | --- |
| [`.env.example`](../.env.example) | Variables de entorno |
| [Validación 99envíos](./integrations/99envios-validation-2026-09-07.md) | Evidencia de aceptación del adaptador |
| Scripts root | `package.json` en la raíz del monorepo |

## Historial técnico

Cierres de fase (contexto histórico; no sustituyen la docs vigente).

| Documento | Fecha |
| --- | --- |
| [Fase 2](./history/phase-2-closeout.md) | 2026-09-06 |
| [Fase 5](./history/phase-5-closeout.md) | 2026-09-07 |

## Specs y planes internos

Material de diseño en `docs/superpowers/` (`specs/`, `plans/`). Útil para trazabilidad; no es la puerta de entrada para onboarding.
