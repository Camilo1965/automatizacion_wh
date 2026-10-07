# KAIRO audit fixes Implementation Plan

> Execute the approved audit closeout task by task with regression tests and a final whole-change review.

**Goal:** Correct F01–F17 from `docs/audits/2026-10-06-kairo-mvp-quality-audit.md` and make local MVP checks reproducible.

**Architecture:** Preserve the existing Fastify/PostgreSQL services and React interface. Recover interrupted business effects through persisted continuations and transactional guards; display operational state from actual data; keep permission enforcement in the server and reflect it in the UI.

**Tech Stack:** TypeScript, Fastify, Drizzle/PostgreSQL, React, Vitest, Playwright, pnpm, local Docker.

## Global constraints

- Work in the existing `codex/kairo-whatsapp-ux` worktree. Preserve the primary checkout's login edits and merge them only after verification.
- Guides stay downloadable by operators in KAIRO, not automatically sent through WhatsApp.
- Buyers are credited only on paid/delivered business evidence; preserve current delivered behavior.
- No GitHub CI. Test against disposable databases and synthetic external services; never use production provider credentials in automated tests.
- A passed local test is not evidence of a live WhatsApp or 99envíos transaction.
- Preserve uncertain guide jobs for reconciliation; never blindly create a second shipment.

## Task 1 — interrupted confirmation and quote recovery (F01, F02)

Files: conversation repository/service, corresponding unit and PostgreSQL integration tests.

- [x] Add regressions: persist confirmation receive, interrupt before transition, replay same message; interrupt after order confirmation; expire quote and fail refresh.
- [x] Persist/replay the continuation with version guards and idempotent business effects.
- [x] On failed refresh invalidate the old summary and hand off to human with one alert and useful reply; assert no reservation/guide.
- [x] Verify normal confirmation, duplicates, changed draft, and interruption cases against PostgreSQL.

## Task 2 — security and truthful operations (F03, F04, F05, F16)

Files: auth service/repository/routes; backup metrics/scripts; runtime/worker/integration health; configuration/app/proxy documentation and related tests.

- [x] Reproduce setup overwriting active MFA; reject enrollment on an enabled factor atomically and verify its secret and enabled state remain unchanged.
- [x] Derive backup age from success timestamp at read time; record failed latest attempt explicitly and test failure/recovery with a controlled clock.
- [x] Replace constant scheduler health with persisted worker heartbeat and expiry; test absent, stale, running, and stopped workers.
- [x] Configure explicit trusted proxy addresses, defaulting to no trust, and verify per-client rate limiting plus spoofed-header rejection.

## Task 3 — operational UI and inventory contract (F06, F08, F10–F14)

Files: inventory contracts/history; global search service/UI; bot editor; operational labels; conversation UI; shipping preferences; privacy page; API error mapping.

- [x] Cover dispatch/return inventory reasons and visible order-ID search in regression tests.
- [x] Complete command labels and real-state translations; localize unexpected errors with actionable text.
- [x] Constrain the conversation viewport, scroll to latest on opening, preserve historical reading and offer jump-to-latest.
- [x] Show shipping configuration read-only to operators with owner guidance; keep server permissions authoritative.
- [x] Present privacy in business Spanish with technical details under an advanced disclosure.
- [x] Prefill stock from current quantity and verify desktop/mobile behavior.

## Task 4 — queue correctness, simulator and safe guide recovery (F07, F09, F15)

Files: conversation admin repository; bot simulator/tests; shipping guide state/repository/service/routes/contracts and guide review UI.

- [x] Assert list/get pending counts for two conversations; qualify the correlated outer column explicitly.
- [x] Simulate collected customer/destination/product values, reject unavailable references and hand off after repeated invalid locality; assert refreshed summary after edits.
- [x] Add an explicit audited retry only for confirmed provider rejection with no guide identifier; preserve uncertain/reconciled/created cases.
- [x] Prove duplicate retry requests yield one eligible job and one shipment creation using fake provider plus real database.

## Task 5 — reproducible test environment and final verification (F17 and audit test failures)

Files: E2E env sanitizer/config/setup; integration fixtures; migration tests; final verification record.

- [x] Restrict inherited E2E environment, pass the loopback host/port and isolated env directory, and reject reuse of arbitrary running servers; test credential exclusion and required runtime variables.
- [x] Uppercase generated catalog codes and clean every temporary migration database using tracked names with afterEach cleanup.
- [x] Run formatting, strict lint, typecheck, all unit tests, disposable PostgreSQL/MinIO integrations, E2E, build and bundle budget. Resolve failures by root cause.
- [x] Independently review changes and record closed findings, evidence, and any external launch requirements.
- [ ] Integrate the preserved login changes and unify verified work with main under the user's standing authorization when all required checks pass.

## Execution record

- 2026-10-06: User explicitly requested fixing the audit. Existing audit is the approved scope; implementation started. Baseline has only untracked audit artifacts in the worktree and preexisting login changes in the primary checkout.
- 2026-10-06: Fixed F01–F17 and added regressions. Final local verification: 83 contract + 454 API + 103 admin unit tests; 206 PostgreSQL/MinIO integration tests across 43 files; 32 E2E passed, 1 webhook-dependent test skipped; format, strict lint, typecheck, production build, and bundle budget passed. No live WhatsApp/99envíos calls were made. E2E surfaced and fixed missing HOST/PORT allowlisting, unsupported Vite `--envDir`, an obsolete simulator selector, and destructive-text contrast below WCAG AA.
