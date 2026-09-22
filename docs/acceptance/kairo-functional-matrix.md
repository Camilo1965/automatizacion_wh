# Matriz funcional KAIRO Operaciones

Fuente: diseño de hardening 2026-09-21 §7–§10 y ROADMAP §9 (donde no contradiga el diseño).

Leyenda de prueba: U = unit · I = integration · E = E2E · M = manual `[HUMANO]`

| #   | Recorrido                                  | Éxito                           | Error / recuperación                    | Idempotencia             | Pruebas                        |
| --- | ------------------------------------------ | ------------------------------- | --------------------------------------- | ------------------------ | ------------------------------ |
| 1   | Login admin                                | Sesión cookie                   | Credenciales inválidas genéricas        | N/A                      | E `catalog.spec` login         |
| 2   | Catálogo CRUD + foto                       | Referencia activa con foto      | Validación campo                        | Código único             | I admin-http, E catalog        |
| 3   | Stock por talla                            | Disponible = físico − reservado | Concurrent write serializado            | N/A                      | I catalog-repository           |
| 4   | Import CSV / Treinta preview+commit        | Preview → commit                | Filas inválidas                         | SHA preview              | I catalog-import, E import     |
| 5   | Bot: talla → modelos → datos → confirm     | Pedido confirmed + reserva      | Talla inválida / asesora                | Evento WA id único       | I whatsapp-sales-flow          |
| 6   | Confirmar pedido (panel)                   | Status confirmed                | Transición ilegal                       | `idempotency_key` unique | I orders, U order-state        |
| 7   | Cancelar / despachar / entregar / devolver | FSM order-state                 | Acción ilegal                           | Eventos audit            | U+I orders                     |
| 8   | Cotizar + seleccionar envío                | Quote selected                  | Sin credenciales 503                    | Unique quote version     | I shipping-quote               |
| 9   | Guía: pending→created                      | Preenvío + PDF                  | uncertain / failed                      | Unique job por order     | I guide-job, U guide-job-state |
| 10  | Entrega PDF WhatsApp                       | Documento enviado               | Fallo descarga → alerta, sin nueva guía | Idempotency key guide    | U guide-delivery               |
| 11  | Inbox humano take/return                   | Mode human/bot                  | Cancela outbound bot                    | Claim único              | I outbound, conversations      |
| 12  | Cierre Treinta                             | CSV generado                    | Reopen con motivo                       | Unique date+version      | I inventory-closure, E ops     |
| 13  | Alertas propietaria                        | Persist + mark read/resolve     | Dedup abierta                           | Unique dedup open        | I owner-alert                  |
| 14  | Novedades 99envíos                         | Sync + respuesta                | Respuesta incierta bloqueada            | Dedup sync               | I shipping-incidents           |
| 15  | Búsqueda global                            | Resultados servidor             | Query corta vacía                       | N/A                      | I global-search                |
| 16  | Localidades publish                        | Versión publicada               | Preview inválido                        | SHA import unique        | I locality-catalog             |
| 17  | Integraciones test/activate                | Lifecycle                       | Test fail no activa                     | Revisiones               | I integration-lifecycle        |
| 18  | Roles owner/operator + capabilities        | Operator denied owner routes    | 401 unauth / 403 operator               | N/A                      | U capabilities, I admin-authorization, E authorization |

## Huecos residuales (Fase 5+)

| Hueco                                           | Mitigación                                              |
| ----------------------------------------------- | ------------------------------------------------------- |
| Cancelar pedido con guía `created`              | Requiere revisión humana en portal; no auto-cancel guía |
| Conciliación Treinta no destructiva conflictiva | Cierre genera CSV; ajuste stock es manual               |
| Guía real / WA real                             | Fase 8 `[HUMANO]`                                       |

## Aprobación

| Rol                        | Firma                        | Fecha      |
| -------------------------- | ---------------------------- | ---------- |
| Propietaria / responsable  | `[HUMANO]` pendiente         |            |
| Ingeniería (automatizable) | Completada con `pnpm verify` | 2026-09-21 |
