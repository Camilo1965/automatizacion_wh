# KAIRO definitive closeout evidence

Branch: `cursor/kairo-definitive-closeout`  
Product: KAIRO Operaciones  
Scope: single Colombian footwear business

Status legend: `verified` | `failed` | `[HUMANO]` | `in_progress`

---

## Task 1 — Baseline inventory (2026-09-22T04:45Z approx)

### Git state

| Check                | Result                                              |
| -------------------- | --------------------------------------------------- |
| Branch created       | `cursor/kairo-definitive-closeout` from `main` HEAD |
| Starting SHA         | `938003e44b31bdb625c4f970e8011a9719d0d8eb`          |
| Ahead of origin/main | 7 commits (preserved; no reset)                     |
| Worktree             | clean at Task 1 start                               |

Commands:

```text
git status --short --branch
## cursor/kairo-definitive-closeout

git log --oneline -10
938003e docs: add definitive KAIRO closeout plan for Cursor
f72c875 feat: complete KAIRO phases 5-10 automatable hardening
747da0b refactor: modularize backend schema contracts routes and workers
15fd086 feat: move global search to server and split bot simulate panel
424c576 feat: unify KAIRO Operaciones brand and WCAG AA shell
4c8bb5f fix: restore KAIRO phase-1 CI baseline
f310bce docs: define KAIRO production hardening design
838a63e feat: redesign admin UI with Refero/shadcn mono system
118b374 merge: include KAIRO login redesign into UX branch
3d72959 feat: ship boutique ops UX and live WhatsApp/99envíos path

git rev-parse HEAD
938003e44b31bdb625c4f970e8011a9719d0d8eb
```

### Fresh verification (do not reuse prior audit claims)

| Command                                                                                   | Exit | Timestamp (local)      | Totals / notes                   |
| ----------------------------------------------------------------------------------------- | ---- | ---------------------- | -------------------------------- |
| `pnpm install --frozen-lockfile`                                                          | 0    | 2026-09-21 ~23:45      | Already up to date; pnpm 11.19.0 |
| `pnpm verify:local`                                                                       | 0    | 2026-09-21 23:45–23:50 | Duration ~271s                   |
| `pnpm audit --prod`                                                                       | 0    | 2026-09-21 23:50       | No known vulnerabilities found   |
| `docker compose --env-file .env.prod.example -f compose.prod.yaml config --quiet`         | 0    | 2026-09-21 23:50       | Valid                            |
| `docker compose --env-file .env.prod.example -f compose.prod.yaml build api worker admin` | 0    | 2026-09-21 23:50       | All three images built           |

#### `pnpm verify:local` totals

| Suite           | Result                                                            |
| --------------- | ----------------------------------------------------------------- |
| format:check    | pass                                                              |
| lint            | 0 errors, **4 Fast Refresh warnings** (badge/button/sidebar/tabs) |
| typecheck       | pass                                                              |
| contracts unit  | 70 passed                                                         |
| API unit        | 213 passed                                                        |
| admin unit      | 50 passed                                                         |
| API integration | 109 passed                                                        |
| admin E2E       | 22 passed                                                         |
| build           | pass                                                              |

Docker image manifest lists (this machine, after build):

| Image              | Manifest digest                                                           |
| ------------------ | ------------------------------------------------------------------------- |
| camila-prod-api    | `sha256:ed82c6c6007abfe2088d78499f35808d0309ef0a30963601880f7c1632de4f0d` |
| camila-prod-worker | `sha256:331c12e8e57be7bf4710221e6a52ada706585e4c7bd137a158013b7b497c68f6` |
| camila-prod-admin  | `sha256:d5b8856dd67f40884b90cc0af77652a88844f80f6b5d4d3e6b6187604ea7dafa` |

### Design requirement ledger (honest)

