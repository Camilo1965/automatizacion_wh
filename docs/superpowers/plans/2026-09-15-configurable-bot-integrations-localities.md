# Configurable Bot, Integrations, and Localities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the KAIRO owner safely configure the WhatsApp sales flow, DANE localities, 99envíos routing, and provider credentials entirely from the panel.

**Architecture:** Persist bot flow snapshots, locality catalog snapshots, and integration configurations in PostgreSQL. Fastify validates and executes every configuration through typed services; React renders guided editors, simulations, and activation workflows. Existing conversations pin their initial flow version, and confirmed orders preserve their shipping policy and quote snapshot.

**Tech Stack:** React 19, Vite 8, TanStack Query 5, Fastify 5, PostgreSQL 18, Drizzle ORM, Zod 4, TypeScript 6, Vitest, Playwright, MSW.

## Ejecución y trazabilidad — 16 de septiembre de 2026

Implementación en una sola rama, `codex/configurable-operations`, conforme a la instrucción posterior de la propietaria del proyecto. Se extendieron los módulos existentes para conservar compatibilidad, en lugar de reemplazar repositorios o renumerar migraciones. Los pasos detallados más abajo son el procedimiento original; la siguiente matriz registra el resultado implementado. Los comandos RED propuestos no constituyen evidencia de ejecución histórica.

- [x] 1. Catálogo DANE versionado: vista previa, publicación, restauración, bootstrap y auditoría. Documento oficial preparado como archivo incluido; 1.256 localidades válidas y 17 exclusiones visibles.
- [x] 2. Selector departamento → municipio y API autenticada; código interno, validación compartida y conflictos de versiones.
- [x] 3. Credenciales cifradas AES-256-GCM, borrador versionado, prueba limitada, activación y retiro; clave externa obligatoria en producción.
- [x] 4. Configuración desde el panel de WhatsApp, 99envíos, notificaciones, horarios, origen de cotización, formato PDF y paquetes; adaptadores leen únicamente la versión activa.
- [x] 5. Selección automática por costo total o preferencia municipal, transportadoras permitidas/excluidas, fallback ordenado o bloqueo, seguro estándar/Plus y umbral de valor. Simulador sin crear guía.
- [x] 6. Flujo cerrado con mensajes editables, variables disponibles por paso, comandos, opciones, control optimista y versiones inmutables.
- [x] 7. Editor guiado y simulación de seis escenarios; conversaciones fijan versión. Cotización vencida en ejecución real exige resumen y confirmación nuevos.
- [x] 8. Entrega de PDF con deduplicación, alertas persistentes y notificación mediante plantilla aprobada; novedades 99envíos con trazabilidad y bloqueo ante respuesta incierta.
- [x] 9. Importador legado que solo prepara borradores, guía operativa, verificación autocontenida, pruebas de migración y recorrido controlado hasta cierre de Treinta.

Ver [guía de operación](../../how-to/owner-operations.md). Las pruebas de Meta y 99envíos emplean adaptadores controlados: no crean guías externas ni certifican coexistencia móvil. Activar credenciales reales, disponer de una plantilla aprobada y validar coexistencia son requisitos de la puesta en marcha, no resultados simulados.

## Global Constraints

- The owner is the only administrator in this MVP.
- The interface is Spanish (es-CO), responsive from 390 px, keyboard operable, and hides DANE in normal operation.
- The bot editor is visual and guided; it accepts no executable expressions, JavaScript, SQL, arbitrary graph connections, or untyped variables.
- A conversation retains its flow version until it completes or resets. Publishing never changes an active conversation.
- The customer does not choose carrier or insurance. The default rule selects the valid lowest landed cost: freight + COD + surcharge + internal commission + insurance.
- A missing mandatory carrier blocks automation, creates an alert, and never silently falls back.
- Secrets use AES-256-GCM at rest. KAIRO_CONFIG_ENCRYPTION_KEY stays outside the database and is mandatory in production.
- A 99envíos configuration test can log in but cannot create a pre-shipment. Guide creation remains a distinct, explicit action.
- The provider-enforced values IdTipoEntrega=1, pre-shipment IdServicio=1, AplicaContrapago=true, origenCreacion=1 and carrier country=colombia have no editable control.
- Preserve current reservation, idempotency, uncertain-guide, and PDF protections.
- Each task must finish with focused tests and one commit. The final task runs the complete quality gate.

---

## File Structure

