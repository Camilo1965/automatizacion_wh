# KAIRO Definitive Closeout Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with test-driven development and a review checkpoint after every task. If your environment provides `subagent-driven-development` or `executing-plans`, use one of them; otherwise follow every checkbox directly and do not collapse tasks.

**Goal:** Close the verified gaps left after commits `4c8bb5f..f72c875` and make KAIRO production-ready within the approved single-business scope, while preserving the currently green baseline.

**Architecture:** Keep the TypeScript monorepo, React admin, Fastify API, PostgreSQL durable jobs, separate HTTP/worker entrypoints and native inbox. Add real authorization, operable MFA, S3-compatible storage, complete production services, observable worker health and enforceable local release gates without rewriting working domains.

**Tech Stack:** Node.js 24.14.1, pnpm 11.19.0, TypeScript 6, React 19, Vite 8, Fastify 5, Drizzle, PostgreSQL 18, Vitest, Playwright, Docker Compose and Caddy.

## Global Constraints

- Product name visible to users: **KAIRO Operaciones**.
- Scope: one Colombian footwear business, one WhatsApp number and COD operation.
- Do not introduce SaaS tenancy, Chatwoot, Redis, Kubernetes, generative AI or automatic Treinta integration.
- Treinta remains a controlled import and manual closeout workflow.
- Do not implement dark mode.
- PostgreSQL remains the source of truth and durable queue.
- WhatsApp Cloud API and 99envíos must continue behind adapters.
- Preserve all current commits and user work. Never use destructive Git reset or discard changes.
- Do not push, deploy, create real guides or send real messages without explicit user authorization.
- Never commit credentials, `.env.prod`, production data, backup files or evidence containing personal data.
- A documentation file, checklist or mocked test does not satisfy a runtime requirement.
- Every behavior change starts with a failing test and ends with focused tests plus the relevant aggregate gate.
- Do not increase test timeouts or add retries until the root cause is demonstrated.
- Keep public contracts compatible unless a migration and consumer update are in the same task.
- Each completed task gets one focused commit. Do not combine unrelated refactors.
- Human-only actions must remain marked `[HUMANO]` with exact instructions and evidence required.

---

## Cursor execution prompt

Copy the remainder of this document into Cursor, or instruct Cursor to read and execute this file from the repository root.

### Mission

You are closing KAIRO for professional production use. Do not trust previous “completed” labels. Inspect the current implementation, reproduce the baseline and execute all automatable work below. Continue until every automatable acceptance criterion is evidenced. When a step needs credentials, legal approval, DNS, a real shipment, production infrastructure or personal data, stop only that step, label it `[HUMANO]`, provide the exact command or UI action the user must perform, and continue any independent automatable work.

The governing design is:

`docs/superpowers/specs/2026-09-21-kairo-production-hardening-design.md`

The repository currently has six local commits beyond `origin/main`. Preserve them. Start from the current `HEAD`; do not reset to `origin/main`.

### Verified starting evidence

At the last independent audit:

- `pnpm verify:local` passed.
- 70 contract, 213 API unit, 50 admin unit, 109 integration and 22 E2E tests passed.
- `pnpm audit --prod` reported no known vulnerabilities.
- `docker compose --env-file .env.prod.example -f compose.prod.yaml config --quiet` passed.
- The admin, API and worker Docker images built.
- The worktree was clean.
- ESLint still emitted four Fast Refresh warnings.
- Production, real integrations, pilot and acceptance had no real evidence.

Do not claim those results are still valid. Re-run the commands and save fresh evidence.

## Task 1: Protect and inventory the baseline

**Files:**

- Read: `docs/superpowers/specs/2026-09-21-kairo-production-hardening-design.md`
- Read: `docs/acceptance/kairo-functional-matrix.md`
- Read: `docs/superpowers/plans/2026-09-21-kairo-production-hardening-master.md`
- Create: `docs/release/definitive-closeout-evidence.md`

**Produces:** A truthful execution ledger with command, timestamp, commit SHA, exit code, totals and remaining gaps.

- [ ] Record `git status --short --branch`, `git log --oneline -10` and `git rev-parse HEAD`.
- [ ] If no dedicated branch exists, create `cursor/kairo-definitive-closeout` from the current `HEAD`. Do not move or rewrite `main`.
- [ ] Run `pnpm install --frozen-lockfile`.
- [ ] Run `pnpm verify:local` and record every test total and warning.
- [ ] Run `pnpm audit --prod`.
- [ ] Run production Compose validation and all three Docker builds.
- [ ] Record every design requirement as `verified`, `failed`, or `[HUMANO]`; do not use “completed” without evidence.
- [ ] Commit only the evidence ledger if it contains no secrets or personal data.