| Requirement area                              | Status                                 | Evidence / gap                                                                             |
| --------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| Baseline CI green locally                     | `verified`                             | `pnpm verify:local` exit 0                                                                 |
| Prod dependency audit                         | `verified`                             | `pnpm audit --prod` clean                                                                  |
| Compose prod config                           | `verified`                             | config --quiet exit 0                                                                      |
| Docker image builds                           | `verified`                             | api/worker/admin built                                                                     |
| Real RBAC / capabilities                      | `verified`                             | Task 2: roles + `requireCapability` on admin routes; U/I/E evidence                        |
| Operable MFA from panel                       | `verified`                             | Task 3: enroll/confirm/disable, sessions, rate limit, local QR                             |
| Unified admin/business audit                  | `verified`                             | Task 4: `admin_audit_events` + Historial `/audit`; auth sink → Postgres                    |
| Versioned retention + legal gate              | `failed`                               | Execution must stay blocked until `[HUMANO]` legal approval                                |
| Integrations/Shipping UX lifecycle            | `failed`                               | Pages still monolithic; generic copy residual risk                                         |
| Fast Refresh warnings = 0                     | `failed`                               | 4 warnings remain                                                                          |
| A11y all principal routes @ 390/768/1280/1440 | `failed`                               | Partial E2E only                                                                           |
| S3-compatible production storage              | `verified`                             | Task 7: ObjectStorage local+S3; prod requires `STORAGE_DRIVER=s3`; MinIO test profile only |
| Compose migrate service                       | `verified`                             | Task 8: one-shot `migrate` before api/worker                                               |
| Real worker health                            | `verified`                             | Task 8: DB + scheduler + heartbeat via `worker-health`                                     |
| Hardened non-root containers                  | `verified`                             | Task 8: unprivileged admin, read_only/tmpfs/cap_drop, digests                              |
| Productive HTTPS (Caddy + domain)             | `[HUMANO]`                             | Needs domain/DNS/VPS; staging uses loopback + tls internal                                 |
| Encrypted off-server backup + restore drill   | `verified` (auto) / `[HUMANO]` dest    | Task 9: encrypted dump+upload+drill; prod bucket/RPO/RTO `[HUMANO]`                        |
| Metrics + correlation IDs + external alerts   | `verified` (auto) / `[HUMANO]` webhook | Task 10: metrics + alerts wired; external receipt `[HUMANO]`                               |
| CI coverage/secret/fs/image/smoke gates       | `verified`                             | Task 11                                                                                    |
| Real idempotency/concurrency tests            | `failed`                               | Schema-name assertions insufficient                                                        |
| Staging reproducible smoke                    | `verified`                             | Task 8: `pnpm production:smoke` PASS                                                       |
| Meta + 99envíos real evidence                 | `[HUMANO]`                             | Credentials + authorized actions                                                           |
| Pilot + acceptance signoff                    | `[HUMANO]`                             | Owner/operators                                                                            |

### Remaining gaps entering Task 5

1. Retention, storage, backup, observability, CI gates incomplete.
2. Real provider/pilot/launch evidence absent → final recommendation remains **NO-GO** until `[HUMANO]` gates close.
3. Audit raw IP not stored (by design until legal approval); optional `ip_hash` column reserved.

---

## Task 2 — Real roles and capabilities (2026-09-22)

### Behavior

- `AdminRole`: `owner` | `operator`
- Capabilities use colon form (`catalog:operate`, `integrations:manage`, …)
- Owner: all capabilities. Operator: six `:operate` only.
- Migration `0031_admin_roles_audit_sessions.sql` adds `admin_users.role` (existing rows → `owner`)
- `requireCapability()` enforced server-side on admin domain routes; Security API for user management with password confirmation
- Admin UI: Seguridad y acceso page; sidebar/Más hide owner-only links for operators

### TDD evidence

| Step        | Command                                                                                      | Result                                         |
| ----------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| RED         | `pnpm --filter @camila/api exec vitest run test/capabilities.test.ts`                        | Fail: operator denial expected false, got true |
| GREEN       | same                                                                                         | 4 passed                                       |
| Integration | `pnpm --filter @camila/api test:integration -- test/admin-authorization.integration.test.ts` | 5 passed (401/403/owner/operator/create)       |
| Admin unit  | `pnpm --filter @camila/admin exec vitest run src/settings/SecuritySettingsPage.test.tsx`     | 2 passed                                       |

---

## Task 3 — MFA and session security (2026-09-22)

### Behavior

- Enrollment: `otpauth://` URI + local `qrcode@1.5.4` QR + manual secret (no external QR service)
- Confirm: valid TOTP required; recovery codes shown once, stored as SHA-256 hashes, single use
- Disable MFA: current password + revoke every other session
- MFA verify: separate rate limit (5 / 15 min) + `AuthAuditSink` events
- Session list / revoke one / revoke others
- Absolute expiry 12h; idle default 60 min in production (`SESSION_IDLE_TTL_MINUTES`); throttled `last_seen_at`
- Password reset / role change / deactivation / MFA disable revoke applicable sessions
- Dashboard Integraciones queue gated to owners

### Migration

