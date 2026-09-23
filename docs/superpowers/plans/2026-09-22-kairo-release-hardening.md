# Plan de estabilización y lanzamiento de KAIRO

## Estado de ejecución — 22 de septiembre de 2026 (Bogotá)

Este es mi plan de trabajo, no una lista de tareas para Cursor. Las fases 0 a 3 ya fueron implementadas y verificadas localmente en la rama `cursor/kairo-definitive-closeout`. También cerré un defecto P0 descubierto durante la ejecución: un pedido no podía confirmarse sin una cotización de envío válida. La fase 4 tiene la validación documental del contrato de 99envíos y la protección contra repetir un preenvío tras un fallo de PDF; su aceptación real sigue pendiente. La fase 5 tiene verificación local completa, pero todavía no autorización de lanzamiento.

| Fase | Estado | Evidencia / salida |
| --- | --- | --- |
| 0. Línea base y seguridad | Cerrada | Rama, archivos ajenos y base `_test` identificados; prueba de selección manual reprodujo la brecha. |
| 1. Restricción de transportadora por municipio | Cerrada localmente | Filtro de ofertas, selección manual y confirmación protegidos; cotización obligatoria antes de confirmar. |
| 2. Ajustes del dueño | Cerrada localmente | Carga/reintento seguro, regla municipal como copia completa, validaciones y simulador de bot de solo lectura. |
| 3. Cliente y ayuda | Cerrada localmente | Teléfono de WhatsApp reutilizable, notas opcionales, municipio inválido, resumen de importes y ayuda por rol. |
| 4. Contrato y guía 99envíos | Parcial | OpenAPI oficial: `IdServicio=1` para `/preenvio`; PDF 401 no crea otra guía. Falta PDF real TCC y aceptación controlada. |
| 5. Puerta de lanzamiento | Parcial | `pnpm verify:local --keep-database`: 70 contratos, 320 API y 72 admin unitarias; 147 integraciones; 31 E2E aprobadas y una omitida; compilación y presupuesto de bundle correctos. `pnpm check:production-config`, `pnpm security:all` y `git diff --check` aprobaron. Falta evidencia externa. |

### Trabajo restante, en orden de bloqueo

1. **P0 — Seguridad de acceso:** rotar el token de Meta expuesto previamente antes de cualquier prueba con mensajería real. No registrar el nuevo secreto en archivos, consola o chat.
2. **P0 — Conciliación 99envíos:** revisar en el portal *Envíos completos* los intentos anteriores de resultado incierto y resolver si ya existen guías. No reintentar `/preenvio` por un 401/5xx de PDF.
3. **P0 — Aceptación real acotada:** con destinatario y teléfono de prueba dedicados y autorización de un único preenvío potencialmente facturable, ejecutar la CLI de aceptación contra una base `_test` desechable. Validar número, transportadora, estado en portal, PDF descargable y envío único por WhatsApp. Detenerse ante estado incierto.
4. **P1 — PDF TCC:** resolver con la cuenta/proveedor el 401 observado al descargar el PDF. Probar con un PDF real y registrar hash, tamaño y lectura repetida; ningún cambio de adaptador se justifica sin evidencia del contrato.
5. **P1 — Cierre de lanzamiento:** repetir configuración, seguridad y pruebas tras cualquier ajuste de integración; revisar observabilidad, copias de seguridad, restauración y operación de incidentes en el entorno de despliegue. Declarar GO solamente cuando los cuatro puntos anteriores tengan evidencia.

No se declara funcionalidad al 100 % ni lanzamiento mientras los casos externos sigan sin verificar.

La tabla anterior es el registro de estado; las casillas de las secciones siguientes conservan los criterios de aceptación originales y no sustituyen ese registro.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make KAIRO's shipping rules enforceable, make owner configuration safe and understandable, shorten the customer journey, and close the remaining guide and integration verification gaps.

**Architecture:** Keep the existing React admin, Fastify API, PostgreSQL repositories, and WhatsApp sales service. Put shipping eligibility in one domain predicate and enforce it both when quotes are stored and when a draft quote is manually selected. Treat municipal rules as complete snapshots, make that behavior explicit in the UI, and test both owner and customer routes against a disposable test database before any controlled provider acceptance.

