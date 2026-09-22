# KAIRO Local Closeout Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace unused GitHub CI with reproducible local release gates and close the formatting, coverage, container-security, S3, and backup-smoke defects found by the independent audit.

**Architecture:** Keep the TypeScript monorepo and Compose topology. Move gate logic into testable local Node modules, combine API unit and integration coverage, use minimal patched runtime images, and make the disposable staging smoke prove real media S3 plus encrypted backup/restore behavior. Human production gates remain explicit and keep the release at `NO-GO`.

**Tech Stack:** Node.js 24, TypeScript 6, pnpm 11.19.0, Vitest 5 with V8 coverage, Fastify, PostgreSQL 18, Docker Compose, MinIO, Gitleaks 8.30.1, Trivy 0.74.0.

## Global Constraints

- Scope is KAIRO only.
- Delete GitHub Actions automation and references; retain equivalent local gates.
- Do not merge, deploy, enter production credentials, operate on production data, or complete human sign-offs.
- Use red-green-refactor for behavior and script changes.
- Critical domain files require at least 90% lines and 90% branches individually.
- Modified non-critical domain files require at least 80% lines and 80% branches individually.
- Coverage exceptions are not allowed.
- API, admin, worker, and backup images require zero fixable HIGH/CRITICAL findings under Trivy 0.74.0.
- Do not suppress fixable vulnerabilities.
- Preserve the final `NO-GO` recommendation while human P0/P1 evidence is missing.

---

### Task 1: Replace GitHub CI with local security gates

**Files:**
- Delete: `.github/workflows/verify.yml`
- Create: `scripts/lib/local-security-gates.mjs`
- Create: `scripts/security-scan.mjs`
- Test: `apps/api/test/local-security-gates.test.ts`
- Modify: `.gitleaks.toml`
- Modify: `package.json`

**Interfaces:**
- `securityCommand(mode, root)` returns `{ command, args }` for `secrets` and `filesystem` modes.
- `PRODUCTION_IMAGES` is exactly `camila-api:local`, `camila-admin:local`, `camila-worker:local`, and `camila-backup:local`.
- `scripts/security-scan.mjs <secrets|filesystem|images|all>` exits non-zero when any scanner fails.

- [ ] **Step 1: Write failing configuration tests**

```ts
// apps/api/test/local-security-gates.test.ts
// @ts-expect-error JavaScript release-gate module has no declaration file.
import {
  PRODUCTION_IMAGES,
  securityCommand,
} from '../../../scripts/lib/local-security-gates.mjs';

it('scans every production image locally', () => {
  expect(PRODUCTION_IMAGES).toEqual([
    'camila-api:local',
    'camila-admin:local',
    'camila-worker:local',
    'camila-backup:local',
  ]);
});

it('uses pinned local scanner images and repository configuration', () => {
  expect(securityCommand('secrets', 'C:/repo').args.join(' ')).toContain(
    'zricethezav/gitleaks:v8.30.1',
  );
  expect(securityCommand('filesystem', 'C:/repo').args.join(' ')).toContain(
    'aquasec/trivy:0.74.0',
  );
});
```

- [ ] **Step 2: Run the targeted test and confirm RED**

Run: `pnpm --filter @camila/api exec vitest run --project unit test/local-security-gates.test.ts`

Expected: FAIL because `scripts/lib/local-security-gates.mjs` does not exist.

- [ ] **Step 3: Implement the local scanner command model and CLI**

