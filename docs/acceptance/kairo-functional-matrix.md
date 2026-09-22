# Matriz funcional KAIRO Operaciones

Fuente: diseño de hardening 2026-09-21 §7–§10 y ROADMAP §9 (donde no contradiga el diseño).

Leyenda de prueba: U = unit · I = integration · E = E2E · L = load · M = manual `[HUMANO]`

Cada fila enlaza **evidencia ejecutable** (archivo de prueba o script). Afirmaciones de “ingeniería completada” sin archivo ejecutable están prohibidas.

| #   | Recorrido                                  | Éxito                            | Error / recuperación                             | Idempotencia             | Pruebas (evidencia)                                                                                                                               |
| --- | ------------------------------------------ | -------------------------------- | ------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Login admin                                | Sesión cookie                    | Credenciales inválidas genéricas; 429 rate limit | N/A                      | E `apps/admin/e2e/catalog.spec.ts`; E rate `end-to-end-sale.spec.ts`; I `admin-http.integration.test.ts`                                          |
| 2   | Catálogo CRUD + foto                       | Referencia activa con foto       | Validación campo                                 | Código único             | I `admin-http*.integration.test.ts`; E `catalog.spec.ts`                                                                                          |
| 3   | Stock por talla                            | Disponible = físico − reservado  | Concurrent write serializado                     | N/A                      | I `catalog-repository.integration.test.ts`; stock race I `critical-idempotency.integration.test.ts`                                               |
| 4   | Import CSV / Treinta preview+commit        | Preview → commit                 | Filas inválidas                                  | SHA preview              | I `catalog-import*.test.ts`; E `catalog.spec.ts`                                                                                                  |
| 5   | Bot: talla → modelos → datos → confirm     | Pedido confirmed + reserva       | Talla inválida / asesora                         | Evento WA id único       | I `whatsapp-sales-flow.integration.test.ts`; E controlado `end-to-end-sale.spec.ts`                                                               |
| 6   | Confirmar pedido (panel)                   | Status confirmed                 | Transición ilegal                                | `idempotency_key` unique | I `orders.integration.test.ts`; concurrent I `critical-idempotency.integration.test.ts`; E `end-to-end-sale.spec.ts`                              |
| 7   | Cancelar / despachar / entregar / devolver | FSM order-state                  | Acción ilegal post-despacho                      | Eventos audit            | U `order-state.test.ts`; I `orders.integration.test.ts`; E `end-to-end-sale.spec.ts`                                                              |
| 8   | Cotizar + seleccionar envío                | Quote selected                   | Sin credenciales 503; quote expirada             | Unique quote version     | I `shipping-quote*.test.ts`; expired I `critical-concurrency.integration.test.ts`; E seed+UI `end-to-end-sale.spec.ts`                            |
| 9   | Guía: pending→created                      | Preenvío + PDF                   | uncertain / failed / outage                      | Unique job por order     | I `shipping-guide-job-repository.integration.test.ts`; uncertain+outage I `critical-concurrency.integration.test.ts`; U `guide-job-state.test.ts` |
| 10  | Entrega PDF WhatsApp                       | Documento enviado                | Fallo descarga → retry, sin nueva guía           | Idempotency key guide    | U `shipping-guide-service.test.ts`; PDF retry I `critical-concurrency.integration.test.ts`; I `whatsapp-sales-flow.integration.test.ts`           |
| 11  | Inbox humano take/return                   | Mode human/bot                   | Cancela outbound bot                             | Claim único              | I `outbound-repository.integration.test.ts`; handoff I `critical-concurrency.integration.test.ts`                                                 |
| 12  | Cierre Treinta                             | CSV generado                     | Reopen con motivo                                | Unique date+version      | I `inventory-closure-service.test.ts`; concurrent I `critical-idempotency.integration.test.ts`; E `operations.spec.ts`                            |
| 13  | Alertas propietaria                        | Persist + mark read/resolve      | Dedup abierta                                    | Unique dedup open        | I `owner-alert-worker.integration.test.ts`                                                                                                        |
| 14  | Novedades 99envíos                         | Sync + respuesta                 | Respuesta incierta bloqueada                     | Dedup sync               | I `shipping-incidents.integration.test.ts`                                                                                                        |
| 15  | Búsqueda global                            | Resultados servidor              | Query corta vacía                                | N/A                      | I `global-search.integration.test.ts`                                                                                                             |
| 16  | Localidades publish                        | Versión publicada                | Preview inválido                                 | SHA import unique        | I `locality-catalog.integration.test.ts`; E `configurable-operations.spec.ts`                                                                     |
| 17  | Integraciones test/activate                | Lifecycle                        | Test fail no activa                              | Revisiones               | I `integration-lifecycle.integration.test.ts`                                                                                                     |
| 18  | Roles owner/operator + capabilities        | Operator denied owner routes     | 401 unauth / 403 operator                        | N/A                      | U `capabilities.test.ts`; I `admin-authorization.integration.test.ts`; E `authorization.spec.ts`                                                  |
| 19  | A11y rutas críticas                        | Sin violaciones serious/critical | —                                                | N/A                      | E `operations.spec.ts` @ 390 / 768 / 1280 / 1440                                                                                                  |
| 20  | Carga webhook + admin reads                | p50/p95/p99 bajo umbral          | Regresión > 3× baseline                          | N/A                      | L `tests/load/*.mjs`; gate `pnpm check:load-baselines`; baselines `docs/release/load-baselines.json`                                              |

## Concurrencia (gate de tres corridas limpias)

Suite: `pnpm test:concurrency` → `critical-idempotency.integration.test.ts` + `critical-concurrency.integration.test.ts`.

Requisito de cierre Task 12: **tres corridas consecutivas exitosas** registradas en `docs/release/_task12-implementer-report.md`.

## Huecos residuales (Fase 5+ / Task 13)

| Hueco                                           | Mitigación                                              |
| ----------------------------------------------- | ------------------------------------------------------- |
| Cancelar pedido con guía `created`              | Requiere revisión humana en portal; no auto-cancel guía |
| Conciliación Treinta no destructiva conflictiva | Cierre genera CSV; ajuste stock es manual               |
| Guía real / WA real                             | Task 13 `[HUMANO]`                                      |
| Aprobación propietaria de matriz                | `[HUMANO]` pendiente                                    |

## Aprobación

| Rol                        | Firma                                                            | Fecha      |
| -------------------------- | ---------------------------------------------------------------- | ---------- |
| Propietaria / responsable  | `[HUMANO]` pendiente                                             |            |
| Ingeniería (automatizable) | Evidencia en suite Task 12 — ver `_task12-implementer-report.md` | 2026-09-22 |