**Gate:** The starting SHA and full verification results are reproducible. Any regression is diagnosed and corrected before Task 2.

## Task 2: Replace the authorization stub with real roles and capabilities

**Files:**

- Modify: `apps/api/src/database/schema/admin.ts`
- Create: `apps/api/drizzle/0031_admin_roles_audit_sessions.sql`
- Modify: `apps/api/src/modules/auth/admin-auth-repository.ts`
- Modify: `apps/api/src/modules/auth/postgres-admin-auth-repository.ts`
- Replace: `apps/api/src/modules/auth/capabilities.ts`
- Create: `apps/api/src/modules/auth/authorize.ts`
- Modify: `apps/api/src/routes/admin/admin-shared.ts`
- Modify: every domain registrar under `apps/api/src/routes/admin/`
- Create: `apps/api/src/routes/admin/security.ts`
- Modify: `packages/contracts/src/auth.ts`
- Create: `apps/admin/src/api/security-api.ts`
- Create: `apps/admin/src/settings/SecuritySettingsPage.tsx`
- Create: `apps/admin/src/settings/SecuritySettingsPage.test.tsx`
- Modify: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/components/DesktopSidebar.tsx`
- Create: `apps/api/test/admin-authorization.integration.test.ts`
- Modify: `apps/api/test/capabilities.test.ts`

**Interfaces:**

```ts
export type AdminRole = 'owner' | 'operator';

export type Capability =
  | 'catalog:operate'
  | 'orders:operate'
  | 'conversations:operate'
  | 'shipping:operate'
  | 'inventory:operate'
  | 'alerts:operate'
  | 'integrations:manage'
  | 'audit:read'
  | 'security:manage';

export function hasCapability(
  user: AdminUserPublic | null,
  capability: Capability,
): boolean;
```

`owner` receives all capabilities. `operator` receives only the six operational capabilities. Existing users migrate to `owner` so the migration does not lock out the current business.

- [ ] Write unit tests proving `operator` cannot manage integrations, security or audit.
- [ ] Run the focused test and confirm it fails against the current unconditional `return true`.
- [ ] Add the role column, contract and repository mapping.
- [ ] Add `requireCapability()` and enforce it on the server for every admin route. Hiding a frontend link is not authorization.
- [ ] Add integration tests for authenticated `403`, unauthenticated `401`, owner success and operator success on allowed routes.
- [ ] Add an owner-only user-management API that can create/deactivate operators and change roles, with password confirmation for sensitive changes.
- [ ] Add a minimal Security/Access page in the admin to manage operators. Do not expose hashes or secrets.
- [ ] Add E2E coverage for owner versus operator navigation and direct URL/API denial.
- [ ] Update the functional matrix and evidence ledger.

**Gate:** No authenticated user receives capabilities by default; server-side tests prove every sensitive route is owner-only.

## Task 3: Make MFA and session security operable end to end

**Files:**

- Modify: `apps/api/src/routes/admin/auth.ts`
- Modify: `apps/api/src/modules/auth/auth-service.ts`
- Modify: `apps/api/src/modules/auth/admin-auth-repository.ts`
- Modify: `apps/api/src/modules/auth/postgres-admin-auth-repository.ts`
- Modify: `apps/api/src/database/schema/admin.ts`
- Modify: `packages/contracts/src/auth.ts`
- Modify: `apps/admin/src/api/auth-api.ts`
- Modify: `apps/admin/src/api/security-api.ts`
- Modify: `apps/admin/src/settings/SecuritySettingsPage.tsx`
- Modify: `apps/admin/src/settings/SecuritySettingsPage.test.tsx`
- Modify: `apps/admin/src/App.tsx`
- Modify: `apps/admin/src/components/DesktopSidebar.tsx`
- Create: `apps/api/test/mfa-http.integration.test.ts`
- Create: `apps/api/test/session-security.integration.test.ts`
- Create: `apps/admin/e2e/security.spec.ts`

**Required behavior:**

- Enrollment shows an `otpauth://` URI, a scannable QR and the manual secret.
- Confirmation requires a valid TOTP before enabling MFA.
- Recovery codes are shown exactly once, stored only as hashes and consumed once.
- Disabling MFA requires the current password and revokes every other session.
- MFA verification has a separate rate limit and audit events; brute force is not unlimited after password validation.
- Users can list their active sessions and revoke individual sessions or all other sessions.
- Sessions have 12-hour absolute expiry and configurable idle expiry, defaulting to 60 minutes in production.
- Updating `lastSeenAt` is throttled to avoid a database write on every request.
- Password reset, role change, deactivation and MFA disable revoke applicable sessions.

