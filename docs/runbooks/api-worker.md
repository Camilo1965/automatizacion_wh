# Runbook — API y worker

## Servicios

| Servicio | Imagen                     | Proceso               |
| -------- | -------------------------- | --------------------- |
| `api`    | `docker/Dockerfile.api`    | `node dist/server.js` |
| `worker` | `docker/Dockerfile.worker` | `node dist/worker.js` |

Ambos comparten runtime (`createRuntime()`), config vía variables de entorno y volumen `media_data` en `/data/media`.

## Arranque (compose prod)

```bash
cp .env.prod.example .env.prod
# Editar secretos en .env.prod — solo en servidor
docker compose -f compose.prod.yaml --env-file .env.prod up -d --build
```

`api` espera `postgres` healthy. `worker` no expone HTTP; healthcheck mínimo de proceso.

## Migraciones

Antes de tráfico real o tras desplegar schema nuevo:

```bash
docker compose -f compose.prod.yaml --env-file .env.prod run --rm \
  -e DATABASE_URL=postgresql://USER:PASS@postgres:5432/DB \
  api node dist/database/migrate.js
```

(Asegure que la imagen incluye `dist/database/migrate.js` del build estándar.)

Desarrollo local: `pnpm db:migrate` con `.env` apuntando a compose local.

## Health

- Liveness: `GET /health/live`
- Readiness (DB): `GET /health/ready`

Desde la red interna: `http://api:3000/health/ready`.

## Config obligatoria en producción

Ver `.env.prod.example`. En `NODE_ENV=production`:

- `KAIRO_CONFIG_ENCRYPTION_KEY` (32 bytes base64)
- `ADMIN_ORIGIN` (URL pública del panel)
- `DATABASE_URL` (inyectada por compose en api/worker)
- `MEDIA_ROOT=/data/media`

WhatsApp y 99envíos: ver runbooks dedicados; credenciales pueden vivir cifradas en panel una vez exista la clave maestra.

## Operación

- **Reinicio API:** `docker compose -f compose.prod.yaml restart api`
- **Reinicio worker:** `docker compose -f compose.prod.yaml restart worker`
- **Logs:** `docker compose -f compose.prod.yaml logs -f api worker`
- **Escalar worker:** una réplica suele bastar; múltiples workers requieren revisar idempotencia de jobs (fuera de alcance Fase 7).

## `[HUMANO]`

- Ventana de despliegue y rollback acordados.
- Canal de alertas si `/health/ready` falla de forma sostenida.
