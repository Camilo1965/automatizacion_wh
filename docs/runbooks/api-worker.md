# Runbook — API y worker

## Servicios

| Servicio  | Imagen                     | Proceso                                  |
| --------- | -------------------------- | ---------------------------------------- |
| `migrate` | `docker/Dockerfile.api`    | one-shot `node dist/database/migrate.js` |
| `api`     | `docker/Dockerfile.api`    | `node dist/server.js`                    |
| `worker`  | `docker/Dockerfile.worker` | `node dist/worker.js`                    |

API y worker comparten runtime (`createRuntime()`), config vía env y volumen `media_data` en `/data/media` (origen local / fallback; runtime prod usa `STORAGE_DRIVER=s3`).

## Arranque producción

```bash
cp .env.prod.example .env.prod
# Editar secretos reales — nunca change_me / example
docker compose -f compose.prod.yaml --env-file .env.prod up -d --build
```

`migrate` termina con éxito **antes** de que `api`/`worker` acepten tráfico. Ambos dependen de Postgres healthy + migrate `service_completed_successfully`.

## Arranque staging (loopback)

```bash
pnpm production:smoke
```

Staging publica Caddy en `127.0.0.1:18080` / `18443` con `tls internal`. No requiere DNS público. El comando crea un proyecto Compose y etiquetas de imagen únicos y borra únicamente sus propios recursos. No arranques `compose.staging.yaml` manualmente bajo el proyecto `camila-prod`.

## Migraciones

Automáticas vía servicio `migrate` (misma imagen de aplicación). Manual de emergencia:

```bash
docker compose -f compose.prod.yaml --env-file .env.prod run --rm migrate
```

Desarrollo local: `pnpm db:migrate`.

## Health

| Componente    | Check                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| API liveness  | `GET /health/live`                                                                                                              |
| API readiness | `GET /health/ready` (DB ping)                                                                                                   |
| Worker        | archivo `/tmp/kairo-worker-health.json` + CLI `dist/modules/health/worker-health-cli.js` (DB + scheduler init + heartbeat ≤90s) |
| Metrics       | API `GET /metrics` + worker `:9091/metrics` (internal network only; see `monitoring-alerts.md`)                                 |
| Admin         | `GET http://admin:8080/`                                                                                                        |
| Caddy         | espera upstreams healthy (`health_uri`)                                                                                         |

Worker **ya no** usa `process.exit(0)` incondicional.

## Config obligatoria en producción

Ver `.env.prod.example`. `loadConfig` en `NODE_ENV=production` rechaza:

- `ADMIN_ORIGIN` HTTP (solo HTTPS)
- Clave de cifrado ausente / inválida / placeholder
- `STORAGE_DRIVER=local`
- Contraseñas/ejemplo (`change_me`, etc.) en DB URL, S3 o 99envíos

## Operación

- **Reinicio API:** `docker compose -f compose.prod.yaml restart api`
- **Reinicio worker:** `docker compose -f compose.prod.yaml restart worker`
- **Logs:** `docker compose -f compose.prod.yaml logs -f api worker migrate`
- **Escalar worker:** una réplica suele bastar; múltiples replicas requieren revisar idempotencia de jobs.

## `[HUMANO]`

- Ventana de despliegue y rollback.
- Canal de alertas externas (webhook Alertmanager) — ver `monitoring-alerts.md`.
