# Premium Admin Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a polished mobile-first operating panel where one owner can answer the connected WhatsApp Business number, manage catalog and inventory, operate orders and shipping, and reconcile Treinta without technical workflows.

**Architecture:** Keep the React/Vite, Fastify, PostgreSQL, Drizzle, and shared-Zod-contract monorepo. Add focused domain services for manual WhatsApp messaging, coexistence capabilities, catalog drafts, spreadsheet imports, provider-owned carrier metadata, alerts, and daily closures. The admin UI consumes only versioned shared contracts and uses one reusable responsive component system.

**Tech Stack:** Node.js 24.14.1, pnpm 11.19.0, TypeScript 6, React 19, Vite 8, React Router 7, TanStack Query 5, Fastify 5, PostgreSQL, Drizzle ORM, Zod 4, Vitest 5, Playwright 1.58, ExcelJS 4.4.

## Global Constraints

- The application serves one authenticated owner; no roles or multi-agent assignment are introduced.
- The production sales number uses WhatsApp Business App. Mobile and API operation requires confirmed official coexistence capability.
- The UI must report `cloud_api_only` until Meta capability evidence confirms `business_app_coexistence`.
- Free-form WhatsApp messages are allowed only inside the customer-service window; outside it the panel offers approved templates.
- The bot must pause atomically before a panel or supported mobile-origin response can coexist with automation.
- Catalog availability remains `physicalQuantity - reservedQuantity` per reference and whole/half shoe size.
- One main JPEG or PNG photo, maximum 5 MiB, is required before a reference can activate.
- Treinta remains a manual XLSX/CSV boundary; no browser automation or unofficial API is permitted.
- 99envíos carrier choices are Interrapidísimo, TCC, Servientrega, Coordinadora, and Envia.
- 99envíos quotation calls must respect the documented limit of 300 requests per hour and reuse unexpired equivalent quotes.
- Every external-effect command is idempotent; uncertain message or guide outcomes are reconciled before retry.
- Every admin mutation requires an authenticated session, exact configured Origin, validation, and audit metadata.
- Every screen must be fully operable at 390 px and 1280 px, with WCAG 2.2 AA contrast, keyboard focus, reduced motion, and 44 px touch targets.
- Existing migration history from `0000` through `0015` remains immutable; all changes use new migrations.
- Tests use controlled Meta and 99envíos adapters. Real messages or guides are only used in an explicit controlled acceptance run.

---

## Delivery map

| Block | Tasks | Independently reviewable outcome |
| --- | --- | --- |
| A | 1–2 | Premium responsive shell and operational dashboard |
| B | 3–6 | Real panel inbox plus coexistence-aware WhatsApp control |
| C | 7–9 | Complete catalog creation and guided Treinta import |
| D | 10–12 | Closed carrier catalog, municipality policies, and quote simulator |
| E | 13–15 | Premium orders, alerts, closures, integration health, and release audit |

Each task ends with a targeted test gate and commit. A block closes only after the full repository gate passes.

---

### Task 1: Establish the responsive design system

**Files:**
- Create: `apps/admin/src/design/tokens.css`
- Create: `apps/admin/src/design/icons.tsx`
- Create: `apps/admin/src/components/Button.tsx`
- Create: `apps/admin/src/components/FormField.tsx`
- Create: `apps/admin/src/components/SearchCombobox.tsx`
- Create: `apps/admin/src/components/FileDropzone.tsx`
- Create: `apps/admin/src/components/StatusBadge.tsx`
- Create: `apps/admin/src/components/ToastProvider.tsx`
- Create: `apps/admin/src/components/EmptyState.tsx`
- Create: `apps/admin/src/components/Skeleton.tsx`
- Create: `apps/admin/src/components/PageHeader.tsx`
- Create: `apps/admin/src/components/ResponsiveDataList.tsx`
- Create: `apps/admin/src/components/MobileActionBar.tsx`
- Test: `apps/admin/src/components/design-system.test.tsx`
- Modify: `apps/admin/src/main.tsx`
- Modify: `apps/admin/src/styles.css`

**Interfaces:**
- Produces: `Button`, `FormField`, `SearchCombobox<T>`, `FileDropzone`, `StatusBadge`, `useToast()`, `EmptyState`, `Skeleton`, `PageHeader`, `ResponsiveDataList<T>`, and `MobileActionBar`.
- Consumes: existing React 19 and CSS; no remote fonts or icon package.

- [ ] **Step 1: Write component accessibility tests**

```tsx
it('operates SearchCombobox by keyboard and announces the selected option', async () => {
  const user = userEvent.setup();
  render(<SearchCombobox label="Municipio" options={[{ id: '05001000', label: 'Medellín, Antioquia' }]} onChange={onChange} />);
  await user.click(screen.getByRole('combobox', { name: 'Municipio' }));
  await user.keyboard('{ArrowDown}{Enter}');
  expect(onChange).toHaveBeenCalledWith('05001000');
});

it('exposes a 44px minimum target for primary actions', () => {
  render(<Button>Guardar</Button>);
  expect(screen.getByRole('button', { name: 'Guardar' })).toHaveClass('control-target');
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm --filter @camila/admin test:unit -- src/components/design-system.test.tsx`  
Expected: FAIL because the design components do not exist.

- [ ] **Step 3: Implement tokens and focused components**

Define CSS custom properties for the approved cream, white, dark-brown, deep-green, terracotta, semantic colors, spacing, radii, elevation, focus ring, and breakpoints. Build semantic native controls; `SearchCombobox` uses `role="combobox"`, a labelled listbox, keyboard selection, escape handling, and no dependency on free-text submission.

- [ ] **Step 4: Integrate global providers and remove duplicated primitive styles**

Import `tokens.css` from `main.tsx`, wrap the authenticated app in `ToastProvider`, and migrate existing generic button/card/error/loading styles to the new primitives without changing route behavior.

- [ ] **Step 5: Run component and regression tests**