- [ ] Write failing service, HTTP and UI tests for all behavior above.
- [ ] Add any audited QR dependency with an exact lockfile version; do not send the TOTP secret to an external QR service.
- [ ] Add the Security page and owner-only navigation.
- [ ] Ensure codes, QR secrets, passwords, session tokens and recovery codes never enter logs, analytics or error responses.
- [ ] Test expired token, invalid TOTP, used recovery code, rate limit, session revocation and disabled user.
- [ ] Run focused auth tests, admin unit tests and the security E2E.
- [ ] Update `.env.prod.example` with non-secret session settings and key-generation instructions.

**Gate:** A new owner can enroll MFA from the UI, sign out, sign in with TOTP or one recovery code, inspect sessions and revoke them. Direct API abuse is rate-limited and audited.

## Task 4: Implement unified security and business audit events

**Files:**

- Modify: `apps/api/src/database/schema/admin.ts`
- Create: `apps/api/drizzle/0032_admin_audit_events.sql`
- Create: `apps/api/src/modules/audit/audit-event.ts`
- Create: `apps/api/src/modules/audit/audit-repository.ts`
- Create: `apps/api/src/modules/audit/postgres-audit-repository.ts`
- Create: `apps/api/src/modules/audit/audit-service.ts`
- Create: `apps/api/src/routes/admin/audit.ts`
- Modify: domain services that execute sensitive actions
- Modify: `packages/contracts/src/auth.ts`
- Replace data source in: `apps/admin/src/settings/ConfigurationAuditPage.tsx`
- Create: `apps/api/test/admin-audit.integration.test.ts`

**Audit record:** actor ID, actor username snapshot, action, target type/ID, correlation ID, sanitized metadata, result, IP hash if legally approved, and immutable timestamp. Never include passwords, tokens, TOTP secrets, full documents, addresses or message bodies.

- [ ] Write tests for login success/failure, MFA changes, session revocation, roles, integrations, bot/locality/policy publication, inventory adjustment, order override, exports and retention execution.
- [ ] Make audit storage append-only through application permissions and repository API.
- [ ] Replace the current bot-only “Historial” source with paginated, filterable unified audit data.
- [ ] Verify that failed sensitive actions are recorded without leaking submitted secrets.
- [ ] Add database indexes for time, actor, action and target.

**Gate:** Every sensitive action listed in design section 8.4 is queryable in Historial and covered by integration tests.

## Task 5: Implement privacy inventory, controlled retention and data-subject operations

**Files:**

- Create: `packages/contracts/src/privacy.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/api/src/modules/privacy/retention-policy.ts`
- Create: `apps/api/src/modules/privacy/retention-repository.ts`
- Create: `apps/api/src/modules/privacy/postgres-retention-repository.ts`
- Create: `apps/api/src/modules/privacy/retention-service.ts`
- Create: `apps/api/src/routes/admin/privacy.ts`
- Modify: `apps/api/src/runtime.ts`
- Modify: `apps/api/src/worker.ts`
- Create: `apps/api/src/cli/retention-execute.ts`
- Replace: `apps/api/src/cli/retention-simulate.ts`
- Create: `apps/admin/src/api/privacy-api.ts`
- Create: `apps/admin/src/settings/PrivacySettingsPage.tsx`
- Create: `apps/api/test/retention-service.test.ts`
- Create: `apps/api/test/retention.integration.test.ts`
- Create: `apps/admin/src/settings/PrivacySettingsPage.test.tsx`
- Update: `docs/compliance/pii-inventory.md`
- Replace template after approval: `docs/compliance/retention-matrix.template.md`

**Required behavior:**

