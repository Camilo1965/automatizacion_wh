# WhatsApp Sales Flow Implementation Plan

> **For agentic workers:** Execute task-by-task with TDD; each task ends with focused tests and a commit.

**Goal:** Sell one shoe reference through WhatsApp: welcome, size, photos, reference, delivery data, owner-visible confirmation, stock reservation, and one 99envíos guide attempt.

**Architecture:** Meta webhook persists inbound events. A conversation aggregate serializes state per phone. A database outbox sends text/images through the Cloud API and checks human takeover before delivery. Existing catalog and order services remain the source of stock, price, and reservation truth. A separate 99envíos adapter creates and records a single guide attempt after confirmation.

## Global rules

- Use WhatsApp Cloud API credentials only from untracked `.env`.
- Never log customer details, message bodies, access tokens, app secrets, signatures, or addresses.
- One conversation has one active order; one order has one reference, size, and quantity.
- Only confirmed orders reserve stock. 99envíos creation is idempotent and never retried automatically after an uncertain outcome.
- A human takeover blocks queued bot sends immediately before dispatch.
- Every public behavior has a RED test before implementation.

## Task 1: Conversation persistence and serialization

**Files:** create migrations and `modules/conversations/*`; extend Drizzle schema; create PostgreSQL integration tests.

- Create `whatsapp_conversations` keyed by customer phone: state, mode (`bot|human`), selected size/reference/order, active menu version, invalid attempts, timestamps.
- Create `whatsapp_conversation_events` with inbound message ID unique and ordered event sequence.
- Lock the conversation row while handling each inbound message; use an advisory lock only when creating a first conversation.
- Tests: first message creates `awaiting_size`; duplicate event produces no second transition; concurrent messages remain ordered; human mode blocks bot transition.

## Task 2: Meta outbound adapter and transactional outbox

**Files:** create `modules/whatsapp/meta-client.ts`, `outbound-repository.ts`, `outbox-worker.ts`; migrations; unit tests with fetch doubles.

- Add `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and `WHATSAPP_GRAPH_API_VERSION` configuration validation.
- Persist outbound text/image jobs with idempotency key, attempt status, response ID, expiration, and error code.
- Implement Cloud API text send and media upload/send. Upload local catalog photo bytes; never expose local file paths to Meta.
- Worker claims one job transactionally, checks conversation mode/window, sends once, records Meta ID or deterministic failure.
- Tests: proper Authorization header; body shape; failed send stays visible; same job cannot be sent twice concurrently; human takeover cancels send.

## Task 3: Welcome, commands, and size state

**Files:** create conversation state machine/parser/service; route wiring; unit and HTTP integration tests.

- First customer message queues Spanish welcome: `¡Hola! 😊 ¿Qué talla buscas?` and moves to `awaiting_size`.
- Parse whole and half sizes using existing catalog normalization.
- Commands: `volver`, `cambiar talla`, `cancelar`, `asesora`; unknown input increments counter and after two failures offers the owner.
- Tests: 37 and 37.5 accepted, unavailable size offers retry, malformed input never selects a product, commands preserve/invalidate correct selections.

## Task 4: Catalog photos and menu-bound reference selection

**Files:** extend catalog read adapter; create menu tables/service; media tests; end-to-end webhook tests.

- Query `listAvailableForConfirmedSize`; create immutable menu options for up to four references per batch.
- Queue one real photo plus caption containing reference, model, color, price, and size for each result.
- Support `más modelos` without repeats. Store sent option IDs and require response to match the active menu/reference.
- Tests: size 37 returns only active/photo/available 37 items; 38 never leaks; second page no duplicates; reply to expired menu reprompts; photo upload uses stored JPEG/PNG.

## Task 5: Selection, order draft, and delivery data

**Files:** conversation-to-order adapter; delivery field parsers; owner API detail additions; integration tests.

- Selecting reference creates/updates an existing draft through `OrderService`; default quantity is one.
- Collect name, phone, department, locality, address, optional notes one field at a time; show correction command.
- Resolve locality only against imported localities and snapshot it in the draft.
- Tests: no draft from invalid reference; changing size/reference invalidates stale draft data; incomplete data cannot create summary; resumed conversation rereads price/stock.

## Task 6: Summary, explicit confirmation, and reservation

**Files:** confirmation menu service; order adapter; integration and concurrency tests.

- Ask for explicit `Confirmar` tied to order ID and summary version; `Cancelar` cancels draft safely.
- Generate summary with current catalog price; confirm using a stable inbound-message idempotency key.
- On stale summary or stock conflict, explain and return to valid selection.
- Tests: double confirmation reserves once; two customers for last pair produce one confirmation; changed price demands a new summary; owner sees full audit.

## Task 7: Owner takeover and operation panel

**Files:** protected admin conversation routes/pages; E2E tests.

- List/filter conversations, messages, pending sends, current state, active order, and failures.
- Owner can take/release control; take control atomically cancels pending bot jobs.
- Tests: unauthenticated requests fail; takeover before worker send prevents delivery; release restores the correct next prompt only after a new customer message.

## Task 8: 99envíos adapter and guide lifecycle

**Files:** `modules/shipping/99envios-*`; migrations for quote/guide/jobs; contract tests with recorded anonymized fixtures.

- Isolate authentication, quote, create-guide, status, and PDF download behind an interface.
- Persist quote version and selected carrier. Create one active guide job per confirmed order.
- Mark timeout after request as `uncertain`; require owner review before retry. Save guide number and PDF independently.
- Tests: duplicate confirmation creates one job; quote expiry requires fresh quote; PDF retry does not create another guide; uncertain request never auto-retries.

## Task 9: Acceptance, deployment, and pilot

- Add end-to-end test: inbound welcome -> 37 -> four photos -> selection -> data -> summary -> confirmation.
- Add real local test using Meta test number with fictitious customer data; verify no duplicate outbound responses.
- Complete VPS HTTPS, backups, monitoring, secrets, and recovery plan before production number activation.
- Pilot ten references, owner monitors every conversation and guide; expand only after acceptance criteria pass.

## Verification per task

Run focused RED/GREEN tests first, then `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, affected integration tests, and `git diff --check`. Before each phase boundary run `pnpm verify`, `pnpm audit --prod`, and a clean `git status --short`.