Run: `pnpm --filter @camila/admin test:unit`  
Expected: all admin unit tests pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/admin/src/design apps/admin/src/components apps/admin/src/main.tsx apps/admin/src/styles.css
git commit -m "feat: add premium responsive design system"
```

---

### Task 2: Rebuild navigation and operational dashboard

**Files:**
- Create: `packages/contracts/src/dashboard.ts`
- Create: `apps/api/src/modules/dashboard/dashboard-service.ts`
- Create: `apps/api/src/modules/dashboard/postgres-dashboard-repository.ts`
- Create: `apps/api/src/routes/admin/dashboard.ts`
- Create: `apps/admin/src/api/dashboard-api.ts`
- Create: `apps/admin/src/components/DesktopSidebar.tsx`
- Create: `apps/admin/src/components/MobileNavigation.tsx`
- Create: `apps/admin/src/components/GlobalHeader.tsx`
- Test: `apps/api/test/dashboard-service.test.ts`
- Test: `apps/api/test/admin-dashboard.integration.test.ts`
- Test: `apps/admin/src/dashboard/DashboardPage.test.tsx`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/routes/admin/index.ts`
- Modify: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/components/AppShell.tsx`
- Modify: `apps/admin/src/dashboard/DashboardPage.tsx`

**Interfaces:**
- Produces: `DashboardSummarySchema`, `DashboardRepository.getSummary(now)`, `GET /api/admin/dashboard`, sidebar badge counts, and filtered dashboard links.
- Consumes: order, conversation, guide-job, inventory, and alert tables; Task 1 components.

- [ ] **Step 1: Define the shared response contract and failing contract tests**

```ts
export const DashboardSummarySchema = z.object({
  queues: z.object({ conversations: z.number().int().nonnegative(), guideIncidents: z.number().int().nonnegative(), readyToDispatch: z.number().int().nonnegative(), awaitingConfirmation: z.number().int().nonnegative(), closurePending: z.boolean(), lowStockReferences: z.number().int().nonnegative(), integrationFailures: z.number().int().nonnegative() }).strict(),
  today: z.object({ newConversations: z.number().int().nonnegative(), confirmedOrders: z.number().int().nonnegative(), dispatchedOrders: z.number().int().nonnegative(), codValueCop: z.number().int().nonnegative(), guidesCreated: z.number().int().nonnegative(), reservedUnits: z.number().int().nonnegative(), averageFirstResponseSeconds: z.number().int().nonnegative().nullable() }).strict(),
  generatedAt: z.iso.datetime(),
}).strict();
```

- [ ] **Step 2: Verify contract RED, then implement the PostgreSQL aggregate**

Run: `pnpm --filter @camila/contracts test:unit`  
Expected before implementation: missing export. Implement one repository query transaction using `America/Bogota` day boundaries passed in by the service.

- [ ] **Step 3: Add authenticated dashboard HTTP tests**

Test 401 without session, exact `{data}` envelope, real seeded counts, zero-data behavior, and stable generated timestamp.

- [ ] **Step 4: Rebuild the shell**

Desktop sidebar groups operational and settings routes. Mobile bottom navigation exposes Inicio, Conversaciones, Pedidos, Catálogo, and Más. Global header displays connection status and global search entry. Every current route remains reachable.

- [ ] **Step 5: Rebuild dashboard cards and responsive tests**

Assert that “Conversaciones por atender” links to `/conversations?attention=true`, “Listos para despachar” to `/orders?view=ready_to_dispatch`, and empty metrics still render meaningful zero states.

- [ ] **Step 6: Run block A gate and commit**

Run: `pnpm test:unit && pnpm test:integration && pnpm test:e2e && pnpm build`  
Expected: all suites pass.

```powershell
git add packages/contracts apps/api/src/modules/dashboard apps/api/src/routes/admin apps/api/test apps/admin/src
git commit -m "feat: add operational navigation and dashboard"
```

---

### Task 3: Persist a unified WhatsApp transcript

**Files:**
- Create: `apps/api/drizzle/0016_whatsapp_transcript.sql` through `pnpm db:generate`
- Modify: `apps/api/src/database/schema.ts`
- Create: `packages/contracts/src/conversations.ts`
- Create: `apps/api/src/modules/conversations/conversation-transcript-repository.ts`
- Create: `apps/api/src/modules/conversations/postgres-conversation-transcript-repository.ts`
- Test: `packages/contracts/test/conversation-contracts.test.ts`
- Test: `apps/api/test/conversation-transcript-repository.integration.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/modules/whatsapp/postgres-whatsapp-inbound-repository.ts`
- Modify: `apps/api/src/modules/whatsapp/postgres-whatsapp-outbox-repository.ts`

**Interfaces:**
- Produces: `ConversationMessagePublicSchema`, `ConversationPageSchema`, `ConversationMessagesPageSchema`, and `ConversationTranscriptRepository`.
- Consumes: inbound webhook and outbound outbox persistence.

- [ ] **Step 1: Write strict contracts**

```ts
export const ConversationMessageSourceSchema = z.enum(['customer', 'bot', 'owner_panel', 'owner_mobile']);
export const ConversationMessageStatusSchema = z.enum(['received', 'queued', 'sent', 'delivered', 'read', 'failed', 'cancelled']);
export const ConversationMessagePublicSchema = z.object({
  id: z.uuid(), conversationId: z.uuid(), source: ConversationMessageSourceSchema,
  messageType: z.enum(['text', 'image', 'template', 'event']), text: z.string().nullable(),
  mediaUrl: z.string().nullable(), status: ConversationMessageStatusSchema,
  providerMessageId: z.string().nullable(), occurredAt: z.iso.datetime(),
}).strict();
```

Also define cursor-paginated conversation summaries with customer name, phone, last preview, unread count, operational label, control owner, active order, and timestamps.

- [ ] **Step 2: Add normalized transcript tables**

Add `whatsapp_conversation_messages` with unique provider-message id, source, message type, text/media metadata, status, occurred timestamps, and indexes on `(conversation_id, occurred_at, id)`. Add `last_read_at` and explicit control mode values to conversations. Generate migration `0016`; do not hand-edit prior migrations.

- [ ] **Step 3: Prove idempotent ingestion**

Integration tests insert the same inbound provider message twice and assert one transcript row, then update outbound status `sent → delivered → read` without duplicate records.

- [ ] **Step 4: Connect existing webhook and outbox persistence**

Inbound text becomes source `customer`; automated outbox becomes source `bot`. Existing order-flow behavior remains unchanged.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @camila/contracts test:unit && pnpm --filter @camila/api test:unit && pnpm test:integration`.