| Path | Purpose |
| --- | --- |
| packages/contracts/src/configuration.ts | Shared Zod contracts for flows, localities, shipping, and integrations. |
| apps/api/drizzle/0019_configurable_operations.sql | Additive schema for versions, encrypted settings, and conversation pinning. |
| apps/api/src/modules/localities/locality-catalog-service.ts | Preview, publish, restore, and search DANE snapshots. |
| apps/api/src/modules/integrations/configuration-crypto.ts | AES-GCM encryption and secret masking. |
| apps/api/src/modules/integrations/integration-configuration-service.ts | Draft, test, activate, and audit provider configuration. |
| apps/api/src/modules/conversations/flow-definition.ts | Fixed step vocabulary and publish validation. |
| apps/api/src/modules/conversations/flow-runtime.ts | Execute a pinned flow version. |
| apps/api/src/modules/shipping/shipping-selection.ts | Automatic deterministic quote selection. |
| apps/admin/src/bot/* | Guided editor, simulator, versions, and message preview. |
| apps/admin/src/settings/* | Locality, shipping, WhatsApp, 99envíos, and audit settings. |
| apps/admin/e2e/configurable-operations.spec.ts | End-to-end owner workflow. |

## Task 1: Build the versioned 99envíos locality catalog

**Files:**
- Create: apps/api/drizzle/0019_configurable_operations.sql
- Create: apps/api/src/modules/localities/99envios-locality-source.ts
- Create: apps/api/src/modules/localities/locality-catalog-service.ts
- Create: apps/api/src/modules/localities/postgres-locality-catalog-repository.ts
- Create: apps/api/test/99envios-locality-source.test.ts
- Create: apps/api/test/locality-catalog.integration.test.ts
- Modify: apps/api/src/database/schema.ts
- Modify: apps/api/src/modules/localities/locality-service.ts
- Modify: apps/api/src/modules/localities/locality-repository.ts
- Modify: apps/api/src/cli/localities-import.ts

**Interfaces:**

~~~ts
export type LocalityKind = 'municipality' | 'population_center';

export type LocalityCatalogRow = Readonly<{
  daneCode: string;
  department: string;
  locality: string;
  kind: LocalityKind;
  sourceLabel: string;
  normalizedDepartment: string;
  normalizedLocality: string;
}>;

export type LocalityCatalogPreview = Readonly<{
  sourceSha256: string;
  valid: readonly LocalityCatalogRow[];
  issues: readonly Readonly<{
    row: number;
    code: 'invalid_dane' | 'duplicate_dane' | 'ambiguous_label' | 'unsupported_country';
    message: string;
  }>[];
}>;
~~~

- [ ] **Step 1: Write the parser RED tests**

Use a minimal copy of the supplied value/label source. Assert that 05001000 / MEDELLIN - ANTIOQUIA becomes Medellín / Antioquia / municipality, 05837001 / CURRULAO - ANTIOQUIA remains a valid population center, and 1000001 / Ciudad de Mexico produces invalid_dane.

~~~ts
expect(parse99EnviosLocalitySource(source).issues).toContainEqual(
  expect.objectContaining({ code: 'invalid_dane', row: 4 }),
);
expect(result.rows).toContainEqual(
  expect.objectContaining({ daneCode: '05001000', department: 'Antioquia' }),
);
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: pnpm --filter @camila/api test:unit -- 99envios-locality-source.test.ts

Expected: FAIL because the parser does not exist.

- [ ] **Step 3: Add the additive schema**

Add locality_catalog_versions and locality_catalog_imports. Extend shipping_localities with catalog version, kind, normalized department, and active state without deleting carrier_code. Treat carrier_code as a migration compatibility alias for the public daneCode. Copy existing localities into version 1 if data exists.

~~~sql
CREATE TABLE locality_catalog_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version integer NOT NULL UNIQUE,
  source_sha256 char(64) NOT NULL,
  source_url text NOT NULL,
  published_by uuid REFERENCES admin_users(id) ON DELETE RESTRICT,
  published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  restored_from_version integer
);
~~~

- [ ] **Step 4: Implement parsing and transactional publication**

Parse source text offline or from a file upload, never by live Google Docs scraping. Preserve eight-digit codes as strings, normalize accents, classify a valid non-municipal destination as population_center, and return issues rather than silently discarding rows. Store a preview; only publish when there are no blocking issues. A publish transaction creates a catalog version and switches active rows atomically.

- [ ] **Step 5: Verify PostgreSQL behavior**

Test preview SHA idempotency, accent-insensitive Medellín search, department counts, invalid publication rejection, and restoring a prior version while an order references an old DANE code.

Run: pnpm --filter @camila/api test:integration -- locality-catalog.integration.test.ts

Expected: PASS.

- [ ] **Step 6: Commit**

~~~bash
git add apps/api/drizzle apps/api/src/database/schema.ts apps/api/src/modules/localities apps/api/test
git commit -m "feat: add versioned 99envios locality catalog"
~~~

## Task 2: Expose locality administration and a department-first picker

**Files:**
- Create: packages/contracts/src/localities.ts
- Create: apps/admin/src/api/locality-catalog-api.ts
- Create: apps/admin/src/settings/LocalitiesSettingsPage.tsx
- Create: apps/admin/src/settings/LocalitiesSettingsPage.test.tsx
- Create: apps/admin/src/components/LocalityPicker.test.tsx
- Modify: packages/contracts/src/index.ts
- Modify: apps/api/src/routes/admin/index.ts
- Modify: apps/admin/src/components/LocalityPicker.tsx
- Modify: apps/admin/src/App.tsx
- Modify: apps/admin/src/components/DesktopSidebar.tsx
- Modify: apps/admin/src/more/MorePage.tsx

**Interfaces:**

~~~ts
export const DepartmentPublicSchema = z.object({
  name: z.string().min(1),
  localityCount: z.number().int().nonnegative(),
}).strict();

export const LocalityPublicSchema = z.object({
  daneCode: z.string().regex(/^\d{8}$/),
  department: z.string().min(1),
  locality: z.string().min(1),
  kind: z.enum(['municipality', 'population_center']),
  label: z.string().min(1),
  active: z.boolean(),
}).strict();
~~~

- [ ] **Step 1: Write failing HTTP and component tests**

Cover GET /api/admin/localities/departments and GET /api/admin/localities?department=Antioquia&query=mede. Verify the picker displays Medellín, Antioquia and never displays 05001000 in normal text.

~~~tsx
expect(await screen.findByText('Medellín, Antioquia')).toBeVisible();
expect(screen.queryByText('05001000')).not.toBeInTheDocument();
~~~

- [ ] **Step 2: Run tests to verify failure**

Run: pnpm --filter @camila/admin test:unit -- LocalityPicker.test.tsx LocalitiesSettingsPage.test.tsx

Expected: FAIL because the catalog routes and page are unavailable.

- [ ] **Step 3: Implement strict API routes**

Register department, search, import preview, publish, version list, restore, and activation routes in the authenticated admin router. Validate responses against contracts. Mutations require Origin and session, return 409 locality_catalog_changed for a stale preview, and never return original source text.

- [ ] **Step 4: Build the settings page and picker**

Create an import drop zone, preview counts, issue table, publish confirmation, version history, and restore action. Change LocalityPicker into two phases: department selection then locality search. Its controlled value is LocalityPublic, so orders and rules store the DANE while UI displays only locality and department.

- [ ] **Step 5: Run focused checks**

~~~bash
pnpm --filter @camila/api test:integration -- admin-localities-http.test.ts
pnpm --filter @camila/admin test:unit -- LocalityPicker.test.tsx LocalitiesSettingsPage.test.tsx
~~~

Expected: PASS including keyboard selection and accessible import status.

- [ ] **Step 6: Commit**

~~~bash
git add packages/contracts apps/api/src/routes/admin apps/api/test apps/admin/src
git commit -m "feat: manage DANE localities from the owner panel"
~~~

## Task 3: Add encrypted, versioned integration configuration

**Files:**
- Create: apps/api/src/modules/integrations/configuration-crypto.ts
- Create: apps/api/src/modules/integrations/integration-configuration.ts
- Create: apps/api/src/modules/integrations/postgres-integration-configuration-repository.ts
- Create: apps/api/src/modules/integrations/integration-configuration-service.ts
- Create: apps/api/test/configuration-crypto.test.ts
- Create: apps/api/test/integration-configuration.integration.test.ts
- Modify: apps/api/src/config.ts
- Modify: apps/api/src/database/schema.ts
- Modify: apps/api/src/routes/admin/index.ts
- Modify: .env.example

**Interfaces:**

~~~ts
export type IntegrationProvider = 'whatsapp' | '99envios';
export type IntegrationConfigurationStatus = 'draft' | 'tested' | 'active' | 'retired';

export interface IntegrationSecretCiphertext {
  readonly cipherText: string;
  readonly iv: string;
  readonly authTag: string;
  readonly keyVersion: number;
}

export interface IntegrationConfigurationService {
  saveDraft(input: {
    provider: IntegrationProvider;
    publicConfig: unknown;
    secrets: Record<string, string>;
    actorId: string;
  }): Promise<{ id: string; version: number }>;
  testDraft(id: string): Promise<{ ok: true; checkedAt: string } | { ok: false; code: string; message: string }>;
  activate(id: string, actorId: string): Promise<void>;
  getPublic(provider: IntegrationProvider): Promise<unknown>;
}
~~~

- [ ] **Step 1: Write crypto RED tests**

Test that sealing the same plaintext twice produces different ciphertext, only the correct key opens it, malformed base64 fails closed, and a masked response contains no recoverable token.

~~~ts
expect(toMaskedSecret('EAANexampletoken')).toEqual({ configured: true, suffix: 'oken' });
expect(JSON.stringify(publicConfig)).not.toContain('EAANexampletoken');
~~~

- [ ] **Step 2: Run the failing test**

Run: pnpm --filter @camila/api test:unit -- configuration-crypto.test.ts

Expected: FAIL because the crypto module is absent.

- [ ] **Step 3: Implement keys, schema, and persistence**

Reject production start without a 32-byte decoded KAIRO_CONFIG_ENCRYPTION_KEY. Use random 12-byte IVs and AES-256-GCM tags. Add integration_config_versions and integration_config_audits. Store public JSON separately from encrypted secret JSON. Activation locks the provider, requires a successful test on the exact version, retires the old version, and writes an append-only audit event.

- [ ] **Step 4: Create public typed configurations**

Use exact schemas for WhatsApp fields (phone number ID, WABA ID, Graph API version, owner alert phone, timezone, service hours) and 99envíos fields (branch code, optional origin DANE, package dimensions, contents, PDF type). Secrets are only access token, app secret, webhook verification token, email, password, integration token, and integration ID.

- [ ] **Step 5: Run persistence tests**

~~~bash
pnpm --filter @camila/api test:unit -- configuration-crypto.test.ts
pnpm --filter @camila/api test:integration -- integration-configuration.integration.test.ts
~~~

Expected: PASS for encryption, masking, stale activation rejection, test-before-activate, and no secrets in public PostgreSQL columns.

- [ ] **Step 6: Commit**

~~~bash
git add .env.example apps/api/src/config.ts apps/api/src/database/schema.ts apps/api/src/modules/integrations apps/api/src/routes/admin apps/api/test
git commit -m "feat: add encrypted integration configuration versions"
~~~

## Task 4: Build provider-compatible WhatsApp and 99envíos settings

**Files:**
- Create: apps/api/src/modules/integrations/99envios-configuration-tester.ts
- Create: apps/api/src/modules/integrations/whatsapp-configuration-tester.ts
- Create: apps/api/test/integration-configuration-http.test.ts
- Create: apps/admin/src/api/integration-configuration-api.ts
- Create: apps/admin/src/settings/IntegrationConfigurationPage.tsx
- Create: apps/admin/src/settings/IntegrationConfigurationPage.test.tsx
- Modify: apps/api/src/modules/shipping/99envios-client.ts
- Modify: apps/api/src/modules/whatsapp/meta-whatsapp-client.ts
- Modify: apps/api/src/server.ts
- Modify: apps/admin/src/settings/WhatsAppSettingsPage.tsx
- Modify: apps/admin/src/settings/IntegrationsPage.tsx
- Modify: apps/admin/src/App.tsx

**Interfaces:**

~~~ts
export interface ProviderConfigurationTester {
  testWhatsApp(input: {
    phoneNumberId: string;
    accessToken: string;
    graphApiVersion: string;
  }): Promise<{ ok: boolean; code?: string; message?: string }>;
  test99Envios(input: {
    email: string;
    password: string;
    integrationToken?: string;
    integrationId?: string;
  }): Promise<{ ok: boolean; code?: string; message?: string }>;
}
~~~

- [ ] **Step 1: Write failing provider tests**

Mock provider requests. Assert 99envíos test calls only POST /login and never /preenvio; WhatsApp test does not send a message; all API results mask secrets.

~~~ts
expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/login'), expect.anything());
expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/preenvio'))).toBe(false);
~~~

- [ ] **Step 2: Run test to verify failure**

Run: pnpm --filter @camila/api test:integration -- integration-configuration-http.test.ts

Expected: FAIL because test routes and testers are absent.

- [ ] **Step 3: Implement documented provider mapping**

Create 99envíos test by POSTing email/password to /api/integration/v1/login. Build live provider clients only from decrypted active configurations. Send optional X-Integration-Token and X-Integration-Id only to documented pre-shipment/PDF operations. Keep quote, pre-shipment, PDF field mapping strict and add response errors for 401, 403, 404, 422, and 429. Use a safe Meta credential lookup for WhatsApp tests; sending a test message is separate.

- [ ] **Step 4: Build owner settings**

Create draft → test → activate interface with active version, last test result, masked values, history, rotation, and context help. Show enforced 99envíos values as plain read-only facts, not selectable inputs. Include configurable branch code, origin DANE, package defaults, content declaration, and PDF 1 sticker / 2 normal.

- [ ] **Step 5: Run tests**

~~~bash
pnpm --filter @camila/api test:integration -- integration-configuration-http.test.ts
pnpm --filter @camila/admin test:unit -- IntegrationConfigurationPage.test.tsx
~~~

Expected: PASS for save, test, activate, failed test keeping the active version, and no guide during tests.

- [ ] **Step 6: Commit**

~~~bash
git add apps/api/src/modules/integrations apps/api/src/modules/shipping apps/api/src/modules/whatsapp apps/api/src/server.ts apps/api/test apps/admin/src
git commit -m "feat: configure provider integrations from KAIRO"
~~~

## Task 5: Replace client shipping selection with owner-controlled automatic routing

**Files:**
- Create: apps/api/test/automatic-shipping-policy.test.ts
- Create: apps/api/test/automatic-shipping-policy.integration.test.ts
- Modify: packages/contracts/src/operations.ts
- Modify: apps/api/src/database/schema.ts
- Modify: apps/api/src/modules/shipping/shipping-policy.ts
- Modify: apps/api/src/modules/shipping/shipping-selection.ts
- Modify: apps/api/src/modules/shipping/shipping-quote-service.ts
- Modify: apps/api/src/modules/shipping/postgres-shipping-quote-repository.ts
- Modify: apps/api/src/modules/conversations/conversation-state.ts
- Modify: apps/api/src/modules/conversations/whatsapp-sales-service.ts
- Modify: apps/api/src/routes/admin/index.ts
- Modify: apps/admin/src/settings/ShippingSettingsPage.tsx
- Modify: apps/admin/src/settings/ShippingSettingsPage.test.tsx

**Interfaces:**

~~~ts
export type ShippingFallback = 'cheapest_allowed' | 'ordered_preferences' | 'block';

export type AutomaticShippingPolicy = Readonly<{
  allowedCarriers: readonly CarrierId[];
  excludedCarriers: readonly CarrierId[];
  preferredCarriers: readonly CarrierId[];
  requiredCarrier: CarrierId | null;
  fallback: ShippingFallback;
  insurance: Readonly<{
    mode: 'none' | 'standard' | 'plus';
    minimumDeclaredValueCop: number | null;
  }>;
  packageDefaults: Readonly<{
    weightKg: number;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
    contents: string;
  }>;
}>;

export type SelectionResult = Readonly<{
  selectedQuoteId: string | null;
  reason: 'lowest_total' | 'required_carrier' | 'preferred_carrier' | 'blocked';
  rejected: readonly Readonly<{ quoteId: string; reason: string }>[];
}>;
~~~

- [ ] **Step 1: Write RED policy tests**

Cover no rule selecting the lowest total, Barranquilla allowing only TCC with Plus, blocked TCC, fallback to ordered preference, insurance threshold, and an excluded carrier never winning.

~~~ts
expect(selectAutomaticQuote(quotes, barranquillaPolicy)).toMatchObject({
  reason: 'required_carrier',
  selectedQuoteId: tccPlus.id,
});
~~~

- [ ] **Step 2: Run focused unit test**

Run: pnpm --filter @camila/api test:unit -- automatic-shipping-policy.test.ts

Expected: FAIL because existing policy cannot express automatic routing.

- [ ] **Step 3: Migrate policy and quote storage**

Extend policy persistence with allowed/excluded/preferred arrays, required carrier, fallback, insurance threshold, package defaults, policy version, and audit snapshots. Convert legacy preference to first preferred carrier with cheapest_allowed fallback. Reject overlap between allowed/excluded, required carrier outside allowed, or blocked fallback without required carrier. Add policy snapshot, selection reason, and rejected alternatives to quote records.

- [ ] **Step 4: Implement automatic quote workflow**

Resolve exact locality policy before global policy. Quote only with the derived insurance mode, retain all provider results, calculate total landed cost, persist the selection and policy snapshot atomically. After delivery notes, create one summary directly. Delete customer-facing awaiting_shipping behavior and the 1/2 reply path. On blocked/no-valid result: create owner alert, set conversation mode to human, and do not create a confirmable summary.

- [ ] **Step 5: Implement policy UI and simulator**

Use LocalityPicker, closed carrier chips, ordered preferences, fallback selector, insurance threshold, package controls, active state, natural language explanation, and simulator. The simulator returns selected/rejected alternatives and does not create a guide.

Run:

~~~bash
pnpm --filter @camila/api test:unit -- automatic-shipping-policy.test.ts
pnpm --filter @camila/api test:integration -- automatic-shipping-policy.integration.test.ts
pnpm --filter @camila/admin test:unit -- ShippingSettingsPage.test.tsx
~~~

- [ ] **Step 6: Commit**

~~~bash
git add packages/contracts apps/api/src/database/schema.ts apps/api/src/modules/shipping apps/api/src/modules/conversations apps/api/src/routes/admin apps/api/test apps/admin/src/settings
git commit -m "feat: automate shipping policy by locality"
~~~

## Task 6: Store and publish guided bot flow versions

**Files:**
- Create: packages/contracts/src/bot-flow.ts
- Create: apps/api/src/modules/conversations/flow-definition.ts
- Create: apps/api/src/modules/conversations/flow-version-service.ts
- Create: apps/api/src/modules/conversations/postgres-flow-version-repository.ts
- Create: apps/api/test/flow-definition.test.ts
- Create: apps/api/test/flow-version.integration.test.ts
- Modify: packages/contracts/src/index.ts
- Modify: apps/api/src/database/schema.ts
- Modify: apps/api/src/routes/admin/index.ts

**Interfaces:**

~~~ts
export type FlowStepKey =
  | 'welcome' | 'size' | 'catalog' | 'reference' | 'name' | 'phone'
  | 'department' | 'locality' | 'address' | 'notes' | 'quote'
  | 'summary' | 'confirmation' | 'guide' | 'complete' | 'human';

export const BotFlowConfigurationSchema = z.object({
  commands: z.object({
    human: z.string().min(1),
    reset: z.string().min(1),
    more: z.string().min(1),
    confirm: z.string().min(1),
    cancel: z.string().min(1),
  }).strict(),
  pageSize: z.number().int().min(1).max(10),
  steps: z.record(z.enum(FlowStepKey), z.object({
    enabled: z.boolean(),
    message: z.string().max(4000),
    invalidMessage: z.string().max(4000).optional(),
    maxAttempts: z.number().int().min(1).max(5).optional(),
  }).strict()),
  optionalSteps: z.object({
    notes: z.boolean(),
    showCarrierInSummary: z.boolean(),
    sendGuideToCustomer: z.boolean(),
  }).strict(),
}).strict();
~~~

- [ ] **Step 1: Write RED version tests**

Assert default flow validates, required summary step cannot be disabled, unknown variables block validation, one draft exists, stale save yields configuration_changed, and restore creates a new version.

- [ ] **Step 2: Run test to verify failure**

Run: pnpm --filter @camila/api test:unit -- flow-definition.test.ts

Expected: FAIL because the definition and version service do not exist.

- [ ] **Step 3: Add flow tables and seed the existing behavior**

Add bot_flows, bot_flow_versions, and bot_flow_audits. Extend whatsapp_conversations with flow_version_id, current_step_key, flow_context, and automation pause fields. Seed published flow Ventas KAIRO with current Spanish messages and commands, then backfill existing conversations to it before runtime activation.

- [ ] **Step 4: Implement publication validation**

Validate closed step vocabulary, every required reachable step, command uniqueness after normalization, allowed variables by step, page bounds, non-empty messages, and reachable human transfer. Publication must lock the flow, archive old published flow, record audit diff, and require optimistic version matching.

- [ ] **Step 5: Add HTTP routes and database tests**

Expose draft, save, validate, simulate, publish, versions, restore, and audit endpoints with session/Origin protection and shared Zod envelopes. Test fresh migration and remigration in PostgreSQL.

- [ ] **Step 6: Commit**

~~~bash
git add packages/contracts apps/api/drizzle apps/api/src/database/schema.ts apps/api/src/modules/conversations apps/api/src/routes/admin apps/api/test
git commit -m "feat: add versioned guided bot flows"
~~~

## Task 7: Execute pinned flows and build the visual editor

**Files:**
- Create: apps/api/src/modules/conversations/flow-runtime.ts
- Create: apps/api/test/flow-runtime.test.ts
- Create: apps/api/test/flow-runtime.integration.test.ts
- Create: apps/admin/src/api/bot-flow-api.ts
- Create: apps/admin/src/bot/BotFlowEditorPage.tsx
- Create: apps/admin/src/bot/BotFlowCanvas.tsx
- Create: apps/admin/src/bot/BotFlowInspector.tsx
- Create: apps/admin/src/bot/BotMessagePreview.tsx
- Create: apps/admin/src/bot/BotFlowSimulator.tsx
- Create: apps/admin/src/bot/BotFlowVersions.tsx
- Create: apps/admin/src/bot/BotFlowEditorPage.test.tsx
- Create: apps/admin/src/bot/BotFlowSimulator.test.tsx
- Modify: apps/api/src/modules/conversations/conversation-state.ts
- Modify: apps/api/src/modules/conversations/postgres-conversation-repository.ts
- Modify: apps/api/src/modules/conversations/whatsapp-sales-service.ts
- Modify: apps/admin/src/App.tsx
- Modify: apps/admin/src/components/DesktopSidebar.tsx
- Modify: apps/admin/src/more/MorePage.tsx
- Modify: apps/admin/src/styles.css

**Interfaces:**

~~~ts
export interface FlowRuntime {
  begin(input: {
    conversationId: string;
    flowVersionId: string;
    text: string;
  }): Promise<FlowTransition>;
  advance(input: {
    conversationId: string;
    text: string;
    context: FlowContext;
  }): Promise<FlowTransition>;
}

export type FlowTransition = Readonly<{
  nextStep: FlowStepKey;
  reply: string | null;
  action:
    | 'show_catalog' | 'create_order' | 'patch_order'
    | 'quote_automatically' | 'create_summary' | 'confirm_order'
    | 'enqueue_guide' | 'take_human_control' | 'reset' | 'none';
  context: FlowContext;
}>;
~~~

- [ ] **Step 1: Write failing runtime/editor tests**

Assert new conversation pins current flow; later publish changes only new conversation greeting; automatic quote bypasses 1/2 selection; blocked carrier moves to human; the editor selects Bienvenida, uses closed variable picker, validates, publishes, restores, and simulates with no provider request.

~~~ts
expect(next.action).toBe('quote_automatically');
expect(next.reply).not.toContain('Responde 1 o 2');
~~~

- [ ] **Step 2: Run focused tests to verify failure**

~~~bash
pnpm --filter @camila/api test:unit -- flow-runtime.test.ts
pnpm --filter @camila/admin test:unit -- BotFlowEditorPage.test.tsx BotFlowSimulator.test.tsx
~~~

Expected: FAIL because runtime and editor are absent.

- [ ] **Step 3: Implement flow runtime**

Move fixed texts and commands out of conversation-state into seeded configuration and runtime. On first inbound message, atomically pin published version. Keep catalog/order/inventory as action ports. Preserve reset and human takeover. Use automatic shipping service after notes; create summary only when it returns an automatically selected quote.

- [ ] **Step 4: Implement responsive editor and simulator**

Desktop: connected fixed step cards, inspector, WhatsApp preview, version history. Mobile: canvas, inspector, preview, simulator, and history as sequential panels retaining draft in sessionStorage. The simulator uses controlled catalog/locality/shipping scenarios: stock found, stock missing, invalid locality, blocked carrier, fallback carrier, quote expired. It cannot call Meta or 99envíos.

- [ ] **Step 5: Verify runtime and UI**

~~~bash
pnpm --filter @camila/api test:unit -- flow-runtime.test.ts whatsapp-sales-service.test.ts conversation-state.test.ts
pnpm --filter @camila/api test:integration -- flow-runtime.integration.test.ts whatsapp-sales-flow.integration.test.ts
pnpm --filter @camila/admin test:unit -- BotFlowEditorPage.test.tsx BotFlowSimulator.test.tsx
pnpm --filter @camila/admin test:e2e -- configurable-operations.spec.ts --grep "flow editor"
~~~

Expected: PASS at 390 px and 1280 px with visible focus and no horizontal overflow.

- [ ] **Step 6: Commit**

~~~bash
git add apps/api/src/modules/conversations apps/api/test apps/admin/src/api apps/admin/src/bot apps/admin/src/App.tsx apps/admin/src/components apps/admin/src/more apps/admin/src/styles.css apps/admin/e2e
git commit -m "feat: add KAIRO guided bot flow editor"
~~~

## Task 8: Send PDF guides as WhatsApp documents and synchronize 99envíos incidents

**Files:**
- Create: apps/api/src/modules/shipping/99envios-incidents-client.ts
- Create: apps/api/src/modules/shipping/shipping-incidents-service.ts
- Create: apps/api/test/99envios-incidents-client.test.ts
- Create: apps/api/test/shipping-incidents.integration.test.ts
- Create: apps/api/test/whatsapp-document-outbox.test.ts
- Create: apps/admin/src/settings/ShippingIncidentsPage.tsx
- Create: apps/admin/src/settings/ShippingIncidentsPage.test.tsx
- Modify: apps/api/src/database/schema.ts
- Modify: apps/api/src/modules/whatsapp/meta-whatsapp-client.ts
- Modify: apps/api/src/modules/whatsapp/outbox-worker.ts
- Modify: apps/api/src/modules/whatsapp/postgres-outbound-repository.ts
- Modify: apps/api/src/modules/shipping/shipping-guide-worker.ts
- Modify: apps/api/src/routes/admin/index.ts
- Modify: apps/admin/src/App.tsx
- Modify: apps/admin/src/orders/OrderDetailPage.tsx

**Interfaces:**

~~~ts
export type OutboundDocument = Readonly<{
  conversationId: string;
  customerPhone: string;
  storageKey: string;
  mimeType: 'application/pdf';
  filename: string;
  caption: string | null;
  idempotencyKey: string;
}>;

export interface ShippingIncidentsService {
  sync(branchCode: string): Promise<{ imported: number; unchanged: number }>;
  respond(input: {
    incidentId: string;
    guideNumber: string;
    response: string;
    notes?: string;
  }): Promise<void>;
}
~~~

- [ ] **Step 1: Write RED document and incident tests**

Assert completed guide queues one document, repeated worker execution cannot queue another, Meta receives document payload with guia-KAIRO-123456.pdf, and GET novedades maps documented fields without sensitive logging.

- [ ] **Step 2: Run tests to verify failure**

Run: pnpm --filter @camila/api test:unit -- whatsapp-document-outbox.test.ts 99envios-incidents-client.test.ts

Expected: FAIL because documents and incident client are absent.

- [ ] **Step 3: Extend WhatsApp outbound messages**

Add document to database constraints, outbound repository, worker, transcript, and Meta client. Derive idempotency key from guide job ID plus PDF SHA-256. Respect the published flow option sendGuideToCustomer; always preserve PDF in the order even when auto-send is disabled.

- [ ] **Step 4: Implement documented incident operations**

Implement GET /api/integration/sucursal/novedades/{codigo_sucursal} and POST /api/integration/sucursal/novedades/{id}. Persist append-only incident snapshots and link to guide/order when number matches. Synchronize only when active 99envíos configuration has branch code. Response requires guide number and owner response; no fabricated tracking states.

- [ ] **Step 5: Verify**

~~~bash
pnpm --filter @camila/api test:unit -- whatsapp-document-outbox.test.ts 99envios-incidents-client.test.ts
pnpm --filter @camila/api test:integration -- shipping-incidents.integration.test.ts
pnpm --filter @camila/admin test:unit -- ShippingIncidentsPage.test.tsx
~~~

Expected: PASS with no duplicate PDF, safe incident retry, and accessible incident actions.

- [ ] **Step 6: Commit**

~~~bash
git add apps/api/src/database/schema.ts apps/api/src/modules/shipping apps/api/src/modules/whatsapp apps/api/src/routes/admin apps/api/test apps/admin/src
git commit -m "feat: deliver guides and sync 99envios incidents"
~~~

## Task 9: Migrate legacy configuration, document operations, and audit end-to-end

**Files:**
- Create: apps/api/src/cli/migrate-legacy-configuration.ts
- Create: apps/api/test/configuration-migration.integration.test.ts
- Create: apps/admin/e2e/configurable-operations.spec.ts
- Create: docs/how-to/configure-bot-and-shipping.md
- Modify: .env.example
- Modify: README.md
- Modify: docs/how-to/pilot-and-deploy.md
- Modify: apps/admin/playwright.config.ts

**Interfaces:**

~~~ts
export type LegacyConfigurationMigrationResult = Readonly<{
  whatsappImported: boolean;
  ninetyNineEnviosImported: boolean;
  defaultFlowVersion: number;
  localityCatalogVersion: number | null;
}>;
~~~

- [ ] **Step 1: Write RED migration and E2E tests**

Migration test creates an environment with legacy .env values, runs twice, and asserts masked encrypted settings, one published flow, no duplicate active integration. E2E logs in, imports localities, creates Barranquilla TCC Plus rule, changes welcome text, validates/publishes, simulates, and executes controlled WhatsApp → order → automatic quote → confirmation → PDF document → incident display.

- [ ] **Step 2: Run tests to verify failure**

~~~bash
pnpm --filter @camila/api test:integration -- configuration-migration.integration.test.ts
pnpm --filter @camila/admin test:e2e -- configurable-operations.spec.ts
~~~

Expected: FAIL because migration CLI, owner guide, and complete route coverage are absent.

- [ ] **Step 3: Implement one-time legacy import**

Only when no active configuration exists, read old environment values, encrypt them into a draft version, write redacted booleans/version output, and require test plus manual activation. The command is idempotent. Do not print a secret, DANE address, or full customer contact.

- [ ] **Step 4: Write the owner runbook**

Document exact procedures to edit/test/activate credentials; import/review locality source; configure a Barranquilla TCC Plus rule; edit/validate/publish the bot; simulate; handle blocked carrier; resolve uncertain guide; resend PDF; synchronize/respond incidents; rotate tokens. State that clients never choose shipping and WhatsApp Business mobile coexistence needs Meta confirmation.

- [ ] **Step 5: Run full quality gate**

~~~bash
pnpm install --frozen-lockfile
docker compose config
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm audit --prod
git diff --check
~~~

Repeat confirmed-order/guide concurrency tests three times. Run Playwright at 390×844, 768×1024, 1280×720, and 1440×900. Expected: all pass, no serious/critical Axe findings, and no duplicate reservation, guide, or PDF message.

- [ ] **Step 6: Commit**

~~~bash
git add .env.example README.md docs apps/api/src/cli apps/api/test apps/admin/e2e apps/admin/playwright.config.ts
git commit -m "docs: complete configurable operations rollout"
~~~

## Plan Self-Review

- Flow editor, templates, versions, simulation, and pinned execution: Tasks 6–7.
- Department/locality UI, DANE validation, source normalization, catalog versioning, and restore: Tasks 1–2.
- Automatic cheapest carrier, locality preferences, insurance, blocked fallback, and no customer selection: Task 5 plus Task 7.
- Official 99envíos login, quote, pre-shipment, PDF, and novedades operations: Tasks 3–5 and 8.
- Encrypted editable credentials, testing, activation, legacy migration, and owner documentation: Tasks 3–4 and 9.
- Customer PDF document delivery, incidents, mobile/desktop E2E, and accessibility: Tasks 7–9.

The plan does not automate Treinta, allow user-supplied executable logic, or create real guides from simulator/credential tests.

