# KAIRO Customer Identity and Segmentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each customer contact a stable KAIRO identifier, connect it to conversations and orders, show purchase history, and filter contacts by evidence of a delivered purchase.

**Architecture:** Add a UUID customer contact table and nullable foreign keys to existing orders and WhatsApp conversations. Link new records through normalized phone lookup, backfill only reconcilable historical data, derive buyer status from order facts, and expose authenticated list/detail APIs for a small customer directory in the admin application.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, PostgreSQL migrations, Zod contracts, React, TanStack Query, Vitest, Playwright.

## Global Constraints

- `customer_id` is the stable primary identity; a phone number is a contact field and a reconciliation key.
- A buyer has an order marked `delivered` that is not `returned`; confirmed or dispatched orders alone do not qualify.
- There is no payment evidence in the present data model; do not invent or infer a paid state.
- Unknown marketing consent is the default. This MVP has no Ads export, audience sync, or promotional messaging.
- Ambiguous shared-phone contacts are marked for review and excluded from future marketing audiences.
- Do not silently merge profiles when contact details change.
- All customer APIs require existing admin authentication and apply the least-privilege PII patterns in the app.

---

### Task 1: Add the customer contact data model and safe backfill

**Files:**
- Create: `apps/api/src/database/schema/customers.ts`
- Modify: `apps/api/src/database/schema/index.ts`
- Modify: `apps/api/src/database/schema/orders.ts`
- Modify: `apps/api/src/database/schema/whatsapp.ts`
- Create: `apps/api/drizzle/0036_kairo_customer_contacts.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Test: `apps/api/test/database-migrations.integration.test.ts`

**Interfaces:**
- `customers`: UUID ID, display name, normalized phone, marketing consent state/evidence fields, needs-review flag, timestamps.
- `sales_orders.customer_id` and `whatsapp_conversations.customer_id`: nullable during safe migration, FK-protected, indexed.

- [ ] Write migration integration fixtures for one unambiguous phone, a phone with differing names, missing/invalid phones, and repeat execution.
- [ ] Run `pnpm --filter @camila/api exec vitest run --project integration test/database-migrations.integration.test.ts` and confirm the new assertions fail.
- [ ] Add a migration that creates the customer table, adds nullable customer IDs, normalizes Colombian phone numbers using the project’s existing rules, and groups only valid contact data.
- [ ] Mark profiles with differing customer names on a shared phone as `needs_review`; do not mark consent as granted during backfill.
- [ ] Link conversations and orders only when deterministic; leave unresolved records unlinked for operator review.
- [ ] Add indexes, check constraints, consent fields defaulting to `unknown` with null evidence, and audit-safe timestamps; do not make `customer_id` non-null in this release.
- [ ] Rerun migration tests, verify counts and associations, and run the migration a second time to prove idempotency.
- [ ] Commit as `feat: add stable customer contact identities`.

### Task 2: Link new WhatsApp conversations and bot orders to customer IDs

**Files:**
- Modify: `apps/api/src/modules/conversations/postgres-conversation-repository.ts`
- Modify: `apps/api/src/modules/conversations/postgres-conversation-repository.ts`
- Modify: `apps/api/src/modules/conversations/whatsapp-sales-service.ts`
- Modify: `apps/api/src/modules/orders/order-types.ts`
- Modify: `apps/api/src/modules/orders/postgres-order-repository.ts`
- Modify: `apps/api/src/modules/conversations/whatsapp-sales-service.ts`
- Test: `apps/api/test/conversation-repository.integration.test.ts`
- Test: `apps/api/test/orders.integration.test.ts`

**Interfaces:**
- `PostgresConversationRepository.receive()` resolves or creates a customer contact by normalized phone and stores `customerId` on the conversation.
- `CreateOrderInput.customerId?: string | null` permits bot orders to explicitly inherit the conversation contact; manual orders may resolve by phone when safe.

- [ ] Add tests that repeat inbound messages for one phone reuse the same customer ID and create distinct IDs for different phones.
- [ ] Add tests that bot orders inherit the conversation ID and no customer is silently attached when phone resolution is ambiguous.
- [ ] Run focused repository/order integration tests and confirm failure.
- [ ] Implement transactional get-or-create with race-safe uniqueness on the normalized contact key; handle unique conflict by rereading the committed profile.
- [ ] Persist customerId when creating conversations and their bot orders, preserving the current order and transcript behavior.
- [ ] Keep manual order creation compatible; resolve a profile only where an unambiguous contact match exists.
- [ ] Rerun focused integration tests and the relevant conversation/bot-flow tests.
- [ ] Commit as `feat: link conversations and orders to customer contacts`.

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

- [ ] Test the buyer predicate: delivered qualifies; draft, confirmed, dispatched, cancelled, and returned alone do not; another valid delivered order keeps the customer a buyer after one return.
- [ ] Test 401 unauthenticated access, 404 unknown customer, strict query validation, stable cursor pagination, and PII projection.
- [ ] Run focused contract/service/API tests and confirm failures.
- [ ] Implement queries with parameterized search, bounded page size, stable sort, and no raw consent evidence in list responses.
- [ ] Make `needs_review` visible as a separate segment, excluded from “buyers” and “sin compra acreditada” filters until reviewed.
- [ ] Register routes with existing admin authentication and ensure no write route or export route is introduced.
- [ ] Rerun focused API tests and typecheck contracts/API.
- [ ] Commit as `feat: add customer history and purchase filters API`.

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
- Create: `apps/admin/src/customers/CustomersPage.test.tsx`
- Create: `apps/admin/src/customers/CustomerDetailPage.test.tsx`

**Interfaces:**
- Directory filters: `Todos`, `Compradores`, `Sin compra acreditada`, and `Revisar identidad`.
- Conversation context links to the selected customer only when `customerId` is resolved.
- Detail view links each historic order and conversation to existing routes.

- [ ] Add tests for segment filters, search, empty/error/loading states, customer history links, review state, and missing customer ID.
- [ ] Run focused admin tests and confirm failure.
- [ ] Implement typed API client and paginated directory with mobile-friendly controls and accessible labels.
- [ ] Implement customer detail with contact summary, derived segment, order statuses, and conversation history.
- [ ] Add navigation from conversations to customer detail and back while preserving selected conversation IDs.
- [ ] Ensure there is no edit control for derived purchase status, no Ads export action, and no consent state shown as granted without evidence.
- [ ] Rerun focused tests, admin typecheck, and E2E tests for navigation/filter behavior.
- [ ] Commit as `feat: add customer directory and order history`.

### Task 5: Verify privacy, historical reconciliation, and release behavior

**Files:**
- Modify: `apps/api/test/database-migrations.integration.test.ts`
- Modify: `apps/api/test/customer-repository.integration.test.ts`
- Modify: `apps/admin/src/customers/CustomersPage.test.tsx`
- Modify: `docs/compliance/pii-inventory.md`
- Modify: `docs/release/definitive-closeout-evidence.md` only if release evidence format requires a new note.

- [ ] Reconcile a sanitized sample: total historic conversations/orders, linked/unlinked counts, ambiguous contacts, and duplicate normalized-phone candidates.
- [ ] Confirm marketing consent remains `unknown`, no endpoint can export customer PII, and no outbound/ads integration consumes the customer segment.
- [ ] Verify role boundaries and that no UI response leaks full consent proof or unnecessary address data.
- [ ] Run `pnpm verify` from a clean worktree after both plans are implemented.
- [ ] Review migration rollback expectations, full diff, `git diff --check`, and all open release gates.
- [ ] Commit the final verification/documentation as `docs: record customer identity verification`.
