# Periodo de estabilización

**Estado Task 13 (2026-09-22):** plantilla `verified` (automatable). **Periodo no iniciado.** Duración, fechas y filas diarias = **`[HUMANO]` / BLOCKING** hasta después de cutover GO.

Duración acordada `[HUMANO]`: ___ días desde ____. (**BLOCKING** — owner debe fijar duración antes de lanzamiento.)

## Revisión diaria

| Día | Jobs stuck | Guías uncertain | Alertas críticas | Backup age | Notas |
| --- | ---------- | --------------- | ---------------- | ---------- | ----- |
| 1   | **BLOCKING** — no iniciado | | | | |
| 2   | **BLOCKING** — no iniciado | | | | |
| 3   | **BLOCKING** — no iniciado | | | | |
| …   | extender según duración acordada | | | | |

## Automatizable

- Esta plantilla + métricas/alertas en código (Task 10)
- Queries/health endpoints para rellenar filas cuando prod exista

## `[HUMANO]` — acciones exactas

1. Acordar duración (p. ej. 7–14 días) + responsables diarios.
2. Cada día: rellenar jobs stuck, uncertain guides, alertas críticas, edad backup; adjuntar correlation IDs sanitizados.
3. Cualquier P0/P1 → abrir incidente (`docs/runbooks/incident-response.md`); **no** firmar aceptación hasta cerrado.
4. Al final: resumen → `acceptance-signoff.md`.

P0/P1 deben cerrarse antes de firma de aceptación. **Hoy: estabilización N/A → NO-GO aceptación.**