- `0032_admin_session_security.sql` adds `admin_sessions.last_seen_at`
- Task 4 audit migration renumbered to `0033` (plan originally said 0032)

### Verification

| Suite                                              | Result    |
| -------------------------------------------------- | --------- |
| `mfa-http.integration.test.ts`                     | 4 passed  |
| `session-security.integration.test.ts`             | 3 passed  |
| Auth unit (auth-service/session-token/totp/config) | 25 passed |
| SecuritySettingsPage + MorePage unit               | 6 passed  |
| E2E `security.spec.ts` + `authorization.spec.ts`   | 2 passed  |
| api + admin typecheck                              | pass      |

### Task progress log

| Task                 | Status     | Commit           | Notes                                                                                |
| -------------------- | ---------- | ---------------- | ------------------------------------------------------------------------------------ |
| 1 Baseline           | `verified` | `87f92e9`        | Fresh totals recorded                                                                |
| 2 AuthZ              | `verified` | `35038be`        | Stub replaced; server enforcement                                                    |
| 3 MFA/sessions       | `verified` | (Task 3 commit)  | MFA+sessions operable; migration 0032                                                |
| 4 Audit              | `verified` | (Task 4 commit)  | Unified append-only audit; migration 0033                                            |
| 5 Retention          | `verified` | (this commit)    | Privacy inventory + controlled retention; migration 0034; legal durations `[HUMANO]` |
| 6 Frontend UX/a11y   | `verified` | (Task 6 commit)  | Lifecycle UX + Fast Refresh 0                                                        |
| 7 Object storage     | `verified` | (this commit)    | ObjectStorage + S3/MinIO + migrate CLI                                               |
| 8 Topology/health    | `verified` | (Task 8 commit)  | Staging smoke + hardened compose                                                     |
| 9 Backups            | `verified` | (Task 9 commit)  | Encrypt+drill auto; prod dest `[HUMANO]`                                             |
| 10 Observability     | `verified` | (Task 10 commit) | Metrics/alerts wired; external receipt `[HUMANO]`                                    |
| 11 CI gates          | `verified` | (Task 11 commit) | Full verify.yml gates                                                                |
| 12 Concurrency/perf  | `verified` | (Task 12 commit) | Concurrency ×3 + load + matrix                                                       |
| 13 Real integrations | `[HUMANO]` | (Task 13 commit) | Docs/gates only; **NO-GO** — all live evidence BLOCKING                              |

---

## Secrets / PII confirmation

No passwords, tokens, TOTP secrets, recovery codes, documents, phones, addresses or production data recorded in this ledger.

---

## Task 4 — Unified security and business audit (2026-09-22)

### Behavior

- Table `admin_audit_events` (migration **0033**; plan text said 0032 but that number was taken by session security)
- Fields: actor id/username snapshot, action, target type/id, correlation id, sanitized metadata, result, optional `ip_hash` (raw IP never stored; legal approval required before use), immutable `created_at`
- Append-only repository API (`append` + `list` only; no update/delete for consumers)
- `AuthService` audit sink wired to Postgres via `AuditService.asAuthAuditSink()`
- Sensitive routes also emit: integrations, bot/locality publish, shipping policy, inventory adjust/closures/export download, order transitions, role/user lifecycle
- Retention action names recorded via service API hooks (`retention.executed` / `retention.simulated`) for Task 5
- Owner-only `audit:read` on `GET /api/admin/audit` and legacy `GET /api/admin/configuration/audit`
- Historial UI filters + pagination against unified feed

### Indexes

- `created_at`, `actor_user_id`, `action`, `(target_type, target_id)`

### TDD evidence

| Step              | Command                                                                              | Result                                   |
| ----------------- | ------------------------------------------------------------------------------------ | ---------------------------------------- |
| RED               | Tests authored against missing `modules/audit/*` before implementation               | Import/compile would fail without module |
| GREEN unit        | `pnpm --filter @camila/api exec vitest run test/audit-service.test.ts`               | 5 passed                                 |
| GREEN integration | `pnpm --filter @camila/api test:integration -- test/admin-audit.integration.test.ts` | 3 passed                                 |
| Migrations        | `test/database-migrations.integration.test.ts`                                       | 3 passed                                 |
| Typecheck         | api + admin `tsc --noEmit`                                                           | pass                                     |
| Contracts         | `pnpm --filter @camila/contracts exec vitest run`                                    | 70 passed                                |

### IP / secrets note

Raw client IP is not captured. Failed login/MFA metadata is sanitized (no password/token/code fields persist).

---