- Retention policies are versioned, auditable and disabled until an owner records the approved legal basis, duration and action for each data class.
- `dry-run` returns counts and sample opaque IDs only; it never returns message bodies, names, phones, addresses or documents.
- Execution supports resumable batches, idempotency, progress, failure recovery and a final signed report.
- Each class explicitly chooses `retain`, `anonymize` or `delete`; no global age flag may silently apply one action to every table.
- Export and deletion requests require owner capability, recent password/MFA confirmation, preview and audit.
- Orders that must be retained are anonymized only according to the approved policy; relational and accounting integrity remains valid.
- Automatic execution stays off until `RETENTION_EXECUTION_ENABLED=true` and an approved active policy exists.

- [ ] Write failing tests proving dry-run has no side effects and execution refuses to run without an approved active policy.
- [ ] Model the supported data classes and their table/relationship strategy explicitly.
- [ ] Implement versioned policy activation with owner reauthentication and audit.
- [ ] Implement resumable batch execution and safe retry after a simulated crash.
- [ ] Add owner UI for inventory, dry-run, policy versions, execution progress and reports.
- [ ] Add controlled customer export/anonymization workflow without exposing unrelated records.
- [ ] Keep exact legal durations marked `[HUMANO]` until the responsible person approves them for Colombia.
- [ ] Test referential integrity, audit preservation and irreversible-action confirmation.

**Gate:** The system can safely simulate retention, but cannot delete or anonymize production data until a signed policy is activated; an approved staging policy completes a resumable execution with a verifiable report.

## Task 6: Finish the frontend architecture and operational UX

**Files:**

- Refactor: `apps/admin/src/settings/IntegrationsPage.tsx`
- Create: `apps/admin/src/settings/integrations/IntegrationOverview.tsx`
- Create: `apps/admin/src/settings/integrations/WhatsAppIntegrationPanel.tsx`
- Create: `apps/admin/src/settings/integrations/NinetyNineEnviosIntegrationPanel.tsx`
- Create: `apps/admin/src/settings/integrations/InternalServiceStatus.tsx`
- Refactor: `apps/admin/src/settings/ShippingSettingsPage.tsx`
- Create: `apps/admin/src/settings/shipping/GeneralShippingPolicy.tsx`
- Create: `apps/admin/src/settings/shipping/LocalityExceptions.tsx`
- Create: `apps/admin/src/settings/shipping/ShippingDecisionSimulator.tsx`
- Create: `apps/admin/src/settings/shipping/ShippingOperationsStatus.tsx`
- Refactor: `apps/admin/src/styles.css`
- Modify: `apps/admin/src/index.css`
- Create feature-local CSS modules only where utilities cannot express the design clearly.
- Extend: `apps/admin/e2e/configurable-operations.spec.ts`
- Extend: `apps/admin/e2e/operations.spec.ts`

**Required behavior:**

- Base de datos, media and scheduler show status-specific diagnostic text and actions; they never say “Guardar credenciales”.
- WhatsApp and 99envíos use an explicit four-step lifecycle: credentials, safe test, activation, operational verification.
- Shipping separates general policy, locality exceptions, simulator and incidents/status.
- Every action shows persistent outcome and next step, not only a toast.
- Loading, empty, permission, conflict, recoverable error and degraded-provider states exist.
- The navigation remains complete at 390 px without horizontal overflow.
- The bot editor retains its desktop three-pane layout and mobile successive views.
- `styles.css` contains only reset, tokens and documented global primitives; feature selectors move with their feature.
- Remove the four Fast Refresh warnings by separating exported variants/constants from component modules.

- [ ] Write component tests for provider-specific wording and lifecycle states before refactoring.
- [ ] Write tests for shipping tabs/sections and simulator error recovery.
- [ ] Split the files while preserving routes and API contracts.
- [ ] Run Axe against every principal route, not only login and a generic operations page.
- [ ] Run visual/interaction checks at 390, 768, 1280 and 1440 px.
- [ ] Check keyboard order, focus restoration, 44 px targets and reduced motion.
- [ ] Add a measurable bundle budget and lazy-load heavy charts/configuration pages.

**Gate:** No serious/critical Axe violations, no repeated provider-inappropriate copy, no horizontal overflow, no Fast Refresh warnings, and the large settings pages are thin composition shells.

## Task 7: Add S3-compatible production storage

**Files:**

