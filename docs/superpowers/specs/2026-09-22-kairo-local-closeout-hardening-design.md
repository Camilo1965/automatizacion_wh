# KAIRO Local Closeout Hardening Design

**Date:** 2026-09-22
**Scope:** KAIRO only
**Status:** Approved for implementation

## Goal

Close every automatable defect found in the independent audit while keeping
the release at `NO-GO` until its external and human P0/P1 gates are completed.
The unused hosted verification workflow is removed. The same quality and
security guarantees remain executable locally.

## Considered approaches

### 1. Minimal patch

Delete the workflow, fix the Markdown whitespace, and leave the existing
coverage, smoke, and container setup unchanged.

This is fast but rejected because it would preserve misleading coverage gates,
unverified backup behavior, and images with fixable HIGH/CRITICAL findings.

### 2. Local release-gate hardening — selected

Replace the unused hosted workflow with documented local commands, fix the runtime
images, enforce coverage per source file, make the production smoke exercise
real S3 and backup/restore paths, and rerun all gates after the final commit.

This directly addresses the audit without changing KAIRO's product scope or
introducing an unrelated deployment platform.

### 3. Deployment-platform redesign

Replace Compose with a new orchestrator and introduce a hosted security
platform.

This is rejected as out of scope. It would add operational complexity without
being required to close the known defects.

## Architecture

### Local quality boundary

The repository remains the source of truth for verification. Root package
scripts and release documentation define the commands that a developer runs
locally. The unused hosted workflow is removed. Existing tests, security
scanners, and production checks are retained or strengthened.

### Container security boundary

Build stages may contain pnpm, Corepack, compilers, and caches. Runtime stages
must contain only the operating-system packages and application artifacts
needed at runtime. API, worker, admin, and backup use current patched official
base images pinned by digest. All four images must pass Trivy 0.74.0 with zero
fixable HIGH or CRITICAL findings. Fixable findings cannot be suppressed.

### Coverage boundary

Critical domain files must independently satisfy at least 90% line coverage
and 90% branch coverage. An aggregate percentage remains informational only.
Every modified non-critical domain file must independently satisfy at least
80% line coverage and 80% branch coverage. Time-bounded exceptions are removed
rather than renewed. Tests must exercise observable behavior, failure paths,
authorization boundaries, and state transitions.

### Production-smoke boundary

The disposable staging stack provisions separate MinIO buckets and credentials
for application media and encrypted database backups. The smoke validates:

- API, admin, worker, Postgres, MinIO, metrics, alerts, and backup process health;
- authenticated application routes;
- an S3 media put/get/delete round trip;
- a real `pg_dump`, encryption before upload, manifest and checksum validation;
- object presence in backup storage;
- restore into an isolated database, validation, and successful cleanup;
- a success heartbeat and failure if any required stage is skipped.

The production bucket, real credentials, approved RPO/RTO, external alert
destination, legal retention decision, provider integrations, pilot, and owner
acceptance remain explicit human gates.

## Error handling and cleanup

- Local gates exit non-zero on the first failed invariant.
- Coverage output identifies the exact file and deficient metric.
- Smoke failures preserve concise diagnostics but always attempt Compose
  shutdown and remove the generated staging environment file.
- Restore validation failures preserve the isolated database for investigation;
  successful drills remove it.
- Secrets are generated for the disposable run, are never printed, and are not
  committed.
- No running developer-owned container outside the disposable staging project
  is stopped or removed.

## Testing strategy

Changes to scripts and behavior follow red-green-refactor:

1. Add failing tests for per-file coverage enforcement and expired/active
   exception rejection.
2. Add failing tests for smoke configuration completeness and backup drill
   orchestration.
3. Implement the minimum changes needed to pass each test.
4. Run targeted tests after each task.
5. Build and scan all four production images.
6. Run unit, integration, E2E, coverage, build, configuration, S3, concurrency,
   smoke, Gitleaks, Trivy filesystem, and Trivy image verification.
7. Make documentation the final change and rerun formatting plus all affected
   release gates afterward.

## Acceptance criteria

- Hosted verification workflow and release claims are absent.
- `pnpm format:check` and `git show --check HEAD` pass.
- Critical coverage is enforced per file at 90/90.
- Modified non-critical coverage is enforced per file at 80/80 with no
  exceptions.
- API, admin, worker, and backup images have no fixable HIGH/CRITICAL Trivy
  findings.
- Gitleaks scans the full history without blanket exclusions for documentation,
  Markdown, or test directories.
- Production smoke proves S3 media and encrypted backup/restore behavior.
- The repository is clean after fresh verification.
- Human P0/P1 gates remain visible and the release recommendation remains
  `NO-GO` until their evidence is supplied.

## Non-goals

- No merge, deployment, provider credential entry, production data operation,
  or human sign-off is performed.
- No KAIRO feature redesign or unrelated refactor is included.
- No new hosted verification product is introduced.