## Task 5 — Privacy inventory, retention, data-subject ops (2026-09-22)

### Capability choice

- `security:manage` (owner): inventory, draft/activate policies, dry-run, execute/resume, data-subject preview/execute
- `audit:read` (owner): list/get retention runs and signed reports

### Behavior

- Migration **0034** `retention_policies` + `retention_runs` (versioned policies, resumable runs, signed reports)
- Explicit data classes with per-class `retain | anonymize | delete` (orders: anonymize/retain only; audit: retain only)
- Dry-run: counts + opaque sample IDs only — never phones, names, addresses, message bodies
- Execute refused unless `RETENTION_EXECUTION_ENABLED=true` **and** active policy with every class `legalStatus=approved` + retentionDays
- Automatic execution OFF by default (worker does not schedule retention)
- CLI: `retention:execute`, compat `retention:simulate` (opaque IDs only)
- Admin UI: `/settings/privacy`
- Legal Colombia durations remain **`[HUMANO]`** in inventory, matrix template, and UI

### TDD evidence

| Step              | Command                                                                                   | Result                    |
| ----------------- | ----------------------------------------------------------------------------------------- | ------------------------- |
| RED               | Failing unit cases for dry-run side-effects + execute without approved policy             | Authored first; now green |
| GREEN unit        | `pnpm --filter @camila/api exec vitest run --project unit test/retention-service.test.ts` | 7 passed                  |
| GREEN integration | `pnpm --filter @camila/api test:integration -- test/retention.integration.test.ts`        | 3 passed                  |
| GREEN admin       | `pnpm --filter @camila/admin exec vitest run src/settings/PrivacySettingsPage.test.tsx`   | 2 passed                  |
| Migrations        | `test/database-migrations.integration.test.ts`                                            | 3 passed                  |
| Typecheck         | api + admin + contracts build                                                             | pass                      |

### [HUMANO]

Colombia legal retention durations and matrix approval — do not invent approved durations in production policy activation until owner signs matrix.

---

## Task 6 — Frontend architecture and operational UX (2026-09-22)

### Behavior

- Integrations split into `settings/integrations/*` panels; Shipping into `settings/shipping/*` sections
- Internal services (DB / media / scheduler): status-specific diagnostics — never “Guardar credenciales”
- WhatsApp + 99envíos: four-step lifecycle (credenciales → prueba segura → activación → verificación operativa) with persistent outcome + next step
- Shipping regions: política general, excepciones, simulador, incidencias/estado; simulator recoverable retry
- Fast Refresh: variants/hooks extracted from badge/button/tabs/sidebar → **0 warnings**
- `styles.css` slimmed to reset + documented primitives; feature CSS removed
- Bundle budget: `scripts/check-admin-bundle-budget.mjs` + `settings-heavy` / `charts` manual chunks; lazy routes retained/extended
- E2E axe/viewport extended to principal routes incl. security/privacy/audit; keyboard/44px/reduced-motion checks

### TDD evidence

| Step           | Command                                                                                                                         | Result                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| RED            | Integrations + Shipping section/lifecycle tests authored first                                                                  | 5 failed before implementation      |
| GREEN unit     | `pnpm --filter @camila/admin exec vitest run src/settings/IntegrationsPage.test.tsx src/settings/ShippingSettingsPage.test.tsx` | 5 passed                            |
| Fast Refresh   | eslint badge/button/tabs/sidebar                                                                                                | **0** Fast Refresh warnings (was 4) |
| Typecheck      | admin `tsc -p tsconfig.app.json --noEmit`                                                                                       | pass                                |
| Build + budget | `pnpm --filter @camila/admin build` + `node scripts/check-admin-bundle-budget.mjs`                                              | pass                                |

### Design ledger updates

| Requirement                        | Status                                        |
| ---------------------------------- | --------------------------------------------- |
| Integrations/Shipping UX lifecycle | `verified` (unit + structure; full E2E on CI) |
| Fast Refresh warnings = 0          | `verified`                                    |
| A11y principal routes @ viewports  | `in_progress` → covered by extended E2E specs |

### [HUMANO]

Visual spot-check of screenshots under `apps/admin/test-results/` after full E2E run on the machine.

---

## Task 7 — S3-compatible production storage (2026-09-22)

### Behavior