- Create: `apps/api/src/modules/storage/object-storage.ts`
- Create: `apps/api/src/modules/storage/local-object-storage.ts`
- Create: `apps/api/src/modules/storage/s3-object-storage.ts`
- Create: `apps/api/src/modules/storage/create-object-storage.ts`
- Adapt: `apps/api/src/modules/catalog/local-photo-storage.ts`
- Adapt: `apps/api/src/modules/shipping/local-guide-pdf-storage.ts`
- Modify: `apps/api/src/runtime.ts`
- Modify: `apps/api/src/config.ts`
- Modify: `.env.prod.example`
- Modify: `compose.prod.yaml`
- Create: `apps/api/src/cli/migrate-media-to-object-storage.ts`
- Create: `apps/api/test/object-storage.contract.test.ts`
- Create: `apps/api/test/s3-object-storage.integration.test.ts`

**Interface:**

```ts
export interface ObjectStorage {
  put(input: {
    key: string;
    bytes: Uint8Array;
    contentType: string;
    sha256: string;
  }): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}
```

- [ ] Implement local and S3-compatible adapters against the same contract tests.
- [ ] Use path-safe opaque keys; never concatenate untrusted names into local paths.
- [ ] Verify MIME type, size and SHA-256 before marking an object ready.
- [ ] Make production require `STORAGE_DRIVER=s3`; local/test may use `local`.
- [ ] Add endpoint, bucket, region, access key, secret key, force-path-style and TLS validation settings.
- [ ] Add MinIO only to a staging/test profile for integration tests; production points to an external S3-compatible service.
- [ ] Build an idempotent dry-run/execute migration CLI for existing photos and PDFs.
- [ ] Preserve old local objects until the migration report verifies count and hashes.

**Gate:** API and worker read/write the same external bucket, MinIO contract tests pass, and the migration CLI proves counts and hashes without deleting the source.

## Task 8: Complete the production topology and real health checks

**Files:**

- Modify: `compose.prod.yaml`
- Create: `compose.staging.yaml`
- Modify: `docker/Dockerfile.api`
- Modify: `docker/Dockerfile.worker`
- Modify: `docker/Dockerfile.admin`
- Create: `docker/Dockerfile.backup`
- Replace template behavior in: `docker/Caddyfile.example`
- Create: `apps/api/src/modules/health/worker-health.ts`
- Modify: `apps/api/src/worker.ts`
- Modify: `apps/api/src/runtime.ts`
- Create: `scripts/production-smoke.mjs`
- Update: `docs/runbooks/api-worker.md`
- Update: `docs/runbooks/proxy-https.md`

**Required services:** PostgreSQL, one-shot migration, API, worker, non-root static admin, Caddy HTTPS, backup, metrics collector and alert routing. API/worker must not start business traffic before migrations succeed.

- [ ] Add a one-shot `migrate` service using the exact application image and migration command.
- [ ] Make API and worker depend on successful migration and healthy PostgreSQL.
- [ ] Replace the worker’s unconditional `process.exit(0)` health check with readiness based on database connectivity, scheduler initialization and recent loop heartbeat.
- [ ] Add Caddy/admin health checks and make Caddy wait for healthy upstreams.
- [ ] Enable 80/443 in production and use `CAMILA_DOMAIN`; keep local loopback behavior in staging overrides.
- [ ] Run admin as non-root with a digest-pinned `nginxinc/nginx-unprivileged` runtime, listen on port 8080 and set the runtime user explicitly.
- [ ] Add `read_only`, `tmpfs`, `cap_drop`, `security_opt`, restart policy and documented CPU/memory limits where compatible.
- [ ] Pin all base/service images by digest after verifying the chosen versions.
- [ ] Validate that production refuses HTTP admin origins, blank encryption keys, local storage driver and example passwords.
- [ ] Add a smoke script that creates disposable secrets, boots the staging stack, runs migrations, waits for health, checks login/major routes, confirms separate API/worker processes and shuts down cleanly.

**Gate:** A clean machine can build and start staging with one documented command; migrations, health, smoke and shutdown all pass without manual container intervention.

## Task 9: Automate encrypted off-server backups and restore drills

**Files:**

- Replace: `scripts/backup-postgres.mjs`
- Replace: `scripts/restore-postgres-drill.mjs`
- Create: `scripts/verify-backup.mjs`
- Create: `scripts/backup-heartbeat.mjs`
- Modify: `compose.prod.yaml`
- Modify: `docker/Dockerfile.backup`
- Update: `docs/runbooks/postgres-backup-restore.md`
- Create: `apps/api/test/backup-scripts.test.ts`