```js
// scripts/lib/local-security-gates.mjs
export const PRODUCTION_IMAGES = Object.freeze([
  'camila-api:local',
  'camila-admin:local',
  'camila-worker:local',
  'camila-backup:local',
]);

export function securityCommand(mode, root) {
  if (mode === 'secrets') {
    return {
      command: 'docker',
      args: [
        'run', '--rm', '-v', `${root}:/repo`,
        'zricethezav/gitleaks:v8.30.1',
        'detect', '--source=/repo', '--config=/repo/.gitleaks.toml',
        '--verbose', '--redact', '--exit-code=1',
      ],
    };
  }
  if (mode === 'filesystem') {
    return {
      command: 'docker',
      args: [
        'run', '--rm', '-v', `${root}:/work`,
        '-v', 'camila-trivy-cache:/root/.cache/',
        'aquasec/trivy:0.74.0', 'fs',
        '--severity', 'CRITICAL,HIGH', '--exit-code', '1',
        '--ignore-unfixed', '--ignorefile', '/work/.trivyignore',
        '--skip-dirs', '**/node_modules', '--skip-dirs', '**/dist',
        '--skip-dirs', '**/coverage', '--skip-dirs', '**/test-results', '/work',
      ],
    };
  }
  throw new Error(`Unsupported security mode: ${mode}`);
}
```

The CLI must build all four images before image scanning and use the Docker
socket to let pinned Trivy inspect local images.

- [ ] **Step 4: Remove broad Gitleaks exclusions**

Keep `[extend] useDefault = true`. Remove allowlist entries that exempt all
documentation, Markdown, tests, or E2E directories. Retain only exact
non-secret placeholder regexes if an actual scan proves they are required.

- [ ] **Step 5: Delete the workflow and expose local scripts**

```json
{
  "lint:strict": "eslint . --max-warnings=0",
  "security:secrets": "node scripts/security-scan.mjs secrets",
  "security:filesystem": "node scripts/security-scan.mjs filesystem",
  "security:images": "node scripts/security-scan.mjs images",
  "security:all": "node scripts/security-scan.mjs all"
}
```

Update `verify` to use `lint:strict`; remove `lint:ci`.

- [ ] **Step 6: Verify GREEN and commit**

Run the targeted test, `pnpm lint:strict`, `pnpm security:secrets`, and
`pnpm security:filesystem`.

Commit: `build: replace unused GitHub CI with local security gates`

---

### Task 2: Enforce honest combined coverage per file

**Files:**
- Create: `scripts/lib/coverage-gate.mjs`
- Create: `scripts/test-coverage.mjs`
- Test: `apps/api/test/coverage-gate.test.ts`
- Modify: `scripts/check-coverage-gates.mjs`
- Modify: `apps/api/package.json`
- Modify: `package.json`
- Delete: `docs/release/coverage-exceptions.json`

**Interfaces:**
- `evaluateFileCoverage({ criticalFiles, modifiedFiles, summaries })` returns an array of actionable failure strings.
- API `test:coverage` executes both Vitest `unit` and `integration` projects in one V8 report.
- Root `test:coverage` starts the dedicated `postgres-test` service, runs all workspace coverage suites, evaluates gates, and stops only that test service.

- [ ] **Step 1: Write failing gate tests**

```ts
it('fails a critical file below either 90 percent metric', () => {
  const failures = evaluateFileCoverage({
    criticalFiles: ['src/whatsapp-event.ts'],
    modifiedFiles: [],
    summaries: summary('src/whatsapp-event.ts', 99, 89.99),
  });
  expect(failures).toContain(
    'critical src/whatsapp-event.ts: lines 99.00% / branches 89.99% (need ≥90/90)',
  );
});

it('fails a modified domain file below 80 percent', () => {
  const failures = evaluateFileCoverage({
    criticalFiles: [],
    modifiedFiles: ['src/auth-service.ts'],
    summaries: summary('src/auth-service.ts', 80, 79.99),
  });
  expect(failures).toHaveLength(1);
});
```

- [ ] **Step 2: Confirm RED**

Run: `pnpm --filter @camila/api exec vitest run --project unit test/coverage-gate.test.ts`

Expected: FAIL because the new gate module does not exist.

- [ ] **Step 3: Extract deterministic per-file evaluation**

