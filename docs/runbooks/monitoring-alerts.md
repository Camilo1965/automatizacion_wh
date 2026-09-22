# Runbook — Monitoring & external alerts

## Scope

Prometheus + Alertmanager run on the **internal** Compose network only (`expose`, no host ports). API `/metrics` and worker `:9091/metrics` are **not** routed by Caddy.

Labels are bounded enums (`route_group`, `queue`, `outcome`, `provider`). Never put phones, names, order IDs, or free-text errors in metric labels.

## Components

| Piece | Where | Notes |
| --- | --- | --- |
| API metrics | `api:3000/metrics` | HTTP + DB/queue/backup gauges on scrape |
| Worker metrics | `worker:9091/metrics` | Heartbeat, jobs, WhatsApp, guides, scheduler |
| Prometheus | `metrics:9090` | Scrapes API + worker |
| Alertmanager | `alertmanager:9093` | Routes alerts; webhook is `[HUMANO]` |

Optional protection: set `METRICS_TOKEN` and configure Prometheus `authorization` bearer (operator-managed secret file).

## Correlation IDs

- HTTP: client may send `x-correlation-id` (8–64 `[A-Za-z0-9._-]`); otherwise Fastify generates UUID. Echoed on responses.
- Jobs / provider failures: sanitized error reports include `correlationId` when available.
- Error tracking DSN (`ERROR_TRACKING_DSN`): optional; payloads are PII-scrubbed and include `KAIRO_RELEASE_SHA`.

## Alert catalogue

| Alert | Meaning | First action |
| --- | --- | --- |
| `KairoApiDown` | Prometheus cannot scrape API | `docker compose … logs api`; check migrate/health |
| `KairoWorkerDown` | Worker metrics port down | Restart worker; check `WORKER_METRICS_PORT` |
| `KairoWorkerHeartbeatStale` | Heartbeat >90s | Inspect worker loops / DB locks |
| `KairoDatabaseNotReady` | `kairo_db_ready=0` | Postgres health + `DATABASE_URL` |
| `KairoQueueDepthHigh` / `KairoQueueOldestAge` | Backlog | Inspect outbox / guide jobs |
| `KairoProviderFailuresRepeated` | WhatsApp/shipping failures | Provider status + credentials |
| `KairoGuideUncertain` | Uncertain guide | Manual review before retry |
| `KairoBackupTooOld` / `KairoBackupFailed` | Backup gate | See `postgres-backup-restore.md` |
| `KairoDiskPressure` | Needs node_exporter | Free disk / expand volume `[HUMANO]` |
| `KairoCertificateExpiring` | Needs TLS probe | Renew cert / Caddy ACME `[HUMANO]` |
| `KairoSyntheticFailure` | Staging alert-path drill | Confirm external receipt |

## Synthetic failure drill (staging)

```bash
# From API container or a one-shot Node script importing MetricsRegistry:
# metrics.recordSyntheticFailure('provider')
# Then scrape /metrics and confirm Alertmanager fired KairoSyntheticFailure.
```

Until a real webhook is configured, mark external receipt **`[HUMANO]`**.

## `[HUMANO]` checklist

1. Provide external alert webhook / hosted monitor URL (Slack, Discord, PagerDuty, Better Stack, etc.).
2. Copy `infra/alertmanager/alertmanager.yml.example` → server-local config; inject webhook **outside git**.
3. Optionally set `ERROR_TRACKING_DSN` + `KAIRO_RELEASE_SHA` for production error tracking.
4. Optionally enable node_exporter + TLS cert probe for disk/cert alerts.
5. Record one real external alert receipt (screenshot or mailbox) after synthetic drill.

## Related

- `docs/runbooks/api-worker.md`
- `docs/runbooks/postgres-backup-restore.md`
- `docs/runbooks/incident-response.md`
