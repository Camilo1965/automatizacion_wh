# KAIRO Customer Identity and Segmentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each customer contact a stable KAIRO identifier, connect it to conversations and orders, show purchase history, and filter contacts by evidence of a delivered purchase.

**Architecture:** Add a UUID customer contact table and nullable foreign keys to existing orders and WhatsApp conversations. Link new records through normalized phone lookup, backfill only reconcilable historical data, derive buyer status from order facts, and expose authenticated list/detail APIs for a small customer directory in the admin application.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, PostgreSQL migrations, Zod contracts, React, TanStack Query, Vitest, Playwright.

## Global Constraints

- `customer_id` is the stable primary identity; a phone number is a contact field and a reconciliation key, and may be null only after explicit customer anonymization.
- A buyer has an order marked `delivered` that is not `returned`; confirmed or dispatched orders alone do not qualify.
- There is no payment evidence in the present data model; do not invent or infer a paid state.
- Unknown marketing consent is the default. This MVP has no Ads export, audience sync, or promotional messaging.
- Ambiguous shared-phone contacts are marked for review and excluded from future marketing audiences.
- Do not silently merge profiles when contact details change.
- Explicit customer anonymization clears direct profile PII and consent evidence while retaining the stable UUID and operational record history; it does not add an automatic retention duration.
- All customer APIs require existing admin authentication and apply the least-privilege PII patterns in the app.

---

### Task 1: Add the customer contact data model and safe backfill