**Required behavior:** consistent custom-format `pg_dump`, encryption before off-server upload, manifest with SHA-256/schema version/timestamp, configurable retention, failure exit code, external heartbeat, restore to isolated database, migrations/checks, sampled row counts and automatic drill cleanup only after success.

- [ ] Write tests for missing credentials, failed dump, failed upload, checksum mismatch and restore validation failure.
- [ ] Build a scheduled backup container; do not rely on a person remembering to run a host script.
- [ ] Use an S3-compatible destination separate from the VPS and separate credentials from application storage.
- [ ] Never put database credentials in command output or process arguments when a safer mechanism exists.
- [ ] Add metrics/heartbeat for last successful backup, age, size and last restore drill.
- [ ] Keep destructive cleanup disabled when restore validation fails.
- [ ] Document `[HUMANO]` values for RPO, RTO, retention, bucket policy and alert destination.

**Gate:** An automated staging drill creates an encrypted backup, uploads it, restores it to an isolated database, validates it and records achieved RPO/RTO. Production destination remains `[HUMANO]` until credentials are supplied.

## Task 10: Add metrics, error tracking and actionable external alerts

**Files:**

- Create: `apps/api/src/modules/observability/metrics.ts`
- Create: `apps/api/src/modules/observability/error-reporter.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/runtime.ts`
- Modify: `apps/api/src/worker.ts`
- Modify: `compose.prod.yaml`
- Create: `infra/prometheus/prometheus.yml`
- Create: `infra/prometheus/alerts.yml`
- Create: `infra/alertmanager/alertmanager.yml.example`
- Create: `docs/runbooks/monitoring-alerts.md`
- Create: `apps/api/test/metrics.test.ts`

**Metrics:** HTTP request duration/count/errors, DB readiness, worker heartbeat, queue depth/age, job attempts/failures, WhatsApp send outcomes, guide outcomes including `uncertain`, inventory conflicts, last backup and scheduler success. Labels must be bounded and contain no PII.

- [ ] Expose metrics only on the internal network or behind protected access.
- [ ] Add correlation IDs to HTTP, jobs, provider calls and sanitized error reports.
- [ ] Add alerts for API/worker down, old queues, repeated provider failures, uncertain guides, backup age/failure, disk pressure and certificate expiry.
- [ ] Support a user-provided external alert webhook or hosted monitor; never embed its secret.
- [ ] Add optional production error tracking through a DSN, with PII scrubbing and release SHA.
- [ ] Test alert rules with synthetic failures in staging and record receipt evidence.

**Gate:** Synthetic staging failures generate metrics and a real external alert after `[HUMANO]` supplies the destination; no sensitive value appears in telemetry.

## Task 11: Enforce complete local coverage, security and image gates

**Files:**

- Modify: local release scripts
- Create or modify: Vitest coverage configuration in each package
- Create: `scripts/check-bundle-budget.mjs`
- Create: `scripts/check-production-config.mjs`
- Modify: `package.json`
- Update: `CONTRIBUTING.md`

**Required local sequence:** frozen install, format, lint with zero warnings, typecheck, unit/contracts, integration, build, E2E/a11y, coverage, dependency audit, secret scan, filesystem scan, Compose validation, Docker builds, image vulnerability scan and staging smoke.

- [ ] Make strict lint fail on warnings and remove the existing four warnings.
- [ ] Enforce at least 90% lines/branches in critical domain modules and 80% in modified non-critical modules. Do not exclude difficult production code merely to raise the percentage.
- [ ] Add secret scanning over Git history and the working diff using a maintained pinned scanner.
- [ ] Add filesystem and final-image scanning; fail on exploitable critical/high findings unless a time-bounded documented exception exists.
- [ ] Add bundle budgets based on the current measured baseline and fail meaningful regressions.
- [ ] Run the disposable staging smoke test locally.
- [ ] Pin local scanner versions.
- [ ] Keep local verification time practical through caching without skipping gates.

**Gate:** Do not merge a release candidate when any required local test, coverage, secret, image, Compose or smoke gate fails.

## Task 12: Expand functional, concurrency and performance acceptance

**Files:**

- Extend: `apps/api/test/critical-idempotency.test.ts`
- Create: `apps/api/test/critical-idempotency.integration.test.ts`
- Create: `apps/api/test/critical-concurrency.integration.test.ts`
- Extend: `apps/admin/e2e/operations.spec.ts`
- Create: `apps/admin/e2e/end-to-end-sale.spec.ts`
- Create: `tests/load/webhook-load.mjs`
- Create: `tests/load/admin-read-load.mjs`
- Update: `docs/acceptance/kairo-functional-matrix.md`