```powershell
git add packages/contracts apps/api/drizzle apps/api/src/database apps/api/src/modules/conversations apps/api/src/modules/whatsapp apps/api/test
git commit -m "feat: persist unified whatsapp transcripts"
```

---

### Task 4: Add atomic human takeover and manual messaging

**Files:**
- Create: `apps/api/src/modules/conversations/conversation-control-service.ts`
- Create: `apps/api/src/modules/conversations/manual-message-service.ts`
- Create: `apps/api/src/modules/conversations/service-window.ts`
- Create: `apps/api/src/modules/whatsapp/whatsapp-template-repository.ts`
- Create: `apps/api/src/routes/admin/conversations.ts`
- Test: `apps/api/test/conversation-control-service.test.ts`
- Test: `apps/api/test/manual-message-service.test.ts`
- Test: `apps/api/test/admin-conversations.integration.test.ts`
- Modify: `apps/api/src/modules/conversations/postgres-conversation-admin-repository.ts`
- Modify: `apps/api/src/routes/admin/index.ts`
- Modify: `apps/api/src/server.ts`

**Interfaces:**
- Produces: `ConversationControlService.takeControl()`, `.releaseControl()`, `ManualMessageService.send()`, `ServiceWindow.evaluate()`, transcript endpoints, and manual-message endpoint.
- Consumes: Task 3 transcript repository, existing Meta outbox, authenticated admin session.

- [ ] **Step 1: Test atomic takeover**

```ts
it('pauses the bot and cancels queued bot messages in one transaction', async () => {
  await service.takeControl({ conversationId, actorUserId });
  expect(await repository.controlMode(conversationId)).toBe('human_panel');
  expect(await repository.pendingBotMessages(conversationId)).toHaveLength(0);
});
```

Include races between inbound automation and takeover; only the winner may enqueue output after row-level conversation locking.

- [ ] **Step 2: Test service-window enforcement and idempotency**

`ManualMessageService.send({conversationId, actorUserId, clientRequestId, content})` rejects free text outside the window with `template_required`, accepts an approved template, and returns the prior result for repeated `clientRequestId`.

- [ ] **Step 3: Implement the services and endpoints**

```text
GET  /api/admin/conversations
GET  /api/admin/conversations/:conversationId
GET  /api/admin/conversations/:conversationId/messages
POST /api/admin/conversations/:conversationId/messages
POST /api/admin/conversations/:conversationId/take-control
POST /api/admin/conversations/:conversationId/release-control
POST /api/admin/conversations/:conversationId/read
POST /api/admin/conversations/:conversationId/close
```

Image messages reuse the validated 5 MiB JPEG/PNG upload boundary. `release-control` requires a `resumeState` from the finite conversation-state enum.

- [ ] **Step 4: Add HTTP security and malformed-response tests**