Implement exact per-file comparisons before calculating informational
aggregates. Missing critical or modified files must fail instead of being
silently skipped. Remove exception loading and expiration logic completely.

- [ ] **Step 4: Combine API unit and integration coverage**

Set API `test:coverage` to:

```json
"test:coverage": "vitest run --project unit --project integration --coverage"
```

Create `scripts/test-coverage.mjs` using the same cross-platform spawn pattern
as `scripts/verify-local.mjs`, with
`TEST_DATABASE_URL=postgresql://camila_test:camila_test@127.0.0.1:5433/camila_test`.

- [ ] **Step 5: Remove exceptions and verify the gate fails honestly**

Delete `docs/release/coverage-exceptions.json`, run `pnpm test:coverage`, and
confirm RED names only genuinely under-covered files.

- [ ] **Step 6: Commit the gate before filling coverage**

Commit: `test: enforce per-file coverage without exceptions`

---

### Task 3: Close real domain branch coverage gaps

**Files:**
- Modify: `apps/api/test/auth-service.test.ts`
- Modify: `apps/api/test/conversation-state.test.ts`
- Modify: `apps/api/test/locality-catalog.integration.test.ts`
- Modify: `apps/api/test/retention-service.test.ts`
- Modify: `apps/api/test/retention.integration.test.ts`
- Modify: `apps/api/test/global-search.integration.test.ts`
- Create: `apps/api/test/guide-delivery-service.integration.test.ts`
- Modify: `apps/api/test/whatsapp-event.test.ts`

**Interfaces:**
- No production API changes are expected.
- Tests exercise existing public service functions and repository behavior.

- [ ] **Step 1: Add RED branch cases for auth and retention**

Cover inactive/missing confirmation users, denied current-password checks,
MFA/session option branches, duplicate/unknown retention classes, unsupported
actions, unapproved policies, disabled execute mode, missing irreversible
confirmation, dry-run and execute outcomes.

Run the targeted files with both unit and integration projects and confirm the
new assertions fail only where a fixture or branch expectation is incomplete.

- [ ] **Step 2: Add conversation and WhatsApp parser edge cases**

Add explicit assertions for invalid half sizes, comma decimal sizes, empty
messages, advisor handoff, completed-state input, malformed entries/changes,
missing metadata, non-record messages, invalid timestamps, and absent text.

- [ ] **Step 3: Add locality and search branch cases**

Exercise empty import, malformed CSV, reused preview, already-active publish,
stale base version, restore publish, short search query, escaped `%`/`_` query,
null optional columns, per-kind limit rounding, and final result truncation.

- [ ] **Step 4: Add real guide-delivery integration coverage**

The new integration file must prove:

```ts
it('returns false when no guide is ready');
it('enqueues a stored PDF exactly once');
it('records a retry without alert before the third failure');
it('opens an alert on the third PDF failure');
it('rejects a completed guide without stored PDF metadata');
it('skips conversations with sendGuideToCustomer disabled');
```

- [ ] **Step 5: Run combined coverage and iterate one branch at a time**

Run `pnpm test:coverage`. For every failing file, inspect uncovered line and
branch output, add one behavior test, observe the deficient metric increase,
and repeat until every critical file is at least 90/90 and every modified
non-critical file is at least 80/80.

- [ ] **Step 6: Commit**

Commit: `test: close KAIRO domain coverage gaps`

---

### Task 4: Produce minimal vulnerability-clean runtime images

**Files:**
- Modify: `docker/Dockerfile.api`
- Modify: `docker/Dockerfile.worker`
- Modify: `docker/Dockerfile.admin`
- Modify: `docker/Dockerfile.backup`

**Interfaces:**
- API command remains `node dist/server.js`.
- Worker command remains `node dist/worker.js`.
- Admin remains unprivileged nginx on port 8080.
- Backup remains `node /app/scripts/backup-postgres.mjs --loop` compatible.

- [ ] **Step 1: Record the real failing security behavior**