- `ObjectStorage` contract: `put` / `get` / `exists` / `delete` with path-safe opaque keys
- Adapters: `LocalObjectStorage`, `S3ObjectStorage` (`@aws-sdk/client-s3@3.1137.0`)
- Factory `createObjectStorage(config, 'photos'|'guides')`
- Photo + guide PDF storages adapted onto ObjectStorage; MIME/size validated in domain, SHA-256 + content-type verified before ready
- Production requires `STORAGE_DRIVER=s3` + endpoint/bucket/region/keys/force-path-style/TLS settings
- Local/test default `STORAGE_DRIVER=local`
- MinIO only under `compose.yaml` profile `test` (quay.io images) — **not** in `compose.prod.yaml`
- CLI `storage:migrate-media` dry-run/execute; idempotent; never deletes source files

### TDD evidence

| Step             | Command                                                                                     | Result           |
| ---------------- | ------------------------------------------------------------------------------------------- | ---------------- |
| Contract unit    | `vitest run --project unit test/object-storage.contract.test.ts`                            | 5 passed (local) |
| Migration unit   | `vitest run --project unit test/migrate-media-to-object-storage.test.ts`                    | 3 passed         |
| Photo/PDF/config | local-photo + local-guide + config unit                                                     | passed           |
| S3 integration   | `vitest run --project integration test/s3-object-storage.integration.test.ts` against MinIO | 5 passed         |
| Typecheck        | `pnpm --filter @camila/api typecheck`                                                       | pass             |
| Compose prod     | `docker compose --env-file .env.prod.example -f compose.prod.yaml config --quiet`           | pass             |

### [HUMANO]

Provision external S3-compatible bucket + credentials for production (not MinIO-in-compose).

---

## Task 8 — Production topology + real health checks (2026-09-22)

### Behavior

- One-shot `migrate` service (same `camila-api:local` image) must complete before api/worker
- Worker readiness: DB ping + scheduler init + heartbeat file (`worker-health.ts` / CLI)
- Admin: `nginxinc/nginx-unprivileged` digest-pinned, listen 8080, USER 101
- Caddy: 80/443 prod; staging loopback `18080`/`18443` + `tls internal`; waits on healthy upstreams
- Hardening: `read_only`, `tmpfs`, `cap_drop: ALL`, `no-new-privileges`, restart, cpus/mem_limit
- Images pinned by digest (node, postgres, caddy, nginx-unprivileged, prometheus, alertmanager)
- Production `loadConfig` refuses HTTP `ADMIN_ORIGIN`, blank encryption key, `STORAGE_DRIVER=local`, example passwords
- Backup + prometheus + alertmanager stubs for Task 9–10 handoff
- `pnpm production:smoke` disposable staging stack

### TDD / verification

| Step               | Command                                                                           | Result                                                          |
| ------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Worker health unit | `vitest run --project unit test/worker-health.test.ts`                            | passed                                                          |
| Config prod guards | `vitest run --project unit test/config.test.ts`                                   | passed                                                          |
| API typecheck      | `pnpm --filter @camila/api typecheck`                                             | pass                                                            |
| Compose prod       | `docker compose --env-file .env.prod.example -f compose.prod.yaml config --quiet` | pass                                                            |
| Staging smoke      | `pnpm production:smoke`                                                           | PASS (migrate→health→login→routes→separate api/worker→shutdown) |

### [HUMANO]

- Real `CAMILA_DOMAIN` + DNS + ACME email for production TLS
- Alert webhook / backup destination remain Task 9–10

---

## Task 9 — Encrypted off-server backups + restore drills (2026-09-22)

### Behavior

- Custom-format `pg_dump`; password via `PGPASSWORD` (never argv)
- AES-256-GCM encrypt **before** upload; manifest with SHA-256 / schema version / timestamp
- `BACKUP_S3_*` destination separate from app `S3_*` media credentials
- Configurable retention (`BACKUP_RETENTION_DAYS`); non-zero exit on failure
- Metrics/heartbeat: last success, age, size, last restore drill (`backup-heartbeat.mjs`)
- Restore to isolated DB; sample row counts; `DROP` only after validation success
- Scheduled container (`Dockerfile.backup` + `BACKUP_LOOP=1`)

### Verification

| Step                                                    | Result                       |
| ------------------------------------------------------- | ---------------------------- |
| `vitest run --project unit test/backup-scripts.test.ts` | 9 passed                     |
| `docker compose … compose.prod.yaml config --quiet`     | pass                         |
| `docker build -f docker/Dockerfile.backup`              | image `sha256:a271e76b142c…` |
| In-process encrypt→upload mock→restore drill→cleanup    | OK (`cleaned: true`)         |

### [HUMANO]

