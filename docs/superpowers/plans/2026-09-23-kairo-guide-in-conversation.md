# KAIRO Guide in Conversation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every WhatsApp-originated shipping guide as one authenticated, internal card in its conversation, with reliable PDF download and no duplicate 99envíos operation.

**Architecture:** Persist an immutable order-to-origin-conversation link, then represent guide creation as an idempotent internal transcript event. Extend the existing authenticated transcript and render the event separately from customer-facing WhatsApp documents; download the PDF through the authenticated order endpoint.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, PostgreSQL migrations, Zod contracts, React, TanStack Query, Vitest, Playwright.

## Global Constraints

- The guide card is internal to KAIRO and never enters `whatsapp_outbound_messages`.
- Keep `sendGuideToCustomer` behavior unchanged.
- A failure after a successful provider response must not enqueue another pre-shipment creation.
- Use authenticated endpoints and private, no-store PDF responses; never expose storage keys.
- Preserve stable transcript cursor order by `(occurred_at, id)`.
- Follow existing Spanish UI copy and existing role authorization patterns.

---

### Task 1: Persist the order's original conversation and guide event

**Files:**
- Modify: `apps/api/src/database/schema/whatsapp.ts`
- Modify: `apps/api/src/database/schema/index.ts`
- Modify: `apps/api/src/modules/conversations/postgres-conversation-repository.ts`
- Modify: `apps/api/src/modules/shipping/postgres-shipping-guide-job-repository.ts`
- Create: `apps/api/drizzle/0035_kairo_guide_conversation_events.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Test: `apps/api/test/conversation-repository.integration.test.ts`
- Test: `apps/api/test/shipping-guide-job-repository.integration.test.ts`

**Interfaces:**
- `attachOrder(conversationId, referenceId, orderId)` also inserts one immutable `conversation_order_links` row in the same transaction.
- `markCreated(id, preShipmentNumber, freightCop)` and `reviewUncertain(id, preShipmentNumber)` insert the matching internal guide event atomically and idempotently when a source conversation exists.

- [ ] Write PostgreSQL tests proving attach creates one origin link and reattaching the same order does not duplicate it.
- [ ] Run the focused integration tests and confirm the new assertions fail before the migration/repository changes.
- [ ] Add migration tables/columns and constraints: unique order link; source `system`; event type `event`; status `internal`; guide job and order references; unique guide job event.
- [ ] Make `attachOrder` use a transaction for the active-order update and immutable origin-link insert.
- [ ] Make guide `created` and uncertain-review transitions insert events idempotently in the same transaction.
- [ ] Rerun the focused integration tests and confirm all new persistence assertions pass.
- [ ] Commit as `feat: persist internal conversation guide events`.

### Task 2: Preserve provider idempotency on local persistence failures

**Files:**
- Modify: `apps/api/src/modules/shipping/shipping-guide-worker.ts`
- Test: `apps/api/test/shipping-guide-job-repository.integration.test.ts`
- Test: `apps/api/test/shipping-guide-worker.test.ts`

**Interfaces:**
- `ShippingGuideWorker.runOnce()` records when 99envíos returned a successful pre-shipment response; if local `markCreated` then fails, it transitions/retains the job as uncertain and emits no second provider request.

- [ ] Add a test where `createPreShipment` succeeds and `markCreated` throws; assert exactly one provider call and one uncertain classification attempt.
- [ ] Inject a transcript event insertion failure in PostgreSQL; assert the `markCreated` transaction rolls back the guide status and event together.
- [ ] Run `pnpm --filter @camila/api exec vitest run --project unit test/shipping-guide-worker.test.ts` and confirm failure.
- [ ] Update worker error handling so a local persistence error after provider success cannot flow to `markFailed` or a retryable pending job.
- [ ] Add a recovery test proving review of that uncertain job creates exactly one event and does not call 99envíos again.
- [ ] Rerun the focused worker test and `pnpm --filter @camila/api exec vitest run --project integration test/shipping-guide-job-repository.integration.test.ts`.
- [ ] Commit as `fix: keep successful guide creation uncertain on persistence error`.

### Task 3: Return a typed internal event in the authenticated transcript

**Files:**
- Modify: `packages/contracts/src/conversations.ts`
- Modify: `apps/api/src/modules/conversations/conversation-transcript-repository.ts`
- Modify: `apps/api/src/modules/conversations/postgres-conversation-transcript-repository.ts`
- Modify: `apps/api/src/routes/admin/conversations.ts`
- Test: `apps/api/test/conversation-transcript-repository.integration.test.ts`
- Test: `apps/api/test/admin-conversations-http.test.ts`

**Interfaces:**
- Public transcript item remains a strict discriminated union: WhatsApp message fields for existing records; system guide event fields `orderId`, `guideJobId`, `preShipmentNumber`, and `carrier` for internal events.
- Internal event status is `internal`; provider message ID and media URL are null.

- [ ] Add contract tests for valid guide event and rejection of missing or incorrectly typed fields.
- [ ] Add integration test ordering an internal guide event with inbound/outbound messages and paging across equal timestamps.
- [ ] Run the focused contract/API tests and confirm failures.
- [ ] Update SQL union/select mapping and stable cursor encoding to preserve `(occurred_at, id)` ordering across both row kinds.
- [ ] Keep admin authentication and conversation existence checks before returning either item kind.
- [ ] Rerun focused tests; assert no event is inserted into or returned from the outbound queue.
- [ ] Commit as `feat: expose internal guide events in transcript API`.

### Task 4: Render guide cards and document messages safely

**Files:**
- Modify: `apps/admin/src/api/conversations-api.ts`
- Modify: `apps/admin/src/conversations/ConversationTimeline.tsx`
- Modify: `apps/admin/src/conversations/ConversationInboxPage.tsx`
- Modify: `apps/admin/src/api/orders-api.ts`
- Test: `apps/admin/src/conversations/ConversationInboxPage.test.tsx`
- Create: `apps/admin/src/conversations/ConversationTimeline.test.tsx`

**Interfaces:**
- `ConversationTimeline` receives the strict public transcript union and renders a guide event card independently from WhatsApp messages.
- Guide card actions use the existing `downloadGuidePdf(orderId)` authenticated download function.

- [ ] Add UI tests for internal-only label, order link, carrier/pre-shipment details, pending download, failed download, and retry without another guide request.
- [ ] Add a regression assertion that `messageType: document` is rendered as a document link/card, never an `<img>`.
- [ ] Run the focused admin tests and confirm failures.
- [ ] Implement discriminated rendering; hide delivery statuses for internal system events and preserve delivery statuses for actual WhatsApp messages.
- [ ] Delay temporary object URL revocation until browser download navigation has started; keep filename human-readable with order number.
- [ ] Add mobile viewport and keyboard-accessibility coverage for guide-card actions.
- [ ] Rerun focused tests and `pnpm --filter @camila/admin typecheck`.
- [ ] Commit as `feat: download shipping guides from conversations`.

### Task 5: Reconcile existing created guides and verify the full guide flow

**Files:**
- Modify: `apps/api/drizzle/0035_kairo_guide_conversation_events.sql`
- Modify: `apps/api/test/database-migrations.integration.test.ts`
- Modify: `apps/api/test/guide-delivery-service.integration.test.ts`

- [ ] Add migration fixture with a created guide whose source conversation is provable and one without a provable source.
- [ ] Run the migration integration test against an empty disposable `*_test` database and confirm only the provable guide receives a card.
- [ ] Add a delivery test with `sendGuideToCustomer=false`; assert the internal card still exists and no outbound document was enqueued.
- [ ] Verify duplicate migration execution and duplicate worker recovery do not create extra events or provider operations.
- [ ] Run focused guide, conversation, and migration integration suites.
- [ ] Commit as `test: cover guide timeline recovery and migration`.

### Task 6: Release verification for the guide feature

**Files:**
- No code files unless a regression is found.

- [ ] Run `pnpm verify` from a clean worktree after all guide commits.
- [ ] Review `git diff --check`, migration SQL, authorization, transcript pagination, and the absence of any public PDF URL.
- [ ] Record any external Meta/99envíos acceptance still required without treating local verification as production approval.
- [ ] Commit any documentation-only test evidence as `docs: record guide conversation verification`.