**Tech Stack:** Node 24, pnpm 11.19.0, TypeScript, React, Fastify, Drizzle/PostgreSQL, Vitest, Playwright.

## Global Constraints

- Scope is KAIRO only. Do not revive GitHub CI or change unrelated products.
- Preserve the three pre-existing uncommitted files: apps/admin/e2e/configurable-operations.spec.ts, apps/admin/src/components/ui/badge-variants.ts, and apps/admin/src/settings/shipping/PolicyFields.tsx.
- Test first for each behavior change. Run the focused red test, implement, run green, then run broader verification.
- Integration and E2E writes use only a disposable database whose name ends in _test. Never use the preview or production database for test resets.
- Do not retry an uncertain 99envíos pre-shipment. Review Envíos completos in the provider portal before one controlled real guide.
- Never place Meta or 99envíos secrets in the plan, tests, logs, commits, or chat. A previously exposed Meta token must be rotated before live messaging.
- Existing published orders and conversation versions keep their snapshots. A changed shipping policy applies to new quotes; draft orders with older quotes must be quoted again before confirming if the owner needs the new policy immediately.

---

## Phase 0 — Baseline and safety inventory

### Task 0: Record the baseline

**Files:** No production edits. Record results in this plan's execution notes.

- [ ] Confirm branch, dirty files, and test database URL without printing secret values.
- [ ] Run pnpm --filter @camila/api exec vitest run --project unit test/shipping-selection.test.ts test/shipping-policy.test.ts test/shipping-quote-service.test.ts.
- [ ] Record current results and reproduce the manual selection gap from apps/api/test/shipping-quote-repository.integration.test.ts: its first test currently accepts Envia after TCC was recommended.

**Exit:** The original behavior and test baseline are known before edits.

## Phase 1 — Enforce a municipality's carrier restriction

### Task 1: Filter quote offers with a shared eligibility rule

**Files:**
- Modify: apps/api/src/modules/shipping/shipping-selection.ts
- Modify: apps/api/src/modules/shipping/shipping-quote-service.ts
- Test: apps/api/test/shipping-selection.test.ts
- Test: apps/api/test/shipping-quote-service.test.ts

**Interfaces:**
- Produces: isEligibleCarrierQuote(quote: SelectableCarrierQuote, policy: CarrierSelectionPolicy): boolean.
- selectRecommendedCarrier and ShippingQuoteService.createQuotes both consume that predicate.

- [ ] Add a failing test with TCC and cheaper Envia, allowedCarriers: ['tcc'], preferredCarrier: 'tcc', fallbackPolicy: 'block'. Assert that replaceQuotes receives only the TCC offer and it is selected.
- [ ] Add a failing test with only Envia from the provider. Assert preferred_carrier_unavailable and no replaceQuotes call.
- [ ] Run pnpm --filter @camila/api exec vitest run --project unit test/shipping-selection.test.ts test/shipping-quote-service.test.ts. Confirm the first test fails because Envia remains in the offers.
- [ ] Implement isEligibleCarrierQuote using the same allowed, excluded, finite-cost checks already in selectRecommendedCarrier. Use it in the selector and filter offers before replaceQuotes. Keep the provider's full response only for the read-only decision simulator, where rejected alternatives are explained.
- [ ] Run the same focused command and confirm both cases pass.
- [ ] Commit this independently testable behavior after focused verification.

### Task 2: Reject forbidden manual selections in the API

**Files:**
- Modify: apps/api/src/modules/shipping/postgres-shipping-quote-repository.ts
- Test: apps/api/test/shipping-quote-repository.integration.test.ts
- Test: apps/api/test/admin-shipping-http.test.ts

**Interface:** selectQuote(orderId, quoteId, now) keeps its signature and rejects shipping_quote_not_allowed when the quote violates its stored policy snapshot. A quote with no parseable snapshot requires a new quote before manual selection.