- Production backup bucket + credentials + bucket policy
- Approved RPO / RTO / retention / alert (`BACKUP_HEARTBEAT_URL`) destination
- Full Docker+MinIO staging drill against live Postgres when `.env.staging` supplied

---

## Task 10 — Metrics, error tracking, external alerts (2026-09-22)

### Behavior

- Lightweight Prometheus exposition (`MetricsRegistry`) — no new deps; bounded labels only
- API `GET /metrics` (internal network; optional `METRICS_TOKEN`); worker `:9091/metrics`
- Correlation ID via `x-correlation-id` on HTTP; sanitized error reports + optional `ERROR_TRACKING_DSN` + `KAIRO_RELEASE_SHA`
- Counters/gauges: HTTP, DB ready, worker heartbeat, queue depth/age, jobs, WhatsApp, guides (incl. uncertain), inventory conflicts, backup, scheduler
- Prometheus scrapes `api:3000` + `worker:9091`; Alertmanager example with blackhole until `[HUMANO]` webhook
- Alert rules: API/worker down, queues, provider failures, uncertain guides, backup age/failure, disk/cert (optional exporters), synthetic drill
- Runbook: `docs/runbooks/monitoring-alerts.md`

### Verification

| Step                                                | Result                                   |
| --------------------------------------------------- | ---------------------------------------- |
| `vitest run --project unit test/metrics.test.ts`    | 9 passed                                 |
| Related unit (config/health/entrypoints/…)          | 42 passed (batch)                        |
| `pnpm --filter @camila/api typecheck`               | pass                                     |
| `docker compose … compose.prod.yaml config --quiet` | pass                                     |
| Synthetic failure series in metrics text            | `kairo_synthetic_failures_total` present |
| External alert receipt                              | `[HUMANO]` — webhook not supplied        |

### [HUMANO]

- Supply Alertmanager webhook / hosted monitor URL (server-local config; never commit secret)
- Record one real external receipt after synthetic staging drill
- Optional: `ERROR_TRACKING_DSN`, node_exporter, TLS cert probe for disk/cert alerts

---

## Task 11 — CI coverage, security and image gates (2026-09-22)

### Behavior

- `.github/workflows/verify.yml` split into required jobs: secrets, quality+coverage, filesystem-scan, containers (compose+build+image scan), staging smoke
- Third-party Actions pinned by commit SHA; gitleaks **v8.30.1** binary pinned by SHA256; Trivy **0.74.0** via aquasecurity/trivy-action SHA
- Lint: `pnpm lint:ci` → `eslint . --max-warnings=0` (Fast Refresh 0)
- Coverage: Vitest json-summary + `scripts/check-coverage-gates.mjs`
  - Critical rules (design §10.2): ≥90% lines/branches aggregate
  - Modified non-critical domain modules: ≥80%; time-bounded exceptions in `docs/release/coverage-exceptions.json` (expire 2026-10-22)
- Bundle budget: `scripts/check-bundle-budget.mjs` → admin baseline
- Production config: `scripts/check-production-config.mjs`
- Trivy FS + final images fail on CRITICAL/HIGH (`ignore-unfixed`); exceptions only via `.trivyignore` with CVE+owner+date
- Disposable staging smoke: `pnpm production:smoke` required job

### Critical coverage (unit)

| Aggregate                | Lines      | Branches   |
| ------------------------ | ---------- | ---------- |
| Critical rules (9 files) | **99.29%** | **90.29%** |

### Verification (local Windows)

| Check                              | Result                               |
| ---------------------------------- | ------------------------------------ |
| `pnpm lint:ci`                     | pass (0 warnings)                    |
| `pnpm test:coverage` + gate script | pass                                 |
| `pnpm check:production-config`     | pass                                 |
| Secret/FS/image scanners           | configured in CI (ubuntu-latest)     |
| Staging smoke                      | required CI job (`production:smoke`) |

### [HUMANO]

None for Task 11 automation. Image digests and live Trivy/gitleaks exit codes recorded by CI run on push.

---

## Task 12 — Functional, concurrency and performance acceptance (2026-09-22)

### Behavior

- Concurrent DB idempotency for confirm, reservation/stock race, inbound webhook, outbound, guide job, inventory closeout
- Uncertain 99envíos pre-shipment cannot auto-retry into duplicate guide; outage → failed; expired quote blocked; PDF retry without duplicate document; human handoff cancels bot outbound
- Controlled sale E2E + rate-limit assertion; a11y serious/critical clear at 390 / 768 / 1280 / 1440
- Synthetic local load baselines + `pnpm check:load-baselines` release gate (3× baseline thresholds)
- Functional matrix rows link executable evidence only

