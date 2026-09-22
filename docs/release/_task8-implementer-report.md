# Task 8 implementer report — Production topology + real health checks

**Branch:** `cursor/kairo-definitive-closeout`  
**Base HEAD:** `e1dc92c`  
**Date:** 2026-09-22

## Delivered

- One-shot `migrate` (shared API image) gates api/worker
- `worker-health.ts` + CLI; worker heartbeat via runtime loop; Dockerfile healthcheck
- `compose.prod.yaml` + `compose.staging.yaml` (loopback 18080/18443, MinIO, tls internal)
- Admin non-root `nginxinc/nginx-unprivileged@sha256:65e3…`, listen 8080
- Caddy digest-pinned; health_uri upstreams; prod 80/443; `CAMILA_DOMAIN` required
- Hardening: read_only, tmpfs, cap_drop, security_opt, restart, cpus/mem_limit
- Digest pins: node, postgres, caddy, nginx-unprivileged, prometheus, alertmanager
- Prod config refuses HTTP admin origin, blank/example secrets, local storage
- Backup Dockerfile stub + prometheus/alertmanager stubs
- `scripts/production-smoke.mjs` + `pnpm production:smoke`
- Runbooks `api-worker.md`, `proxy-https.md` updated

## Verification

| Check                       | Result         |
| --------------------------- | -------------- |
| worker-health + config unit | 23 passed      |
| API typecheck               | pass           |
| compose.prod config         | pass           |
| production:smoke            | PASS full path |

## [HUMANO]

Production TLS: set real `CAMILA_DOMAIN` + DNS + ACME email. Alert/backup destinations → Tasks 9–10.