- [ ] Add an integration test that stores TCC and Envia with a policy snapshot allowing only TCC, requests Envia by ID, and asserts a domain error plus TCC remaining selected.
- [ ] Add an integration test for a legacy quote with no policy snapshot. Assert that manual selection fails with shipping_quote_requires_requote.
- [ ] Run pnpm --filter @camila/api exec vitest run --project integration test/shipping-quote-repository.integration.test.ts and observe the expected failures.
- [ ] In the repository transaction, parse policySnapshot with ShippingPolicySchema, apply isEligibleCarrierQuote to the requested row, and reject before clearing the previous selection. Do not accept a null or malformed snapshot for a new manual choice.
- [ ] Update the older integration test that intentionally selected Envia to give it an unrestricted, valid snapshot; that test must continue to demonstrate valid manual choice.
- [ ] Run the focused integration test and the admin shipping HTTP test. Confirm forbidden selection cannot change the selected row.
- [ ] Commit the API guard after verification.

### Task 3: Protect confirmation and expose only valid choices

**Files:**
- Modify: apps/api/src/modules/orders/postgres-order-repository.ts
- Modify: apps/admin/src/orders/OrderDetailPage.tsx
- Modify: apps/api/src/cli/e2e-sale-helpers.ts (give its synthetic quote a valid policy snapshot)
- Test: apps/api/test/orders.integration.test.ts
- Test: apps/admin/e2e/end-to-end-sale.spec.ts

- [ ] Add a failing integration case with a selected quote whose policySnapshot forbids its carrier. Confirming must reject before stock reservation or guide job insertion.
- [ ] Run the focused integration test and observe the expected failure.
- [ ] Validate the selected quote against the stored policy snapshot inside the confirmation transaction. Return a specific stale-shipping error that tells the owner to quote again.
- [ ] In the order UI, explain why a rejected or expired quote needs a fresh quotation. Show only selectable quotes returned by the fixed API; retain the shipping simulator as the place to inspect rejected carrier alternatives.
- [ ] Run the focused order test and the sale E2E. Confirm one permitted carrier is selectable and a forbidden carrier cannot create a summary, reservation, or guide task.
- [ ] Commit the confirmation guard.

## Phase 2 — Make owner shipping settings safe and understandable

### Task 4: Never save defaults after a failed load

**Files:**
- Modify: apps/admin/src/settings/ShippingSettingsPage.tsx
- Modify: apps/admin/src/settings/shipping/ShippingOperationsStatus.tsx
- Modify: apps/admin/src/settings/shipping/GeneralShippingPolicy.tsx
- Modify: apps/admin/src/settings/shipping/LocalityExceptions.tsx
- Test: apps/admin/src/settings/ShippingSettingsPage.test.tsx

- [ ] Add a failing UI test where GET /shipping/preferences fails. Assert both save buttons are disabled and a Reintentar carga button is present.
- [ ] Run pnpm --filter @camila/admin exec vitest run src/settings/ShippingSettingsPage.test.tsx and observe the failure.
- [ ] Track loading as loading, ready, or error. Permit saves only in ready; wire Reintentar carga to load. Preserve the last successfully loaded policy during a retry.
- [ ] Verify the UI test passes, including retry success and restored save buttons.
- [ ] Commit the loading guard.

### Task 5: Clarify complete municipal override and prevent contradictions

**Files:**
- Modify: apps/admin/src/settings/ShippingSettingsPage.tsx
- Modify: apps/admin/src/settings/shipping/LocalityExceptions.tsx
- Modify: apps/admin/src/settings/shipping/PolicyFields.tsx
- Modify: apps/admin/src/settings/shipping/policy-utils.ts
- Test: apps/admin/src/settings/ShippingSettingsPage.test.tsx
- Test: apps/admin/e2e/configurable-operations.spec.ts