Cover 401, wrong Origin 403, invalid UUID 400, missing conversation 404, template-required 409, duplicate client request, and multipart content errors.

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @camila/api test:unit && pnpm test:integration`.

```powershell
git add apps/api/src/modules/conversations apps/api/src/modules/whatsapp apps/api/src/routes/admin apps/api/src/server.ts apps/api/test
git commit -m "feat: add human whatsapp conversation control"
```

---

### Task 5: Build the real conversation inbox

**Files:**
- Create: `apps/admin/src/conversations/ConversationInboxPage.tsx`
- Create: `apps/admin/src/conversations/ConversationList.tsx`
- Create: `apps/admin/src/conversations/ConversationTimeline.tsx`
- Create: `apps/admin/src/conversations/MessageComposer.tsx`
- Create: `apps/admin/src/conversations/ConversationContextPanel.tsx`
- Create: `apps/admin/src/conversations/QuickReplies.tsx`
- Create: `apps/admin/src/conversations/useConversationStream.ts`
- Test: `apps/admin/src/conversations/ConversationInboxPage.test.tsx`
- Test: `apps/admin/src/conversations/MessageComposer.test.tsx`
- Modify: `apps/admin/src/api/conversations-api.ts`
- Modify: `apps/admin/src/App.tsx`
- Remove after replacement: `apps/admin/src/conversations/ConversationsListPage.tsx`

**Interfaces:**
- Produces: responsive inbox, filters, timeline, composer, take-control/resume interactions, and order context.
- Consumes: Tasks 1, 3, and 4 APIs. `useConversationStream` starts with 5-second refetch and exposes a future transport boundary without adding WebSocket infrastructure now.

- [ ] **Step 1: Add MSW contract fixtures and failing page tests**

Assert list priority, unread badge, source-specific bubbles, event separators, delivery status, take-control flow, mobile layout landmarks, draft preservation, and order link.

- [ ] **Step 2: Add composer behavior tests**

Inside the window, text and image are enabled only in `human_panel`. Outside the window, free text is disabled and approved templates appear. A failed send remains visible with a retry action that reuses the original idempotency key.

- [ ] **Step 3: Implement the three-region desktop and routed mobile layout**

Conversation selection uses `/conversations/:conversationId`; mobile back returns to the preserved list/filter state. Do not use a horizontally compressed desktop table on mobile.

- [ ] **Step 4: Add safe polling and read acknowledgement**

Invalidate list and transcript queries after send/control changes. Mark read only after the timeline is visible. Stop polling while the document is hidden and refetch on focus.

- [ ] **Step 5: Add E2E flow and commit**

E2E: customer webhook fixture → unread inbox → take control → panel reply → outbox sent state → release to selected bot state.

Run: `pnpm --filter @camila/admin test:unit && pnpm test:e2e`.

```powershell
git add apps/admin/src apps/admin/e2e
git commit -m "feat: add responsive whatsapp inbox"
```

---

### Task 6: Make coexistence capability explicit and attribute mobile replies

**Files:**
- Create: `apps/api/drizzle/0017_whatsapp_capabilities.sql` through generation
- Modify: `apps/api/src/database/schema.ts`
- Create: `packages/contracts/src/whatsapp-connection.ts`
- Create: `apps/api/src/modules/whatsapp/connection-capability-service.ts`
- Create: `apps/api/src/modules/whatsapp/mobile-echo-classifier.ts`
- Create: `apps/api/src/routes/admin/whatsapp-connection.ts`
- Create: `apps/admin/src/settings/WhatsAppSettingsPage.tsx`
- Test: `apps/api/test/mobile-echo-classifier.test.ts`
- Test: `apps/api/test/whatsapp-capabilities.integration.test.ts`
- Test: `apps/admin/src/settings/WhatsAppSettingsPage.test.tsx`
- Modify: `apps/api/src/modules/whatsapp/whatsapp-event.ts`
- Modify: `apps/api/src/routes/whatsapp.ts`
- Modify: `apps/admin/src/App.tsx`

**Interfaces:**
- Produces: `WhatsAppConnectionCapabilities`, `GET /api/admin/whatsapp/connection`, capability-aware settings UI, and source `owner_mobile` when supported evidence is present.
- Consumes: actual Meta webhook payloads; no heuristic classification based only on message text or phone.

- [ ] **Step 1: Test default-safe capabilities**

With no verified coexistence evidence, the API returns `cloud_api_only`, `mobileAppAvailable: false`, and the UI states that the mobile app has not been verified.

- [ ] **Step 2: Test supported mobile echo classification**

Store sanitized real-shape webhook fixtures for supported outbound echo events. Unknown shapes remain audit events and never switch control automatically.

- [ ] **Step 3: Add migration and service**

Persist connection mode, capability booleans, evidence source, WABA/phone-number ids, and `checkedAt`. Never store access tokens in this table or return them to the browser.

- [ ] **Step 4: Add settings checklist**

Show number identity, connection mode, webhook health, coexistence readiness, service-window support, template sync, and explicit production onboarding checklist. The UI must not offer a fake “enable coexistence” switch.

- [ ] **Step 5: Close block B**

Run the full verification gate. Repeat takeover concurrency tests three times. Run inbox E2E at 390 px and 1280 px.

```powershell
git add packages/contracts apps/api/drizzle apps/api/src apps/api/test apps/admin/src apps/admin/e2e
git commit -m "feat: report whatsapp coexistence capabilities"
```

---

### Task 7: Add recoverable catalog drafts and atomic creation

**Files:**
- Create: `apps/api/drizzle/0018_catalog_drafts.sql` through generation
- Modify: `apps/api/src/database/schema.ts`
- Create: `packages/contracts/src/catalog-drafts.ts`
- Create: `apps/api/src/modules/catalog/catalog-draft-service.ts`
- Create: `apps/api/src/modules/catalog/postgres-catalog-draft-repository.ts`
- Create: `apps/api/src/routes/admin/catalog-drafts.ts`
- Test: `apps/api/test/catalog-draft-service.test.ts`
- Test: `apps/api/test/catalog-draft.integration.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/routes/admin/index.ts`

**Interfaces:**
- Produces: create/update/get/finalize catalog draft endpoints and `CatalogDraftPublicSchema`.
- Consumes: existing catalog validation, photo storage, reference repository, and stock transactions.

- [ ] **Step 1: Define the draft contract**

```ts
export const CatalogDraftPublicSchema = z.object({
  id: z.uuid(), code: z.string(), modelName: z.string(), color: z.string(),
  priceCop: z.number().int().positive(), internalNote: z.string().max(500).nullable(),
  photo: PhotoPublicSchema.nullable(),
  stock: z.array(z.object({ size: ShoeSizeStringSchema, physicalQuantity: z.number().int().nonnegative() }).strict()),
  completedSteps: z.array(z.enum(['information', 'photo', 'stock'])),
  updatedAt: z.iso.datetime(),
}).strict();
```

- [ ] **Step 2: Test draft recovery and activation rules**

Refresh-safe retrieval preserves information, uploaded photo metadata, and stock matrix. Finalization with `activate: true` fails unless a valid photo and at least one positive available size exist.

- [ ] **Step 3: Add migration and service**

Persist draft data and photo metadata. Finalize inside a database transaction for reference and stock, then associate already-written photo storage safely. Cleanup failure becomes a warning, not lost reference data.

- [ ] **Step 4: Add multipart and concurrency integration tests**

Cover duplicate code, photo replacement, simultaneous finalize calls, half sizes, invalid price, and retry after storage failure.

- [ ] **Step 5: Verify and commit**

```powershell
git add packages/contracts apps/api/drizzle apps/api/src/database apps/api/src/modules/catalog apps/api/src/routes/admin apps/api/test
git commit -m "feat: add recoverable catalog creation drafts"
```

---

### Task 8: Build the visual catalog and four-step reference wizard

**Files:**
- Create: `apps/admin/src/catalog/ReferenceWizardPage.tsx`
- Create: `apps/admin/src/catalog/ReferenceInformationStep.tsx`
- Create: `apps/admin/src/catalog/ReferencePhotoStep.tsx`
- Create: `apps/admin/src/catalog/ReferenceStockStep.tsx`
- Create: `apps/admin/src/catalog/ReferenceReviewStep.tsx`
- Create: `apps/admin/src/catalog/SizeStockMatrix.tsx`
- Create: `apps/admin/src/catalog/ReferenceCard.tsx`
- Create: `apps/admin/src/catalog/CatalogFilters.tsx`
- Test: `apps/admin/src/catalog/ReferenceWizardPage.test.tsx`
- Test: `apps/admin/src/catalog/CatalogListPage.test.tsx`
- Modify: `apps/admin/src/api/catalog-api.ts`
- Modify: `apps/admin/src/catalog/CatalogListPage.tsx`
- Modify: `apps/admin/src/catalog/ReferenceDetailPage.tsx`
- Modify: `apps/admin/src/App.tsx`
- Remove after replacement: `apps/admin/src/catalog/ReferenceCreatePage.tsx`

**Interfaces:**
- Produces: grid/table catalog, four-step wizard, main-photo upload, whole/half-size matrix, review, draft/activate outcome, and tabbed detail.
- Consumes: Task 1 components and Task 7 draft API.

- [ ] **Step 1: Test the complete wizard before implementation**

Create a draft, enter reference `01`, upload a valid JPEG, set size 37 to 2 and 37.5 to 1, review WhatsApp card, finalize active, and assert navigation to the new detail.

- [ ] **Step 2: Test recovery and validation**

Reload at step three and restore the draft. Reject activation without photo or positive stock. Preserve user input after an API validation error. Use camera capture on mobile with `accept="image/jpeg,image/png"` and `capture="environment"` as a progressive enhancement.

- [ ] **Step 3: Implement grid and table catalog**

Filters serialize into URL query parameters. Cards show image, code, model, color, price, sizes, physical/reserved/available totals, and readiness warnings. Table mode remains available for dense desktop operations.

- [ ] **Step 4: Implement tabbed detail**

Tabs: Resumen, Fotografía, Tallas y stock, Movimientos, Actividad. Keep existing photo and stock capabilities but move them into the appropriate tabs.

- [ ] **Step 5: Add mobile and desktop E2E and commit**

Run: `pnpm --filter @camila/admin test:unit && pnpm test:e2e`.

```powershell
git add apps/admin/src apps/admin/e2e
git commit -m "feat: add visual catalog and reference wizard"
```

---

### Task 9: Replace the technical CSV screen with a Treinta import wizard

**Files:**
- Modify: `apps/api/package.json` to add exact dependency `exceljs: 4.4.0`
- Modify: `pnpm-lock.yaml`
- Create: `packages/contracts/src/catalog-imports.ts`
- Create: `apps/api/src/modules/catalog/spreadsheet-reader.ts`
- Create: `apps/api/src/modules/catalog/import-column-mapper.ts`
- Create: `apps/api/src/modules/catalog/import-profile-repository.ts`
- Create: `apps/api/drizzle/0019_catalog_import_profiles.sql` through generation
- Modify: `apps/api/src/database/schema.ts`
- Modify: `apps/api/src/modules/catalog/catalog-import-service.ts`
- Create: `apps/admin/src/catalog/import/ImportWizardPage.tsx`
- Create: `apps/admin/src/catalog/import/ImportSourceStep.tsx`
- Create: `apps/admin/src/catalog/import/ColumnMappingStep.tsx`
- Create: `apps/admin/src/catalog/import/ImportPreviewStep.tsx`
- Create: `apps/admin/src/catalog/import/PhotoPreparationQueue.tsx`
- Test: `apps/api/test/spreadsheet-reader.test.ts`
- Test: `apps/api/test/catalog-import-profile.integration.test.ts`
- Test: `apps/admin/src/catalog/import/ImportWizardPage.test.tsx`
- Modify: `apps/admin/src/api/catalog-import-api.ts`
- Remove after replacement: `apps/admin/src/catalog/CatalogImportPage.tsx`

**Interfaces:**
- Produces: XLSX/CSV sheet inspection, explicit column mapping, saved source profiles, preview classifications, atomic commit, downloadable errors, and photo-preparation queue.
- Consumes: existing catalog import transaction and reference activation rules.

- [ ] **Step 1: Add real spreadsheet fixtures and failing parser tests**

Fixtures cover XLSX with formatted numeric codes, CSV UTF-8, alternate Spanish headers, half sizes, duplicate rows, missing sheet, formulas, and 501 rows. Formula cells use cached values only; macros and external links are never executed.

- [ ] **Step 2: Implement safe workbook reading**

Limit upload to 5 MiB, worksheets to 10, rows to 500, and columns to 50. Convert cell values to explicit strings/numbers and return sheet/header previews without catalog mutation.

- [ ] **Step 3: Implement mapping and saved profiles**

Required targets are reference, model, color, price, size, and quantity. Reject duplicate target mapping. Save a normalized header fingerprint and mapping under source `treinta` or `system_template`.

- [ ] **Step 4: Extend preview and atomic import**

Classify each row as `new`, `update`, `ignored`, `warning`, or `error`. The confirmation screen displays exact stock changes. A blocking error prevents commit; a failed commit changes no reference or inventory row.

- [ ] **Step 5: Build the wizard and error export**

The owner selects source, file, sheet, mapping, preview, and confirmation. Generate a CSV error report with `row,source_value,field,code,message`. After success, link directly to references missing photos.

- [ ] **Step 6: Close block C and commit**

Run full verification, empty-database migrations, and migration from `0015`.

```powershell
git add package.json pnpm-lock.yaml packages/contracts apps/api apps/admin
git commit -m "feat: add guided treinta catalog import"
```

---

### Task 10: Introduce the closed 99envíos carrier catalog and locality search

**Files:**
- Create: `apps/api/src/modules/shipping/carrier-catalog.ts`
- Create: `packages/contracts/src/shipping-preferences.ts`
- Create: `apps/api/src/modules/localities/locality-search-repository.ts`
- Create: `apps/api/src/routes/admin/shipping-preferences.ts`
- Test: `apps/api/test/carrier-catalog.test.ts`
- Test: `apps/api/test/locality-search.integration.test.ts`
- Test: `packages/contracts/test/shipping-preferences-contracts.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/modules/shipping/shipping-policy.ts`
- Modify: `apps/api/src/modules/shipping/postgres-shipping-quote-repository.ts`
- Modify: `apps/api/src/routes/admin/index.ts`

**Interfaces:**
- Produces: `CarrierId`, `CARRIER_CATALOG`, `GET /api/admin/shipping/carriers`, and cursor/search `GET /api/admin/localities?q=`.
- Consumes: 99envíos quote keys and imported `shipping_localities`.

- [ ] **Step 1: Define exact carrier identifiers**

```ts
export const CARRIER_CATALOG = [
  { id: 'interrapidisimo', name: 'Interrapidísimo' },
  { id: 'tcc', name: 'TCC' },
  { id: 'servientrega', name: 'Servientrega' },
  { id: 'coordinadora', name: 'Coordinadora' },
  { id: 'envia', name: 'Envia' },
] as const;
```

Reject unknown carrier ids at the shared-contract and database-service boundaries. Keep observed `lastSeenAt` and recent successful quote count as metadata, not as authorization to invent a new carrier.

- [ ] **Step 2: Add locality-search tests**

Search `mede` returns Medellín with department and exact carrier/DANE code. Accent-insensitive search for `bogota` returns Bogotá. Empty query returns a bounded popular/recent list rather than all municipalities.

- [ ] **Step 3: Implement repository and endpoints**

Return carrier display name, id, observed availability, last seen, and enabled state. Return locality label, department, code, and active rule indicator.

- [ ] **Step 4: Migrate old free-text values safely**

Normalize existing lowercase carrier values to catalog ids during the next shipping migration. Abort migration for unknown non-null values and report the exact invalid value; never silently discard an existing policy.

- [ ] **Step 5: Verify and commit**

```powershell
git add packages/contracts apps/api/src/modules/shipping apps/api/src/modules/localities apps/api/src/routes/admin apps/api/test
git commit -m "feat: add controlled shipping carrier catalog"
```

---

### Task 11: Expand shipping policies and implement a rate-limited quote simulator

**Files:**
- Create: `apps/api/drizzle/0020_shipping_policy_v2.sql` through generation
- Modify: `apps/api/src/database/schema.ts`
- Modify: `packages/contracts/src/shipping-preferences.ts`
- Modify: `apps/api/src/modules/shipping/shipping-policy.ts`
- Create: `apps/api/src/modules/shipping/quote-cache.ts`
- Create: `apps/api/src/modules/shipping/shipping-policy-simulator.ts`
- Modify: `apps/api/src/modules/shipping/shipping-quote-service.ts`
- Modify: `apps/api/src/modules/shipping/postgres-shipping-quote-repository.ts`
- Modify: `apps/api/src/routes/admin/shipping-preferences.ts`
- Test: `apps/api/test/shipping-policy-v2.test.ts`
- Test: `apps/api/test/shipping-policy-simulator.test.ts`
- Test: `apps/api/test/shipping-policy-v2.integration.test.ts`

**Interfaces:**
- Produces: primary/secondary carrier selection, package defaults, quote validity, audit concurrency version, and `POST /api/admin/shipping/rules/preview` with real quote details but no guide.
- Consumes: Task 10 catalog/locality API and existing 99envíos client.

- [ ] **Step 1: Extend policy contract**

```ts
interface ShippingPolicyV2 {
  primaryCarrier: CarrierId | null;
  secondaryCarrier: CarrierId | null;
  fallbackPolicy: 'allow' | 'block';
  offerMode: 'customer_choice' | 'economy_only' | 'protected_only';
  protectedInsurance: 'standard' | 'plus';
  packageDefaults: { weightKg: number; heightCm: number; lengthCm: number; widthCm: number };
  declaredValueMode: 'product_subtotal';
  codEnabled: true;
  quoteValidityMinutes: number;
  version: number;
}
```

Reject identical primary/secondary carriers, blocked fallback without a primary carrier, and package values outside explicit provider-safe ranges.

- [ ] **Step 2: Test selection order and fallback**

Primary wins even when more expensive; secondary wins when primary is unavailable; `allow` selects Envia and then lowest total; `block` creates attention when configured carriers are absent. Protected selection preserves standard/Plus insurance through guide creation.

- [ ] **Step 3: Add optimistic concurrency and audit**

PATCH requires the last `version`; concurrent stale update returns 409 `shipping_policy_changed`. Audit stores before/after policy, scope, locality, actor, and timestamp.

- [ ] **Step 4: Implement quote cache and rate protection**

Hash origin, destination, dimensions, declared value, COD, insurance, and ship date. Reuse valid quotes until expiry. Track calls per hour locally and surface 429 with provider retry information. A simulator request never enqueues a guide job.

- [ ] **Step 5: Verify real-shape response normalization**

Controlled fixtures cover all five carriers, missing carrier, provider-specific failure objects, standard/Plus insurance costs, strings/numbers, and stale quote refresh requiring new customer confirmation.

- [ ] **Step 6: Verify and commit**

```powershell
git add packages/contracts apps/api/drizzle apps/api/src/database apps/api/src/modules/shipping apps/api/src/routes/admin apps/api/test
git commit -m "feat: add advanced municipal shipping policies"
```

---

### Task 12: Rebuild shipping preferences as a premium rule manager

**Files:**
- Create: `apps/admin/src/settings/shipping/ShippingPreferencesPage.tsx`
- Create: `apps/admin/src/settings/shipping/GlobalPolicyCard.tsx`
- Create: `apps/admin/src/settings/shipping/ShippingRulesTable.tsx`
- Create: `apps/admin/src/settings/shipping/ShippingRuleDrawer.tsx`
- Create: `apps/admin/src/settings/shipping/CarrierSelect.tsx`
- Create: `apps/admin/src/settings/shipping/LocalityCombobox.tsx`
- Create: `apps/admin/src/settings/shipping/PolicyExplanation.tsx`
- Create: `apps/admin/src/settings/shipping/QuoteSimulator.tsx`
- Create: `apps/admin/src/api/shipping-preferences-api.ts`
- Test: `apps/admin/src/settings/shipping/ShippingPreferencesPage.test.tsx`
- Test: `apps/admin/src/settings/shipping/ShippingRuleDrawer.test.tsx`
- Test: `apps/admin/src/settings/shipping/QuoteSimulator.test.tsx`
- Modify: `apps/admin/src/App.tsx`
- Remove after replacement: `apps/admin/src/settings/ShippingSettingsPage.tsx`

**Interfaces:**
- Produces: global summary, searchable rules, create/edit/duplicate/deactivate drawer, carrier selects, municipality search, natural-language explanation, and simulator.
- Consumes: Tasks 10 and 11 APIs and Task 1 design primitives.

- [ ] **Step 1: Test closed selections and human-readable municipality**

The owner can choose only catalog carriers. Typing an arbitrary carrier cannot be submitted. Municipality search displays `Medellín, Antioquia` and stores its code without requiring the owner to know it.

- [ ] **Step 2: Test every policy combination**

Cover automatic, primary only, primary+secondary, allowed fallback, blocked fallback, economic only, customer choice, protected only, standard, and Plus. The explanation sentence updates before save.

- [ ] **Step 3: Implement rules table and drawer**

Rows show municipality, department, primary, secondary, fallback, offer, insurance, active status, and modification time. Drawer supports create, edit, duplicate, deactivate, and unsaved-change confirmation.

- [ ] **Step 4: Implement simulator results**

Display applied scope, provider alternatives, selected reason, freight, COD fee, surcharge, insurance, total, cache age, and expiry. Provider failure rows remain visible with a clear reason.

- [ ] **Step 5: Close block D**

E2E policies: city preference despite price, secondary fallback, allowed-any fallback, blocked route, forced insurance, and expired quote confirmation.

```powershell
git add apps/admin/src apps/admin/e2e
git commit -m "feat: add premium shipping rule manager"
```

---

### Task 13: Rebuild order operations around actionable states

**Files:**
- Create: `apps/admin/src/orders/OrderFilters.tsx`
- Create: `apps/admin/src/orders/OrderCard.tsx`
- Create: `apps/admin/src/orders/OrderTimeline.tsx`
- Create: `apps/admin/src/orders/OrderCustomerPanel.tsx`
- Create: `apps/admin/src/orders/OrderShippingPanel.tsx`
- Create: `apps/admin/src/orders/OrderActions.tsx`
- Test: `apps/admin/src/orders/OrdersListPage.test.tsx`
- Test: `apps/admin/src/orders/OrderDetailPage.test.tsx`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/routes/admin/index.ts`
- Modify: `apps/admin/src/api/orders-api.ts`
- Modify: `apps/admin/src/orders/OrdersListPage.tsx`
- Modify: `apps/admin/src/orders/OrderDetailPage.tsx`