### Verification

| Check                      | Result                                       |
| -------------------------- | -------------------------------------------- |
| `pnpm test:concurrency` ×3 | 10/10 pass each                              |
| Load baselines + gate      | ok (see `docs/release/load-baselines.json`)  |
| `end-to-end-sale` E2E      | 2 passed, 1 skipped (no WA secret)           |
| Matrix                     | `docs/acceptance/kairo-functional-matrix.md` |

Detail: `docs/release/_task12-implementer-report.md`

### [HUMANO]

- Owner sign-off on functional matrix
- Real Meta / 99envíos paths → Task 13

---

## Task 13 — Real integrations, staging, pilot and launch gates (2026-09-22)

### Automatable outcome (this task)

| Deliverable | Status | Notes |
| ----------- | ------ | ----- |
| `docs/integrations/evidence-log.md` | `verified` (template) | Zero live rows; all BLOCKING `[HUMANO]` |
| `docs/integrations/meta-validation-template.md` | `verified` (template) | Preflight + tests marked BLOCKING |
| `docs/pilot/reconciliation-worksheet.md` | `verified` (template) | No import/reconcile executed |
| `docs/pilot/training-checklist.md` | `verified` (template) | No training session |
| `docs/pilot/go-no-go-checklist.md` | `verified` | Explicit **NO-GO**; missing evidence = BLOCKING |
| `docs/release/production-launch.md` | `verified` (runbook) | Cutover not run |
| `docs/release/stabilization-period.md` | `verified` (template) | Period not started |
| `docs/release/acceptance-signoff.md` | `verified` (template) | Owner unsigned |
| Real Meta / 99envíos calls | **not run** | By design — no credentials/authorization in agent |
| VPS / DNS / TLS / pilot / acceptance | **not run** | `[HUMANO]` only |

**Recommendation: NO-GO for production.** Automatable closeout docs complete; live gates open.

### Design ledger updates (Task 13)

| Requirement area | Status | Evidence / gap |
| ---------------- | ------ | -------------- |
| Meta + 99envíos real evidence | `[HUMANO]` / BLOCKING | No sanitized provider IDs recorded |
| Pilot + acceptance signoff | `[HUMANO]` / BLOCKING | Training/reconcile/pilot/signoff empty |
| Productive HTTPS / VPS / DNS | `[HUMANO]` / BLOCKING | Unchanged since Task 8 |
| Prod backup dest + RPO/RTO | `[HUMANO]` / BLOCKING | Unchanged since Task 9 |
| External alert receipt | `[HUMANO]` / BLOCKING | Unchanged since Task 10 |
| Legal retention approval | `[HUMANO]` / BLOCKING | Unchanged since Task 5 |

### Exact `[HUMANO]` action list (do in order)

#### A. Infra & policy (before any live provider test)

| # | Item | Exact action | Evidence required |
| - | ---- | ------------ | ----------------- |
| A1 | VPS | Provision host; install Docker; harden SSH; open 80/443 | Hostname/IP in vault (never Git) |
| A2 | Domain | Own/point domain to VPS | `dig` A/AAAA matches VPS |
| A3 | DNS | Records for admin/API/webhook as per `proxy-https` runbook | Screenshot or zone export (no secrets) |
| A4 | TLS contact | Set ACME email / Caddy env on server | Valid cert on public URL |
| A5 | External object storage | Create S3-compatible media bucket + IAM keys; set `STORAGE_DRIVER=s3` | Health put/get opaque key |
| A6 | Backup storage | **Separate** bucket/account from media; set `BACKUP_S3_*` | Encrypted upload + restore drill log |
| A7 | Alert destination | Configure Alertmanager receiver / hosted monitor URL on server | One synthetic alert received off-server |
| A8 | Retention / RPO / RTO | Owner+legal Colombia approve matrix + numeric RPO/RTO | Signed matrix; values in vault/runbook (not invented) |

#### B. Credentials (secret channel only — never chat/Git)

| # | Item | Exact action | Evidence required |
| - | ---- | ------------ | ----------------- |
| B1 | Meta | Deliver WABA, phone number ID, verify token, app secret, access token via password manager/vault → panel Integraciones | Panel shows configured; no secret in repo |
| B2 | 99envíos | Deliver API credentials same channel → panel | Panel configured |

#### C. Authorized real validation