Build the four current production images and run Trivy 0.74.0 against each.
The verified RED baseline is API 5 HIGH, worker 5 HIGH, backup 5 HIGH, and
admin 37 HIGH/CRITICAL package findings. This real scanner failure is the
regression test; do not replace it with source-text assertions.

- [ ] **Step 2: Split Node build and runtime stages**

Use the currently verified slim base:

```dockerfile
FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS build
```

Use the same base in a fresh runtime stage and remove package-manager content
that is not required to execute deployed JavaScript:

```dockerfile
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
    /usr/local/lib/node_modules/corepack /root/.cache
```

Do not copy build caches or workspace source into runtime.

- [ ] **Step 3: Patch admin and backup runtimes**

Use:

```dockerfile
FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:04a3275f25d766cff8926d2e57b2ff34a783d6b12a702dc98bb82226d2d9a508 AS runtime
```

For backup, install `postgresql-client` on the slim Node base after
`apt-get update && apt-get upgrade -y`, clear apt lists, and remove npm,
Corepack, and caches.

- [ ] **Step 4: Build, functionally smoke, and scan all four images**

Run `docker compose --env-file .env.prod.example -f compose.prod.yaml build --pull migrate worker admin backup`, inspect all four commands/users, then run `pnpm security:images`.

Expected: four images scanned, zero fixable HIGH/CRITICAL findings.

- [ ] **Step 5: Commit**

Commit: `build: harden KAIRO production runtime images`

---

### Task 5: Make staging smoke prove S3 and encrypted backup restore

**Files:**
- Create: `scripts/lib/production-smoke-helpers.mjs`
- Test: `apps/api/test/production-smoke-helpers.test.ts`
- Create: `apps/api/src/cli/storage-smoke.ts`
- Test: `apps/api/test/storage-smoke.test.ts`
- Modify: `compose.staging.yaml`
- Modify: `scripts/production-smoke.mjs`

**Interfaces:**
- `renderStagingEnv(secrets)` returns an env string containing distinct media and backup credentials.
- `parseBackupId(output)` returns the `camila-YYYYMMDDTHHMMSSZ` identifier from backup output or throws.
- `assertBackupHeartbeat(metrics)` requires successful backup and successful restore-drill fields.
- `storage-smoke.ts` performs put/get/exists/delete using the production S3 adapter and exits non-zero on mismatch.

- [ ] **Step 1: Write failing helper tests**

```ts
it('renders distinct media and backup S3 credentials', () => {
  const env = renderStagingEnv(fixedSecrets);
  expect(value(env, 'S3_ACCESS_KEY_ID')).not.toBe(
    value(env, 'BACKUP_S3_ACCESS_KEY_ID'),
  );
});

it('requires both backup and restore success in heartbeat metrics', () => {
  expect(() => assertBackupHeartbeat({ lastSuccessfulBackupAt: 'x' })).toThrow(
    /restore drill/i,
  );
});
```

- [ ] **Step 2: Confirm RED and implement helpers**

Run the targeted unit test, implement only the parsing/rendering/assertion
logic, and rerun to GREEN.

- [ ] **Step 3: Add and test the in-container storage smoke CLI**

The CLI must use `createObjectStorage(config, 'photos')`, write random bytes
under an opaque key, read and byte-compare them, assert existence, delete the
key, and assert non-existence. Unit-test the orchestration with a real in-memory
contract adapter before wiring the CLI entrypoint.

- [ ] **Step 4: Provision separate staging credentials**