**Interfaces:**
- Produces: cursor-paginated filtered orders, quick operational views, state-aware action bar, and complete order timeline.
- Consumes: existing order domain, shipping state, conversation id, inventory events, and alerts.

- [ ] **Step 1: Extend list query and contract tests**

Filters: search, status, operational view, city, carrier, insurance, label, date range, and cursor. Response includes total-visible indicators and `updatedAt`.

- [ ] **Step 2: Test allowed action matrix**

For each order state, assert the exact available primary and secondary actions. Cancelled/delivered orders cannot create guides; uncertain guides offer review but no automatic retry.

- [ ] **Step 3: Build responsive list and detail**

Desktop table and mobile cards expose customer, reference/size, city, COD total, carrier, insurance, state, and time in state. Detail sections: product, customer, destination, quote, guide/PDF, conversation, inventory, alerts, timeline.

- [ ] **Step 4: Add E2E operational flow**

Open from dashboard queue, inspect conversation, confirm quote, review guide/PDF, mark dispatched, and verify inventory event.

- [ ] **Step 5: Verify and commit**

```powershell
git add packages/contracts apps/api/src/routes/admin apps/admin/src apps/admin/e2e
git commit -m "feat: add premium order operations"
```

---

### Task 14: Add persistent alerts, daily Treinta closures, and integration health