- [ ] Add a failing UI test proving a new municipal rule begins as a copy of the loaded global policy, and the page says it replaces all fields and will not inherit later global edits.
- [ ] Add a failing UI test for preferred TCC excluded, an empty allowed list, and a secondary carrier excluded. Each must identify the conflicting control and disable save before the POST.
- [ ] Run the focused admin unit tests to verify red.
- [ ] When a new locality is chosen, initialize the municipal draft from the loaded global policy. Keep edits of existing rules based on their saved snapshot. Add a Copiar política general action so the owner can deliberately reset a draft.
- [ ] Reconcile allow/exclude changes immediately where unambiguous; show inline conflicts for preferred and secondary carriers. Use ShippingPolicySchema.safeParse before either save and show its error at the form.
- [ ] Change the summary to state the allowed carriers, blocked fallback, insurance, and package defaults, so a saved rule for solo TCC is visibly distinguishable from a mere preference.
- [ ] Run admin unit tests and the configurable operations E2E. Exercise creation, reload, edit, preview, deactivation, and fallback to global in the disposable database.
- [ ] Commit the municipal UX changes.

### Task 6: Use accurate names and keep the bot simulator read-only

**Files:**
- Modify: apps/admin/src/settings/shipping/PolicyFields.tsx
- Modify: apps/admin/src/settings/BotFlowPage.tsx
- Modify: apps/admin/src/settings/BotFlowSimulatePanel.tsx
- Modify: apps/admin/src/settings/IntegrationsPage.tsx
- Test: apps/admin/src/settings/ShippingSettingsPage.test.tsx
- Test: apps/admin/src/settings/IntegrationsPage.test.tsx
- Test: apps/admin/e2e/configurable-operations.spec.ts

- [ ] Add a failing UI case showing that the Simular tab has no controls that modify the persistent optional steps; those controls belong to Editar and set Cambios sin guardar only there.
- [ ] Run the focused test to verify red.
- [ ] Put persistent optional-step controls in the editor. Keep simulation scenario controls local to the simulation view and submit a temporary definition to /bot-flow/simulate without calling update().
- [ ] Change the customer_choice label to Económico automático while retaining the persisted enum for compatibility. Explain that the owner controls carrier and insurance.
- [ ] Change the integration encryption hint to KAIRO_CONFIG_ENCRYPTION_KEY, matching .env.example and the owner manual.
- [ ] Run focused UI tests and the bot publish/simulate E2E.
- [ ] Commit the copy and simulator behavior.

## Phase 3 — Reduce customer friction without weakening order checks

### Task 7: Shorten the WhatsApp data collection

**Files:**
- Modify: apps/api/src/modules/conversations/conversation-state.ts
- Modify: apps/api/src/modules/conversations/whatsapp-sales-service.ts
- Modify: packages/contracts/src/bot-flow.ts only if message variables need a compatible addition
- Test: apps/api/test/whatsapp-sales-flow.integration.test.ts
- Test: apps/api/test/conversation-state.test.ts

- [ ] Add failing tests for using the WhatsApp sender number as the default recipient phone, allowing a different number when entered, and skipping optional notes without requiring the literal word ninguna.
- [ ] Add a failing test that an unknown municipality returns clear correction choices and never reserves stock or queues a guide.
- [ ] Run focused conversation tests to verify red.
- [ ] Implement the smallest backwards-compatible flow changes. Keep existing text commands valid and preserve pinned published flow versions for open conversations.
- [ ] Ensure the summary states product subtotal, selected carrier, shipping charges, and total before confirmation; a changed destination or expired quote must regenerate the summary.
- [ ] Run focused integration tests for normal purchase, invalid locality, no coverage, timeout, duplicate confirm, handoff, cancellation, and restart.
- [ ] Commit the customer-flow improvement.

### Task 8: Put owner help where the work happens

**Files:**
- Modify: apps/admin/src/more/MorePage.tsx
- Modify: apps/admin/src/settings/ShippingSettingsPage.tsx
- Create: apps/admin/src/help/OwnerHelpPage.tsx
- Modify: apps/admin/src/App.tsx
- Test: apps/admin/src/App.test.tsx

