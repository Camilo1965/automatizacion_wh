# Shipping Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make cash-on-delivery quotes, guide creation, PDF recovery and human review operational from the protected owner panel.

**Architecture:** Keep 99envíos behind `NinetyNineEnviosClient`; PostgreSQL owns quote versions, selection and guide state. HTTP routes only orchestrate authenticated owner actions. The WhatsApp sales service obtains a valid quote before presenting a confirmable summary.

**Tech Stack:** TypeScript, Fastify, PostgreSQL/Drizzle, Zod, React, TanStack Query, Vitest and Playwright.

## Global constraints

- COP amounts are nonnegative integers; total equals product subtotal plus freight, COD charge and surcharge.
- A quote expires 30 minutes after persistence; expired or changed quotes require a new summary and confirmation.
- A carrier rule for the exact destination DANE code wins when that carrier is available; otherwise Envia is recommended, then the lowest complete landed cost.
- Only a created guide can request a PDF. A PDF request never creates a guide.
- Timeouts after pre-shipment submission are `uncertain` and never retried automatically.
- No credentials, raw provider payloads, destination addresses or PDF files enter Git or application logs.

### Task 1: Persist quote alternatives and PDF metadata

**Files:** Modify `apps/api/src/database/schema.ts`; create migration `apps/api/drizzle/0012_shipping_quotes.sql`; update Drizzle metadata; create `apps/api/test/shipping-quotes-migration.integration.test.ts`.

**Produces:** `shipping_quotes` with `order_id`, `draft_version`, carrier/service, COP components, estimate, timestamps, `recommended` and `selected`; PDF metadata columns on `shipping_guide_jobs`.

- [ ] Write migration RED test that upgrades a database containing `0011`, preserves orders/jobs, verifies COP checks, one selected quote per order and PDF columns.
- [ ] Run `pnpm --filter @camila/api test:integration -- shipping-quotes-migration.integration.test.ts`; expect missing table.
- [ ] Define schema and generate migration. Use a partial unique index for `selected = true`; ensure quote expiry is after creation.
- [ ] Re-run migration test, `pnpm db:migrate`, and `pnpm db:generate`; expect green and no subsequent schema changes.
- [ ] Commit `feat: persist shipping quotes`.

### Task 2: Quote domain and strict contracts

**Files:** Modify `packages/contracts/src/index.ts`; create `apps/api/src/modules/shipping/shipping-quote-service.ts`, `apps/api/src/modules/shipping/postgres-shipping-quote-repository.ts`; tests under `packages/contracts/test/` and `apps/api/test/`.

**Produces:** `createQuotes(orderId)`, `selectQuote(orderId, quoteId)`, `getShipping(orderId)`, carrier rules by DANE municipality and public strict schemas.

- [ ] RED: successful partial carrier response; an active exact DANE carrier rule wins even when dearer; without it Envia wins; otherwise lowest `freight + COD + surcharge`; all failures; 429; expired quote; changing selected quote invalidates summaries.
- [ ] Implement provider normalization and a transactional repository. Obtain reference value and destination from the authoritative order; enforce the DANE eight-digit value before calling the provider.
- [ ] Add a 30-minute `expiresAt`; selection is atomic and only allowed for the current draft version. Persist at most one active carrier rule for each eight-digit DANE code.
- [ ] Run focused unit/integration tests, lint and typecheck.
- [ ] Commit `feat: quote shipping alternatives`.

### Task 3: Include a selected quote in immutable summaries

**Files:** Modify `apps/api/src/modules/orders/order-types.ts`, `postgres-order-repository.ts`, `order-service.ts`, shared summary schemas and tests.

**Produces:** summaries with immutable shipping breakdown, chosen carrier and final COD total.

- [ ] RED: summary without selected valid quote fails `shipping_quote_required`; expired quote fails `shipping_quote_expired`; a changed selection makes old summary stale.
- [ ] Update summary generation and confirmation transaction to lock the order and selected quote, validate its current draft version/expiry, and enqueue exactly one guide job with `quote_id`.
- [ ] Keep the existing no-shipping draft summary only for incomplete checkout; WhatsApp and owner confirmation require the shipping-inclusive summary.
- [ ] Repeat last-pair confirmation concurrency test three times; run all order integrations.
- [ ] Commit `feat: confirm orders with shipping quotes`.

### Task 4: Secure owner shipping API

**Files:** Modify `apps/api/src/routes/admin/index.ts`, `apps/api/src/app.ts`, mappers and redaction; create `apps/api/test/admin-shipping-http.integration.test.ts`.

**Produces:** quote, selection, shipping detail, PDF generation/download and uncertain-review routes from the approved design.

- [ ] RED each route for anonymous `401`, absent Origin `403`, malformed body `400`, missing order/quote `404`, stale data `409`, and strict response schemas.
- [ ] Inject the shipping service only when configuration is present. Disabled configuration returns a stable `shipping_not_configured` response without exposing settings.
- [ ] Stream PDFs with `Content-Type: application/pdf`, private cache policy, ETag from SHA-256, and no filesystem path in response.
- [ ] Add logger-capture test proving customer data, headers and PDF bytes are redacted.
- [ ] Commit `feat: expose secured shipping operations`.

### Task 5: PDF persistence and guide recovery worker

**Files:** Create a dedicated PDF storage module; modify guide repository/worker and `99envios-client` tests.

**Produces:** idempotent `fetchGuidePdf(jobId)` that validates PDF, atomically stores it under a generated key and records digest/size/time.

- [ ] RED: PDF retry uses stored valid file; missing/invalid PDF leaves guide created with error; uncertain guide cannot fetch; guide creation is never called by PDF path.
- [ ] Implement generated server-side key validation, temporary write/rename and rollback on metadata failure.
- [ ] Add `reviewUncertain` that only records the owner-verified external number/status; it cannot return a job to pending.
- [ ] Run worker/repository tests plus integration suite.
- [ ] Commit `feat: recover guide PDFs safely`.

### Task 6: Owner interface and WhatsApp total

**Files:** Modify `apps/admin/src/api/orders-api.ts`, `apps/admin/src/orders/OrderDetailPage.tsx`, styles and tests; modify WhatsApp sales service tests.

**Produces:** quote button, recommendation, choice control, expiry/error state, guide status, PDF action and human-review form; WhatsApp total with carrier and shipping amount.

- [ ] RED React tests for recommendation, manual selection, expiry, disabled confirmation, PDF error/retry and uncertain review; add sales-flow integration test for a shipping-inclusive summary.
- [ ] Implement typed API client with Zod parsing; invalidate order/quote queries after each mutation. Keep PDF download as a browser blob without persisting browser state.
- [ ] Render values using `Intl.NumberFormat('es-CO', { currency: 'COP' })`; use accessible error and busy states.
- [ ] Run admin unit, API integration, E2E and build.
- [ ] Commit `feat: operate shipping from owner panel`.

### Task 7: Controlled acceptance and closeout

**Files:** Create `docs/phase-5-closeout.md`; modify `ROADMAP.md`, `README.md`, `docs/PILOT.md`; add E2E coverage.

- [ ] E2E: create draft → quote → retain/change option → new summary → confirm → created guide → download PDF; uncertainty stays non-retryable.
- [ ] Run `pnpm verify`, `pnpm audit --prod`, `git diff --check`, integration concurrency ×3 and relevant E2E ×3.
- [ ] With authorized credentials, execute exactly one controlled quote/pre-shipment/PDF and record only sanitized evidence: timestamp, order id, selected carrier, guide number and pass/fail.
- [ ] Update roadmap checkboxes only from that evidence, commit `docs: close shipping operations phase`, and require clean status.