Generate `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, and
`BACKUP_ENCRYPTION_KEY` in `.env.staging`. Update `minio-init` to create the
backup bucket and a distinct MinIO backup user, then attach only the policy
needed for that bucket. Never print either secret.

- [ ] **Step 5: Execute and verify the real drill in smoke**

After health and login:

1. run the storage smoke CLI inside the API image;
2. run a one-shot backup with `BACKUP_LOOP=0`;
3. parse its backup ID;
4. run `verify-backup.mjs` against the uploaded object;
5. run `restore-postgres-drill.mjs` with that ID;
6. read heartbeat metrics from the backup volume;
7. require backup success, restore success, and `cleaned: true`;
8. require every mandatory Compose service to be running/healthy or to have
   completed successfully as designed.

Any failed step must make smoke exit non-zero and enter the existing cleanup
path.

- [ ] **Step 6: Run full smoke and commit**

Run: `pnpm production:smoke`

Expected PASS sequence includes `storage-s3`, `backup-upload`,
`backup-verify`, `restore-drill`, and `backup-heartbeat` before shutdown.

Commit: `test: prove S3 and backup restore in production smoke`

---

### Task 6: Reconcile documentation and final local release command

**Files:**
- Create: `scripts/verify-release.mjs`
- Test: `apps/api/test/verify-release.test.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/pilot/go-no-go-checklist.md`
- Modify: `docs/release/definitive-closeout-evidence.md`
- Modify: `docs/release/_task11-implementer-report.md`
- Modify: historical KAIRO specs/plans containing GitHub Actions or `lint:ci`

**Interfaces:**
- `pnpm verify:release` runs local functional, coverage, production,
  secret, filesystem, and image gates in a fixed fail-fast order.

- [ ] **Step 1: Write a failing fail-fast runner test**

Extract `runReleaseSteps(steps, run)` into a side-effect-free helper. Test with
three literal commands and an injected runner that returns exit code 7 for the
second command. Assert that the function returns 7 and never invokes the third
command. A second case runs the real declared step metadata in dry-run mode and
asserts every step has a non-empty name, command, and arguments.

- [ ] **Step 2: Implement the release runner**

Use cross-platform `spawnSync` with inherited stdio and immediate non-zero
exit. Reuse existing scripts instead of duplicating their logic.

- [ ] **Step 3: Remove GitHub CI terminology and stale evidence**

Delete `.github/workflows/verify.yml`; update active and historical KAIRO
documents so they describe local gates. Replace `lint:ci` with `lint:strict`.
Do not claim a scanner passed until the fresh final run proves it.

- [ ] **Step 4: Correct the evidence ledger**

Record the combined coverage model, per-file thresholds, absence of
exceptions, scanner versions, four image digests, full smoke stages, and
remaining human blockers. Remove the trailing whitespace at the old final
timestamp line.

- [ ] **Step 5: Verify terminology and formatting**

Run:

```powershell
rg -n -i "github actions|\.github/workflows|lint:ci" README.md CONTRIBUTING.md docs package.json
pnpm format:check
git diff --check
```

Expected: `rg` has no matches; formatting and diff checks exit zero.

- [ ] **Step 6: Commit**

Commit: `docs: make KAIRO closeout local and reproducible`

---

### Task 7: Fresh final verification after the last commit

**Files:**
- Modify only if a fresh gate exposes a defect attributable to this plan.

**Interfaces:**
- No new interfaces.

- [ ] **Step 1: Start from a clean repository state**

Run `git status --short --branch` and require no pending changes.

- [ ] **Step 2: Execute the complete local release gate**

Run: `pnpm verify:release`

Capture exact exit codes, unit/integration/E2E totals, per-file coverage,
security-scan totals, smoke stages, and image digests.

- [ ] **Step 3: Repeat concurrency three times**

Run the critical concurrency suite three consecutive times against the
dedicated test database. Require 10/10 on each run.

- [ ] **Step 4: Verify final commit integrity**

Run:

```powershell
pnpm format:check
git diff --check
git show --check --oneline --stat HEAD
git status --short --branch
```

- [ ] **Step 5: Report actual status without merging**

Report automatable evidence and keep `NO-GO` for every unresolved human P0/P1.
Do not push, merge, deploy, or convert human gates into automated claims.
