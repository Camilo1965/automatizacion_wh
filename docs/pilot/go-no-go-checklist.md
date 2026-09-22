# Go / no-go — piloto KAIRO

Ambiente: ________ · Fecha propuesta: ________

**Estado Task 13 (2026-09-22):** checklist `verified` (automatable). **Decisión actual: NO-GO.** Toda evidencia real faltante marcada **BLOCKING / `[HUMANO]`**. Ingeniería no inventa firmas ni GO.

## Criterios técnicos

| Criterio                                     | Estado                                      | Tipo |
| -------------------------------------------- | ------------------------------------------- | ---- |
| `pnpm verify` / CI verde en commit de release | `verified` automatable (Tasks 1–12 en repo) | auto |
| Migraciones aplicadas (`0030`–`0034`+)       | `verified` en código/CI; **prod apply** `[HUMANO]` | mixed |
| Backup externo ensayado (restore drill)      | auto staging OK; **destino prod** **BLOCKING** `[HUMANO]` | BLOCKING |
| API + worker independientes en staging       | `verified` (`production:smoke`)             | auto |
| Alertas recibidas fuera del servidor         | **BLOCKING** `[HUMANO]` — webhook no suministrado | BLOCKING |
| Cero P0/P1 abiertos                          | **BLOCKING** — ver P0–P3 closeout           | BLOCKING |
| Matriz funcional filas 1–17 revisadas        | evidencia auto OK; **firma owner** **BLOCKING** `[HUMANO]` | BLOCKING |
| HTTPS productivo (dominio/DNS/TLS)           | **BLOCKING** `[HUMANO]`                     | BLOCKING |
| Object storage S3 prod (no MinIO compose)    | **BLOCKING** `[HUMANO]`                     | BLOCKING |
| Meta evidencia real (verify/inbound/outbound)| **BLOCKING** `[HUMANO]`                     | BLOCKING |
| 99envíos evidencia real (quote + 1 guía + PDF)| **BLOCKING** `[HUMANO]`                    | BLOCKING |

## Criterios de negocio `[HUMANO]`

| Criterio                                    | Estado                         | Firma |
| ------------------------------------------- | ------------------------------ | ----- |
| Catálogo/stock conciliados                  | **BLOCKING** `[HUMANO]`        |       |
| Localidades publicadas correctas            | **BLOCKING** `[HUMANO]`        |       |
| Meta + 99envíos evidencia Fase 8 / Task 13  | **BLOCKING** `[HUMANO]`        |       |
| Operadoras capacitadas (training checklist) | **BLOCKING** `[HUMANO]`        |       |
| Duración piloto y presupuesto aceptados     | **BLOCKING** `[HUMANO]`        |       |
| Retención legal / RPO / RTO aprobados       | **BLOCKING** `[HUMANO]`        |       |
| Go / no-go                                  | **NO-GO** (sin firmas)         |       |

## Regla

**Go** requiere **todas** las filas OK + firmas reales. Cualquier fila **BLOCKING** = **NO-GO**.

## `[HUMANO]` — paquete mínimo antes de reconsiderar GO

Ver lista consolidada en `docs/release/definitive-closeout-evidence.md` § Task 13.
