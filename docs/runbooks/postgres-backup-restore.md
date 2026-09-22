# Runbook — Postgres backup cifrado y restore drill

## Cuándo usar

- Backup programado de producción (contenedor `backup`).
- Drill de restore antes de confiar en copias.
- Recuperación tras incidente (ventana de mantenimiento).

## Arquitectura

1. `pg_dump --format=custom` (password vía `PGPASSWORD`, **nunca** en argv).
2. Cifrado AES-256-GCM **antes** de salir del servidor (`BACKUP_ENCRYPTION_KEY`).
3. Manifest JSON: SHA-256 del dump, schema version (drizzle), timestamp, tamaños.
4. Upload a bucket S3-compatible **separado** del media app (`BACKUP_S3_*` ≠ `S3_*`).
5. Retención configurable (`BACKUP_RETENTION_DAYS`).
6. Heartbeat/métricas: `backups/heartbeat.json` + opcional `BACKUP_HEARTBEAT_URL`.
7. Drill: descarga → verifica checksum → restore a DB aislada → conteos muestra → `DROP` **solo si OK**.

## Contenedor programado

Compose prod/staging levanta `backup` con `BACKUP_LOOP=1` (intervalo `BACKUP_INTERVAL_SECONDS`, default 86400).

```bash
docker compose -f compose.prod.yaml --env-file .env.prod up -d --build backup
docker compose -f compose.prod.yaml --env-file .env.prod logs -f backup
```

One-shot:

```bash
docker compose -f compose.prod.yaml --env-file .env.prod run --rm -e BACKUP_LOOP=0 backup \
  node /app/scripts/backup-postgres.mjs
```

## Host / Windows

```powershell
$env:DATABASE_URL = 'postgresql://...'
$env:BACKUP_ENCRYPTION_KEY = '...' # 32-byte base64
$env:BACKUP_S3_ENDPOINT = 'https://...'
$env:BACKUP_S3_BUCKET = 'kairo-backups'
$env:BACKUP_S3_ACCESS_KEY_ID = '...'
$env:BACKUP_S3_SECRET_ACCESS_KEY = '...'
node scripts/backup-postgres.mjs
node scripts/backup-heartbeat.mjs
```

Verificar artefacto:

```powershell
$env:BACKUP_ID = '20260922T120000Z'
node scripts/verify-backup.mjs
```

## Restore drill

```powershell
$env:BACKUP_ID = '20260922T120000Z'
$env:DATABASE_URL = 'postgresql://...@127.0.0.1:5432/camila'
node scripts/restore-postgres-drill.mjs
```

Si la validación falla: la DB drill **permanece** para inspección; no hay cleanup destructivo automático.

## `[HUMANO]` — política operativa

| Campo | Valor |
| --- | --- |
| RPO objetivo | `[HUMANO]` (p. ej. ≤ 24 h con intervalo diario) |
| RTO objetivo | `[HUMANO]` (tiempo drill medido en staging) |
| Retención | `[HUMANO]` — default código 14 días; aprobar antes de prod |
| Bucket prod + policy | `[HUMANO]` — cuenta/credenciales **distintas** de media; versioning/Object Lock opcional |
| Destino alerta / heartbeat | `[HUMANO]` — `BACKUP_HEARTBEAT_URL` u monitor externo |
| Credenciales backup | Nunca chat/Git; solo `.env.prod` en VPS |

Staging puede usar MinIO (`kairo-backups-staging`) para drills. Destino de producción permanece `[HUMANO]` hasta suministrar endpoint/credenciales reales.

## Restore a producción

1. Detenga tráfico (Caddy / API / worker).
2. Backup fresco cifrado + upload.
3. `pg_restore` contra prod **solo** con runbook aprobado (no use el drill script contra prod).
4. Migraciones si el dump no incluye el último esquema.
5. Verifique `/health/ready` y heartbeat.

## Bash en Windows

Los `.sh` delegan a los `.mjs`. Preferir Node en PowerShell.