- [ ] Replace schema-name-only idempotency assertions with concurrent database tests for confirmation, reservation, inbound webhook, outbound message, guide job and inventory closeout.
- [ ] Prove an uncertain 99envíos pre-shipment result cannot auto-retry into a duplicate guide.
- [ ] Cover a full controlled sale from inbound WhatsApp event through catalog, customer data, quote, confirmation, reservation, guide job, PDF outbox, dispatch, delivery and return/cancel constraints.
- [ ] Cover provider outage, rate limit, expired quote, stock race, duplicate webhook, PDF retry and human handoff.
- [ ] Run accessibility checks on each critical page at 390, 768, 1280 and 1440 px.
- [ ] Establish reproducible p50/p95/p99 baselines for webhook ingestion and principal admin reads using synthetic data.
- [ ] Define regression thresholds from that baseline and enforce them in a non-flaky scheduled or release gate.
- [ ] Require three repeated clean runs of the concurrency suite.

**Gate:** The functional matrix links each row to executable unit/integration/E2E evidence and has no unsupported “engineering completed” claim.

## Task 13: Real integrations, staging, pilot and launch gates

**Files:**

- Update: `docs/integrations/evidence-log.md`
- Update: `docs/integrations/meta-validation-template.md`
- Update: `docs/pilot/reconciliation-worksheet.md`
- Update: `docs/pilot/training-checklist.md`
- Update: `docs/pilot/go-no-go-checklist.md`
- Update: `docs/release/production-launch.md`
- Update: `docs/release/stabilization-period.md`
- Update: `docs/release/acceptance-signoff.md`
- Update: `docs/release/definitive-closeout-evidence.md`

This task cannot be completed with mocks or generated signatures.

- [ ] `[HUMANO]` Supply VPS, domain, DNS, TLS contact, external object storage, backup storage, alert destination and approved retention/RPO/RTO values.
- [ ] `[HUMANO]` Supply Meta and 99envíos credentials through the production secret channel, never chat or Git.
- [ ] Validate Meta webhook verification, signature rejection, inbound event, outbound message, approved template, service window and coexistence only if Meta confirms it.
- [ ] Validate 99envíos login, safe quote, one explicitly authorized real pre-shipment, PDF and available incidents endpoints.
- [ ] Record sanitized provider request IDs, timestamps and outcomes; never record tokens or customer PII.
- [ ] Import real data through preview, reconcile counts/hashes and obtain owner approval.
- [ ] Train operators and run the controlled pilot.
- [ ] Block go-live while any P0/P1 is open or any backup/restore/alert/security gate lacks evidence.
- [ ] Run the agreed stabilization period and record daily health, failures and corrective actions.
- [ ] Obtain final owner acceptance.

**Gate:** Production is not declared complete until the evidence log, go/no-go checklist and acceptance signoff contain real approvals and the stabilization period has finished.

## Final verification sequence

Run from a clean checkout of the final commit:

```powershell
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint -- --max-warnings=0
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:coverage
pnpm build
pnpm audit --prod
docker compose --env-file .env.prod.example -f compose.prod.yaml config --quiet
docker compose -f compose.staging.yaml build
pnpm production:smoke
git diff --check
git status --short
```

Also run the configured secret scanner, filesystem scanner and image scanner through local release scripts. Record tool versions, exit codes, test totals, coverage by critical domain, image digests, smoke-test output and remaining `[HUMANO]` gates in `docs/release/definitive-closeout-evidence.md`.

## Required final response from Cursor

Return all of the following, without saying “everything is complete” unless every item is evidenced:

1. Final branch and commit list.
2. Files changed grouped by task.
3. Database migrations and rollback/compatibility notes.
4. Exact verification commands and outputs/totals.
5. Coverage results for critical domains.
6. Docker image digests and scan results.
7. Staging smoke and restore-drill evidence.
8. Visual/accessibility verification at all four viewports.
9. Real integration evidence, or explicit `[HUMANO]` blockers.
10. Remaining risks ranked P0–P3.
11. Confirmation that no secrets or personal data were committed.
12. A go/no-go recommendation justified by evidence.

If any P0/P1, real integration, restore, external alert, pilot or acceptance gate is missing, the only valid recommendation is **NO-GO**.
