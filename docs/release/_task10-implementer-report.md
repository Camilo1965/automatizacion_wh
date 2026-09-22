# Task 10 implementer report — Metrics, error tracking, external alerts

**Branch:** `cursor/kairo-definitive-closeout`  
**Base HEAD:** `2c3671f`  
**Date:** 2026-09-22

## Delivered

- `apps/api/src/modules/observability/metrics.ts` — lightweight Prometheus registry (no prom-client)
- `error-reporter.ts` — optional DSN, PII scrub, release SHA, correlation ID
- `collect-gauges.ts` + `metrics-server.ts` — queue/backup/DB/worker gauges; worker HTTP scrape
- Wired `app.ts` / `runtime.ts` / `worker.ts`; outbox + shipping guide workers emit outcomes
- `infra/prometheus/{prometheus,alerts}.yml` + `infra/alertmanager/alertmanager.yml.example`
- Runbook `docs/runbooks/monitoring-alerts.md`
- Compose: scrape targets, worker `:9091`, backup heartbeat volume RO on api/worker
- Tests: `apps/api/test/metrics.test.ts`

## Verification

| Check | Result |
| --- | --- |
| metrics unit | 9 passed |
| typecheck (@camila/api) | pass |
| compose.prod config | pass |
| Synthetic series | present in `/metrics` text |
| External webhook receipt | `[HUMANO]` |

## [HUMANO]

Alertmanager webhook URL, real external receipt evidence, optional error-tracking DSN + host exporters (disk/cert).
