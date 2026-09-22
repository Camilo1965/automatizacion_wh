# Fase 7 — Infraestructura y despliegue

**Objetivo:** Imágenes reproducibles, compose de producción, respaldos Postgres, runbooks operativos. Sin romper `compose.yaml` local ni `pnpm verify`.

**Puerta automatizable:** Dockerfiles construyen; `compose.prod.yaml` válido; scripts backup/restore documentados; runbooks enlazados.

**Puerta `[HUMANO]`:** DNS, VPS, certificados TLS, destino off-server de backups, canales de alerta.

## Entregables

| # | Artefacto | Estado |
|---|-----------|--------|
| 1 | [docker/Dockerfile.api](../../../docker/Dockerfile.api) | |
| 2 | [docker/Dockerfile.worker](../../../docker/Dockerfile.worker) | |
| 3 | [docker/Dockerfile.admin](../../../docker/Dockerfile.admin) | |
| 4 | [compose.prod.yaml](../../../compose.prod.yaml) | |
| 5 | [.env.prod.example](../../../.env.prod.example) | |
| 6 | [scripts/backup-postgres.sh](../../../scripts/backup-postgres.sh) | |
| 7 | [scripts/restore-postgres-drill.sh](../../../scripts/restore-postgres-drill.sh) | |
| 8 | [scripts/backup-postgres.mjs](../../../scripts/backup-postgres.mjs) | |
| 9 | [scripts/restore-postgres-drill.mjs](../../../scripts/restore-postgres-drill.mjs) | |
| 10 | Runbooks en [docs/runbooks/](../../runbooks/) | |

## Alcance

- API + worker: misma imagen base, entrypoints distintos.
- Admin: build Vite + nginx SPA.
- Postgres: solo red interna / loopback en host; no exposición pública.
- Media: volumen compartido API/worker (`MEDIA_ROOT`).
- Proxy: Caddy (TLS comentado hasta `[HUMANO]`).
- S3: **no** en esta fase; media en volumen (ver [storage-media.md](../../runbooks/storage-media.md)).

## Fuera de alcance (fases posteriores)

- CI/CD remoto, Terraform, observabilidad gestionada, rotación automática de secretos.

## Verificación local (sin desplegar)

```bash
docker compose -f compose.prod.yaml config
docker build -f docker/Dockerfile.api -t camila-api:local .
docker build -f docker/Dockerfile.worker -t camila-worker:local .
docker build -f docker/Dockerfile.admin -t camila-admin:local .
```

Migraciones antes de tráfico: ver [api-worker.md](../../runbooks/api-worker.md).

## Checklist `[HUMANO]`

- [ ] Registros DNS (`A`/`AAAA`) hacia la VPS
- [ ] VPS aprovisionada (firewall: 80/443; **no** 5432 público)
- [ ] Certificados TLS (Caddy automático o PEM manual)
- [ ] Copias de `pg_dump` fuera del servidor (S3, otro host, etc.)
- [ ] Alertas (uptime, disco, fallos backup) a canal acordado

**Estado:** Fundaciones en repo; despliegue real pendiente de checklist humano.