**Files:**
- Create: `apps/api/drizzle/0021_operations_center.sql` through generation
- Modify: `apps/api/src/database/schema.ts`
- Create: `packages/contracts/src/operations.ts`
- Create: `apps/api/src/modules/alerts/alert-service.ts`
- Create: `apps/api/src/modules/alerts/postgres-alert-repository.ts`
- Create: `apps/api/src/modules/inventory/inventory-closure-service.ts`
- Create: `apps/api/src/modules/inventory/postgres-inventory-closure-repository.ts`
- Create: `apps/api/src/modules/integrations/integration-health-service.ts`
- Create: `apps/api/src/routes/admin/operations.ts`
- Create: `apps/admin/src/alerts/AlertsPage.tsx`
- Create: `apps/admin/src/inventory/InventoryPage.tsx`
- Create: `apps/admin/src/inventory/InventoryClosuresPage.tsx`
- Create: `apps/admin/src/settings/IntegrationsPage.tsx`
- Test: `apps/api/test/alert-service.test.ts`
- Test: `apps/api/test/inventory-closure.integration.test.ts`
- Test: `apps/api/test/integration-health-service.test.ts`
- Test: `apps/admin/src/alerts/AlertsPage.test.tsx`
- Test: `apps/admin/src/inventory/InventoryClosuresPage.test.tsx`
- Test: `apps/admin/src/settings/IntegrationsPage.test.tsx`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/admin/src/App.tsx`

**Interfaces:**
- Produces: persistent deduplicated alerts, inventory closure versions and export, integration status, and corresponding admin screens.
- Consumes: order/guide/message failures, inventory movements, scheduler timestamps, external client health without side effects.

- [ ] **Step 1: Define operations contracts**

`OwnerAlert` contains type, severity, entity link, deduplication key, status, attempts, next action, created/read/resolved timestamps. `InventoryClosure` contains Bogotá business date, version, movement range, absolute/adjustment profile, file checksum, status, totals, and acknowledgement. `IntegrationHealth` reports WhatsApp, 99envíos, database, media storage, and scheduler without returning secrets.

- [ ] **Step 2: Implement deduplicated alerts and bounded retries**

Repeated failure for the same entity/type opens one alert. Retry is allowed only for explicitly safe operations; uncertain guide/message sends require reconciliation. Manual retry writes an audit event.

- [ ] **Step 3: Implement closure transaction and export**

At 19:00 `America/Bogota`, create one closure for unexported eligible movements. Generate a deterministic CSV or XLSX using the validated Treinta profile, checksum it, and mark its movement range. Download does not acknowledge. Acknowledgement records actor/time. Reopen requires reason and creates a compensating version.

- [ ] **Step 4: Implement side-effect-free integration health**

Database uses a lightweight query, media storage uses a temporary scoped probe, scheduler uses heartbeat age, WhatsApp reports webhook/capability state, and 99envíos reports last successful authentication/quote. No check sends a message, requests a quote, or creates a guide.

- [ ] **Step 5: Build admin screens and E2E**

Alert rows provide exact recovery action. Inventory exposes physical/reserved/available/sold-pending-export. Closures show preview, generate, download, acknowledge, and reopen. Integrations show last success/failure and capability state.

- [ ] **Step 6: Verify and commit**

```powershell
git add packages/contracts apps/api/drizzle apps/api/src apps/api/test apps/admin/src apps/admin/e2e
git commit -m "feat: add premium operations center"
```

---

### Task 15: Perform the release-quality audit and publish documentation

**Files:**
- Modify: `apps/admin/package.json` to add exact dev dependency `@axe-core/playwright: 4.10.2`
- Modify: `pnpm-lock.yaml`
- Create: `apps/admin/e2e/accessibility.spec.ts`
- Create: `apps/admin/e2e/mobile-operations.spec.ts`
- Create: `apps/admin/e2e/whatsapp-inbox.spec.ts`
- Create: `apps/admin/e2e/treinta-import.spec.ts`
- Create: `apps/admin/e2e/shipping-policies.spec.ts`
- Create: `apps/api/test/full-migration.integration.test.ts`
- Create: `scripts/verify.ps1`
- Create: `docs/operations/owner-guide.md`
- Create: `docs/operations/whatsapp-coexistence-checklist.md`
- Create: `docs/operations/incidents.md`
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: local release gates if this change affects verification

**Interfaces:**
- Produces: reproducible verification, accessibility coverage, owner operating guide, incident runbook, coexistence checklist, and release evidence.
- Consumes: every previous task.

- [ ] **Step 1: Add the self-contained verification command**

`scripts/verify.ps1` validates the workspace path, starts only `postgres-test`, waits for health, applies migrations, runs all checks, and stops the same explicit test container in `finally`. It must not stop the development database.

- [ ] **Step 2: Add accessibility gates**

Run Axe on login, dashboard, inbox, catalog wizard, import wizard, orders, shipping preferences, alerts, closures, and integrations at 390 px and 1280 px. Add keyboard-only focus tests for drawers, modals, comboboxes, composer, and mobile navigation.

- [ ] **Step 3: Add full critical-path E2E**

```text
signed inbound WhatsApp
→ size
→ available photos
→ reference selection
→ customer data
→ municipal policy
→ economic/protected choice
→ confirmation
→ reservation
→ guide adapter
→ PDF
→ owner alert
→ dispatch
→ inventory movement
→ Treinta closure
→ download
→ acknowledgement
```

Add an independent manual-control flow: inbound → owner takes control → sends panel reply → bot remains paused → owner selects resume state → automation continues once.

- [ ] **Step 4: Verify migrations and concurrency**

Test empty database `0000 → latest`, populated `0015 → latest`, and repeat latest migration. Repeat stock, guide, takeover, message-idempotency, and closure-generation concurrency tests three times.

- [ ] **Step 5: Run the final quality gate**

```powershell
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
git status --short
```

Expected: every command exits 0, no known production vulnerabilities, no whitespace errors, and a clean tree after the final commit.

- [ ] **Step 6: Perform controlled external acceptance**

After simulated gates pass, validate the actual Meta account capability without changing the production number, then run one deliberate test-number conversation. Run one 99envíos quote. Do not create a real guide until the owner supplies explicit test-order authorization. Record provider ids, timestamps, redacted responses, and cleanup outcome.

- [ ] **Step 7: Write operating documentation**

Document daily order handling, taking/releasing WhatsApp control, creating a product, importing from Treinta, resolving guide incidents, configuring city rules, dispatching, and closing inventory. The coexistence checklist distinguishes Meta test number, Cloud API only, and verified Business App coexistence.

- [ ] **Step 8: Commit the release audit**

```powershell
git add apps/admin apps/api scripts docs README.md ROADMAP.md .github pnpm-lock.yaml
git commit -m "chore: complete premium operations release audit"
```

---

## Block review template

Every block delivery must report:

1. Full commit hash and parent hash.
2. Created, modified, and removed files.
3. Schema and migration changes.
4. Public contracts and endpoint matrix.
5. RED test evidence and corresponding GREEN result.
6. Exact unit, integration, and E2E counts.
7. Desktop and mobile E2E results.
8. Three-run concurrency results where applicable.
9. `pnpm verify`, audit, `git diff --check`, and status output.
10. Known limitations and external prerequisites.

No block is approved solely because it compiles or looks correct in one viewport.

