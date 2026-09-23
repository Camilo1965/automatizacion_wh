# Shipping Settings and Guide PDF Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict shipping-policy configuration to owners and make PDF persistence safe when the database acknowledgment is ambiguous.

**Architecture:** Keep operational shipping behind `shipping:operate`, add an owner-only `shipping:manage` capability for policy writes, and pass separate authenticators to the shipping routes. On PDF attachment failure, query the job before cleanup and preserve any object whose reference cannot be ruled out.

**Tech Stack:** TypeScript, Fastify, Vitest, PostgreSQL/Drizzle.

## Global Constraints

- No new runtime dependencies.
- Operators retain quote, selection, and guide operations.
- Only owners mutate global or municipal shipping policy.
- Never delete stored PDF data while a database reference may exist.
- Tests use the current isolated test setup and must not target the real local database.

---

### Task 1: Restrict shipping policy writes to owners

**Files:**
- Modify: `apps/api/src/modules/auth/capabilities.ts`
- Modify: `apps/api/src/routes/admin/index.ts`
- Modify: `apps/api/src/routes/admin/shipping.ts`
- Test: `apps/api/test/capabilities.test.ts`
- Test: `apps/api/test/admin-shipping-http.test.ts`

**Interfaces:**
- `Capability` gains `'shipping:manage'`.
- `shipping:manage` belongs to owners only; `shipping:operate` remains available to owners and operators.
- Shipping routes receive `authenticate` for operations and `manageShipping` for policy mutations.

- [x] Add assertions that owner has `shipping:manage`, operator lacks it, and operator still has `shipping:operate`.
- [x] Add HTTP assertions that an operator can read preferences and gets 403 on carrier-rule, global-policy, and municipal-policy mutations.
- [x] Run the focused authorization tests and confirm the new authorization assertion fails before implementation.
- [x] Add the capability, pass a separate owner-only authenticator, and use it for `PUT /shipping/carrier-rules`, `PATCH /shipping/preferences`, `POST /shipping/rules`, `PATCH /shipping/rules/:localityCode`, and `POST /shipping/rules/:localityCode/deactivate`.
- [x] Re-run the focused tests and confirm owner writes and operator policy writes behave as expected.

### Task 2: Preserve PDF objects after ambiguous database errors

**Files:**
- Modify: `apps/api/src/modules/shipping/shipping-guide-service.ts`
- Test: `apps/api/test/shipping-guide-service.test.ts`

**Interfaces:**
- No public API changes.
- `Repository.findByOrderId` remains the source of truth for whether a `StoredGuidePdf.storageKey` is referenced.

- [x] Add a test where `attachPdf` persists the storage key and then throws; confirm it currently rejects and deletes the referenced object.
- [x] Run the focused service test and confirm the new scenario fails for the expected reason.
- [x] Re-read the guide job after `attachPdf` errors. Return the downloaded bytes when its key matches; if a different winner key exists, safely clean up this unreferenced object and read the winner; delete and rethrow only after a successful read confirms no reference. If the read fails, preserve the object and rethrow the original attach error.
- [x] Re-run the targeted test and complete `shipping-guide-service.test.ts` suite, including the existing concurrent-winner case.

### Task 3: Verify and integrate

**Files:**
- Verify only; do not alter integration credentials or production data.

- [x] Start only the disposable `postgres-test` service before integration tests; never redirect tests to `.env`'s local business database.
- [x] Run `pnpm verify`; secret scanning from the Windows-linked worktree was invalid and is pending rerun from the normal checkout.
- [ ] Request a read-only code review of the completed diff and resolve any important findings.
- [ ] Commit the approved existing UI/E2E changes together with these fixes and the design/plan documents, fast-forward `main`, and push `main` only after verification succeeds.
- [ ] Back up and migrate the real local database, create the requested owner login, and start the UI/API on loopback without starting the outbound worker.