| # | Item | Exact action | Evidence required |
| - | ---- | ------------ | ----------------- |
| C1 | Meta preflight | Complete `meta-validation-template.md` on HTTPS URL | Verify + signature reject + inbound + outbound rows |
| C2 | Meta coexistence/templates | Only if Meta confirms; do not assume | Note from Meta / approved template name |
| C3 | 99envíos safe quote | Login + cotizar destino controlado | Sanitized quote id + timestamp in evidence-log |
| C4 | One real pre-shipment | Explicit written auth; `CAMILA_ALLOW_REAL_GUIDE=YES` only on `*_test` DB per runbook; or prod panel with owner present | Guide id partial + classification created/uncertain/failed |
| C5 | PDF + incidents | Fetch PDF (`%PDF-`); check incidents endpoints available | Size/hash optional; no customer PII in git |
| C6 | Evidence log | Fill `evidence-log.md` rows | All Meta + 99envíos rows non-empty |

#### D. Data, people, pilot, launch

| # | Item | Exact action | Evidence required |
| - | ---- | ------------ | ----------------- |
| D1 | Import/reconcile | Preview → commit; fill worksheet; owner approve each domain | Signed `reconciliation-worksheet.md` |
| D2 | Train | Run training checklist with operators | Signed `training-checklist.md` |
| D3 | Pilot | Controlled pilot per duration/budget | Incident log empty of P0/P1 or closed |
| D4 | Go/no-go | Re-score checklist; only then mark GO | All BLOCKING cleared + signatures |
| D5 | Cutover | Follow `production-launch.md` | Health + inbound verify |
| D6 | Stabilization | Daily rows for agreed days | Completed `stabilization-period.md` |
| D7 | Acceptance | Owner signs `acceptance-signoff.md` | Signed name + date |

### What was NOT done (honest)

- No Meta Graph / webhook live calls
- No 99envíos login/quote/guide/PDF live calls
- No VPS, DNS, TLS, bucket, or alert webhook provisioning
- No pilot, training, import of real catalogs, or owner acceptance
- No claim of GO

### Secrets / PII

No credentials, tokens, or personal data added in Task 13 docs.

---

## Remaining risks ranked P0–P3 (post Task 13 automatable)

| Rank | Risk | Status | Why open |
| ---- | ---- | ------ | -------- |
| **P0** | No real Meta WhatsApp evidence | OPEN `[HUMANO]` | Cannot operate sales channel in prod |
| **P0** | No real 99envíos guide/PDF evidence | OPEN `[HUMANO]` | Shipping path unproven with live account |
| **P0** | No production VPS/DNS/TLS | OPEN `[HUMANO]` | No public HTTPS surface |
| **P0** | No prod off-server backup destination + approved RPO/RTO | OPEN `[HUMANO]` | Restore drill not against real dest |
| **P0** | No external alert receipt | OPEN `[HUMANO]` | Failures may go unseen off-box |
| **P0** | Legal retention matrix unsigned | OPEN `[HUMANO]` | Destructive retention must stay blocked |
| **P1** | Owner functional-matrix sign-off missing | OPEN `[HUMANO]` | Business acceptance incomplete |
| **P1** | Catalog/stock/locality reconcile unsigned | OPEN `[HUMANO]` | Pilot data risk |
| **P1** | Operators untrained / no pilot run | OPEN `[HUMANO]` | Operational readiness |
| **P1** | Stabilization + acceptance unsigned | OPEN `[HUMANO]` | Launch incomplete by definition |
| **P2** | Optional ERROR_TRACKING_DSN / exporters | OPEN `[HUMANO]` | Observability depth |
| **P2** | Meta coexistence assumptions | OPEN `[HUMANO]` | Confirm with Meta before relying on templates |
| **P3** | Historical Fast Refresh / UX gaps (Tasks 6 addressed in code) | mitigated in repo | Monitor regressions in CI |
| **P3** | Prior 99envíos portal/dashboard quirks (2026-09-07 notes) | known | Re-validate on live account at C4 |

**Any open P0 or P1 ⇒ production recommendation = NO-GO.**

---

## Final go / no-go recommendation

| Question | Answer |
| -------- | ------ |
| Automatable Tasks 1–13 (docs/code gates) | Prepared / evidenced in repo where claimed `verified` |
| Real integration / infra / legal / pilot / acceptance | **Missing** — all `[HUMANO]` BLOCKING |
| **Recommendation** | **NO-GO** |

Do not declare production complete until evidence-log, go/no-go checklist, stabilization, and acceptance-signoff contain **real** approvals and live provider IDs (sanitized).

---