**Files:**
- Create: `apps/api/src/database/schema/customers.ts`
- Modify: `apps/api/src/database/schema/index.ts`
- Modify: `apps/api/src/database/schema/orders.ts`
- Modify: `apps/api/src/database/schema/whatsapp.ts`
- Create: `apps/api/drizzle/0038_kairo_customer_contacts.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Test: `apps/api/test/database-migrations.integration.test.ts`

**Interfaces:**
- `customers`: UUID ID, display name, normalized phone, marketing consent `unknown | granted | denied | revoked`, traceable channel/purpose/notice-version/evidence-reference/date fields, needs-review flag, timestamps. `unknown` has no evidence; non-unknown states require the full evidence set.
- `sales_orders.customer_id` and `whatsapp_conversations.customer_id`: nullable during safe migration, FK-protected, indexed.

- [x] Write migration integration fixtures for one unambiguous phone, a phone with differing names, missing/invalid phones, and repeat execution.
- [x] Run `pnpm --filter @camila/api exec vitest run --project integration test/database-migrations.integration.test.ts` and confirm the new assertions fail.
- [x] Add a migration that creates the customer table, adds nullable customer IDs, normalizes Colombian phone numbers using the project’s existing rules, and groups only valid contact data.
- [x] Mark profiles with differing customer names on a shared phone as `needs_review`; do not mark consent as granted during backfill.
- [x] Link conversations and orders only when deterministic; leave unresolved records unlinked for operator review.
- [x] Add indexes, check constraints, consent fields defaulting to `unknown` with null evidence, and audit-safe timestamps; do not make `customer_id` non-null in this release.
- [x] Rerun migration tests, verify counts and associations, and run the migration a second time to prove idempotency.
- [x] Commit as `feat: add stable customer contact identities`.

### Task 2: Link new WhatsApp conversations and bot orders to customer IDs

**Files:**
- Modify: `apps/api/src/modules/conversations/postgres-conversation-repository.ts`
- Modify: `apps/api/src/modules/conversations/whatsapp-sales-service.ts`
- Modify: `apps/api/src/modules/orders/order-types.ts`
- Modify: `apps/api/src/modules/orders/postgres-order-repository.ts`
- Create: `apps/api/src/modules/customers/customer-contact.ts`
- Test: `apps/api/test/conversation-repository.integration.test.ts`
- Test: `apps/api/test/orders.integration.test.ts`
- Test: `apps/api/test/whatsapp-sales-service.test.ts`
- Test: `apps/api/test/whatsapp-sales-flow.integration.test.ts`

**Interfaces:**
- `PostgresConversationRepository.receive()` resolves or creates a customer contact by normalized phone and stores `customerId` on the conversation.
- `CreateOrderInput.customerId?: string | null` permits bot orders to explicitly inherit the conversation contact; manual orders may resolve by phone when safe.

- [x] Add tests that repeat inbound messages for one phone reuse the same customer ID and create distinct IDs for different phones.
- [x] Add tests that bot orders inherit the conversation ID and no customer is silently attached when phone resolution is ambiguous.
- [x] Run focused repository/order integration tests and confirm failure.
- [x] Implement transactional get-or-create with race-safe uniqueness on the normalized contact key; handle unique conflict by rereading the committed profile.
- [x] Persist customerId when creating conversations and their bot orders, preserving the current order and transcript behavior.
- [x] Keep manual order creation compatible; resolve a profile only where an unambiguous contact match exists.
- [x] Rerun focused integration tests and the relevant conversation/bot-flow tests.
- [x] Commit as `feat: link conversations and orders to customer contacts`.

### Task 3: Derive customer segments and add authenticated API contracts

**Files:**
- Create: `packages/contracts/src/customers.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/api/src/modules/customers/customer-service.ts`
- Create: `apps/api/src/modules/customers/postgres-customer-repository.ts`
- Create: `apps/api/src/routes/admin/customers.ts`
- Modify: `apps/api/src/routes/admin/index.ts`
- Modify: `apps/api/src/runtime.ts`
- Create: `apps/api/test/customer-service.test.ts`
- Create: `apps/api/test/customer-repository.integration.test.ts`
- Create: `apps/api/test/admin-customers-http.test.ts`

**Interfaces:**
- `CustomerSegment = 'buyer' | 'not_yet_buyer' | 'needs_review'` is derived in SQL from delivery and profile review state; no writable segment field.
- `GET /api/admin/customers?segment=&query=&limit=&cursor=` returns a paged summary.
- `GET /api/admin/customers/:customerId` returns contact history with associated conversations and orders.
- `GET /api/admin/customers/reconciliation?kind=orders|conversations|all&limit=&ordersCursor=&conversationsCursor=` returns separate, bounded, independently cursor-paginated lists of historical orders and conversations whose `customer_id` is null. `kind=all` is the initial-load default; a one-kind request must query and return only that type. Every pending row must be reachable. Invalid cursors are rejected as 400 before database access. This is a read-only review queue; it must not guess identities, merge profiles, or mutate records.

- [x] Test the buyer predicate: delivered qualifies; draft, confirmed, dispatched, cancelled, and returned alone do not; another valid delivered order keeps the customer a buyer after one return.
- [x] Test 401 unauthenticated access, 404 unknown customer, strict query validation, stable cursor pagination, and PII projection.
- [x] Test that the reconciliation API returns only unlinked orders/conversations, is authenticated, bounds and cursor-paginates each type until all pending rows are reachable, rejects invalid cursors with 400, and omits address/provider payloads and consent evidence.
- [x] Test malformed or impossible customer/reconciliation cursor timestamps return 400 without surfacing database errors.
- [x] Run focused contract/service/API tests and confirm failures.
- [x] Implement queries with parameterized search, bounded page size, stable sort, and no raw consent evidence in list responses.
- [x] Make `needs_review` visible as a separate segment, excluded from “buyers” and “sin compra acreditada” filters until reviewed.
- [x] Register routes with existing admin authentication and ensure no write route or export route is introduced.
- [x] Add the read-only reconciliation query using stable, bounded, independently cursor-paginated per-type ordering and minimal operator-review fields (record ID, display name/phone when available, timestamp, status, and existing detail-route ID); reject invalid timestamp/UUID cursors before query execution; do not auto-link records.
- [x] Rerun focused API tests and typecheck contracts/API.
- [x] Commit as `feat: add customer history and purchase filters API` (fix commit `43776f2` after scoped re-review).

### Task 4: Add the customer directory and history view

**Files:**
- Create: `apps/admin/src/customers/CustomersPage.tsx`
- Create: `apps/admin/src/customers/CustomerDetailPage.tsx`
- Create: `apps/admin/src/api/customers-api.ts`
- Modify: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/components/DesktopSidebar.tsx`
- Modify: `apps/admin/src/more/MorePage.tsx`
- Modify: `apps/admin/src/conversations/ConversationInboxPage.tsx`
- Modify: `apps/admin/src/conversations/ConversationInboxPage.test.tsx`
- Modify: admin conversation API response/repository typing to include nullable `customerId` for the selected conversation.
- Test: admin conversation API projection returns `customerId` without exposing other customer PII.
- Modify: customer reconciliation contract/service/repository/API to allow requesting only orders, only conversations, or both; a one-type page must not query the other type.
- Create: `apps/admin/src/customers/CustomersPage.test.tsx`
- Create: `apps/admin/src/customers/CustomerDetailPage.test.tsx`

**Interfaces:**
- Directory filters: `Todos`, `Compradores`, `Sin compra acreditada`, and `Revisar identidad`.
- A distinct `Pendientes por revisar` view lists historical orders and conversations without a resolved customer ID; each type has independent “cargar más” pagination until exhausted. It offers navigation to the existing record only, with no link/merge action.
- Conversation context links to the selected customer only when `customerId` is resolved.
- Detail view links each historic order and conversation to existing routes.

