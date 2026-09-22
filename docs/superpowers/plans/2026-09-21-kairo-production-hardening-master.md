# KAIRO Operaciones — plan maestro de estabilización

Fuente rectora: [2026-09-21-kairo-production-hardening-design.md](../specs/2026-09-21-kairo-production-hardening-design.md)

| Fase | Nombre | Plan detallado | Puerta |
| --- | --- | --- | --- |
| 1 | Línea base verde | [phase-1-baseline.md](./2026-09-21-kairo-phase-1-baseline.md) | `pnpm verify` + build + auditoría |
| 2 | Diseño, responsive, a11y | [phase-2-design-a11y.md](./2026-09-21-kairo-phase-2-design-a11y.md) | Axe crítico/serio = 0 en flujos incluidos |
| 3 | Frontend UX operativa | [phase-3-frontend-ux.md](./2026-09-21-kairo-phase-3-frontend-ux.md) | E2E felices + recuperables |
| 4 | Backend modular | Pendiente | API/worker independientes |
| 5 | Negocio endurecido | Pendiente | Matriz funcional + idempotencia |
| 6 | Seguridad y auditoría | Pendiente | MFA, capacidades, retención preparada |
| 7 | Infra y despliegue | Pendiente | Staging reproducible + restore |
| 8 | Integraciones reales | Pendiente | Meta + 99envíos con evidencia `[HUMANO]` |
| 9 | Datos y piloto | Pendiente | Go/no-go sin P0/P1 |
| 10 | Lanzamiento | Pendiente | Estabilización firmada |

Reglas de ejeción: ver sección 13 del diseño rector.