- [ ] Add a failing UI test that an owner can open a help page from Más and from shipping settings; an operator sees only their permitted operational guidance.
- [ ] Run the focused admin test to verify red.
- [ ] Add short in-app guides for publicar municipios, solo una transportadora, cotizar sin guía, pedido a guía, PDF incierto, and taking over a conversation. Keep the technical runbook in docs/how-to/owner-operations.md synchronized with this product copy.
- [ ] Run the test and check the page with keyboard navigation and at 390px/1280px widths.
- [ ] Commit the help path.

## Phase 4 — Verify provider contract and guide delivery

### Task 9: Resolve 99envíos service ID and PDF behavior with evidence

**Files:**
- Inspect: apps/api/src/modules/shipping/99envios-client.ts
- Inspect: apps/api/src/modules/shipping/postgres-shipping-guide-job-repository.ts
- Inspect: docs/integrations/99envios-validation-2026-09-07.md
- Modify only after evidence: the adapter, guide job mapping, tests, and runbook
- Test: apps/api/test/99envios-client.test.ts
- Test: apps/api/test/shipping-guide-worker.test.ts

- [ ] Compare the official current quote/pre-shipment contract with the adapter: quote IdServicio is stored, while preenvio currently sends 1. Record whether 1 is a required fixed product code or the quoted service ID. Use only read-only provider requests.
- [ ] If the provider requires the quoted service ID, first add a failing adapter/worker test carrying 12 from quote through guide job to preenvio; then implement that mapping and run green. If 1 is required, document the provider evidence and add a test expressing that invariant.
- [ ] Add a controlled PDF test with a valid PDF fixture, hash check, and repeat fetch; preserve uncertain status on 401/5xx and never trigger another preenvio as a PDF retry.
- [ ] Run the focused tests, then pnpm verify:local.
- [ ] Commit the verified provider-contract change and runbook.

### Task 10: Controlled live acceptance

**Files:** docs/runbooks/99envios.md and a sanitized acceptance evidence record.

- [ ] Verify in 99envíos Envíos completos that no previous uncertain attempt already created the intended guide; do not use the dashboard counter alone.
- [ ] Obtain a dedicated test recipient, address, telephone, expected carrier, and acknowledgement that exactly one real pre-shipment may be created and may incur provider costs.
- [ ] Run only the controlled acceptance CLI against a checked disposable _test database. Record request ID, selected carrier, guide number, provider status, PDF validity and portal state without recording personal data or secrets.
- [ ] If the provider returns 5xx or uncertain, stop. Resolve by checking the portal; never retry automatically or manually without that check.
- [ ] Use a rotated Meta token and dedicated test number for one inbound and outbound WhatsApp pass; verify webhook idempotency and that one guide PDF is sent once.

## Phase 5 — Final release gate

### Task 11: Prove owner and customer flows together

**Files:**
- Extend: apps/admin/e2e/configurable-operations.spec.ts
- Extend: apps/admin/e2e/end-to-end-sale.spec.ts
- Extend: apps/api/test/whatsapp-sales-flow.integration.test.ts
- Update: docs/how-to/owner-operations.md and a sanitized release evidence record

- [ ] Execute owner cases: load failure/retry, global save/reload, municipality solo TCC, edit/deactivate, no coverage, simulator, bot draft/publish/restore, integration draft/test/activate, catalog, inventory, alerts, and permissions.
- [ ] Execute customer cases: normal sale, changed address, invalid locality, out of stock, blocked carrier, quote expiry, duplicate webhook/confirm, human handoff, cancellation, guide created/uncertain, and PDF failure.
- [ ] Run pnpm verify:local and the release configuration/security checks. Run external provider acceptance only when Task 10 prerequisites are met.
- [ ] Inspect git diff and test output. Mark each feature as verified local, verified live, or awaiting external evidence. Do not claim 100% functionality while any required live case remains unverified.
- [ ] Commit the final docs and test coverage after fresh verification.

## Execution notes

- Branch at planning time: cursor/kairo-definitive-closeout.
- Existing dirty files listed under Global Constraints must be reviewed and preserved.
- The local automated route is evidence for application behavior, not evidence that Meta or 99envíos accepted a live shipment.