- [x] Add tests for segment filters, search, empty/error/loading states, customer history links, review state, missing customer ID, and read-only unlinked-record queue pagination for both record types; when loading more one type, preserve the other type's cursor, request only that type from the API, and do not append duplicate rows from the other list. Invalidate appended pages after every successful refetch, even when the first page is structurally unchanged; reject late load-more responses based on the base-query fetch epoch.
- [x] Test that any successful reconciliation refetch after loading additional pages invalidates appended pages even when the first page is structurally identical, preventing stale rows from remaining authoritative.
- [x] Run focused admin tests and confirm failure.
- [x] Implement typed API client and paginated directory with mobile-friendly controls and accessible labels.
- [x] Implement customer detail with contact summary, derived segment, order statuses, and conversation history.
- [x] Add navigation from conversations to customer detail and back while preserving selected conversation IDs.
- [x] Add an authenticated, accessible unlinked-record queue with independent “cargar más” controls, preserving the other queue's cursor, requesting only the selected type from the API, and ignoring exhausted-list data; clear copy that identity is unresolved, and links to existing order/conversation detail routes without implying a match.
- [x] Ensure there is no edit control for derived purchase status, no Ads export action, and no consent state shown as granted without evidence.
- [x] Rerun focused tests, admin typecheck, and E2E tests for navigation/filter behavior.
- [x] Commit as `feat: add customer directory and order history` (subsequent fixes: `fdeb6b0`, `f1ff4c3`; final segment/date fixes are in Task 5).

### Task 5: Verify privacy, historical reconciliation, and release behavior

**Files:**
- Create: `apps/api/drizzle/0039_nullable_anonymized_customer_phone.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Modify: `apps/api/src/database/schema/customers.ts`
- Modify: `packages/contracts/src/customers.ts`
- Modify: `apps/api/src/modules/privacy/postgres-retention-data-store.ts`
- Modify: `apps/api/src/modules/privacy/retention-service.ts`
- Modify: `apps/admin/src/customers/CustomersPage.tsx`
- Modify: `apps/admin/src/customers/CustomerDetailPage.tsx`
- Test: `apps/api/test/retention.integration.test.ts`
- Test: `apps/api/test/customer-repository.integration.test.ts`
- Test: `apps/admin/src/customers/CustomersPage.test.tsx`
- Test: `apps/admin/src/customers/CustomerDetailPage.test.tsx`
- Modify: `apps/api/test/database-migrations.integration.test.ts`
- Modify: `docs/compliance/pii-inventory.md`
- Create: `docs/superpowers/specs/2026-09-23-kairo-customer-anonymization-design.md`
- Modify: `docs/release/definitive-closeout-evidence.md` only if release evidence format requires a new note.

- [ ] Reconcile a sanitized sample: total historic conversations/orders, linked/unlinked counts, ambiguous contacts, and duplicate normalized-phone candidates.
- [ ] Write a PostgreSQL integration regression test proving explicit customer anonymization clears the linked customer profile's name, phone, and consent evidence; retains its stable UUID and operational history; redacts linked orders/conversations even when their stored phone changed; and does not let a future inbound contact resolve to the anonymized profile. Run it and confirm the current implementation fails for the missing profile cleanup.
- [ ] Allow `customers.normalized_phone` to be null only for anonymized profiles while keeping non-null phones normalized and unique; update the generated migration journal and validate upgrade behavior from the previous schema.
- [ ] Make customer lookup, detail contracts, and directory/detail UI represent a cleared phone as unavailable without substituting an order/conversation phone or enabling identity matching.
- [ ] Extend the existing explicit data-subject anonymization operation to find linked records by stable customer ID plus unlinked legacy records by phone; clear profile name/phone and consent evidence, reset consent to `unknown`, mark identity for review, and preserve operational records and stable foreign keys.
- [ ] Update the PII inventory to identify the customer profile fields, the explicit anonymization relationship, and that no automatic customer-profile retention duration is approved; do not invent a legal retention period or enable automatic execution.
- [ ] Confirm marketing consent remains `unknown`, no endpoint can export customer PII, and no outbound/ads integration consumes the customer segment.
- [ ] Verify role boundaries and that no UI response leaks full consent proof or unnecessary address data.
- [ ] Run `pnpm verify` from a clean worktree after both plans are implemented.
- [ ] Review migration rollback expectations, full diff, `git diff --check`, and all open release gates.
- [ ] Commit the final verification/documentation as `docs: record customer identity verification`.
