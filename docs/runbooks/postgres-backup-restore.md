# Runbook — Postgres backup y restore

## Cuándo usar

- Backup programado de producción.
- Prueba de restore (drill) antes de confiar en copias.
- Recuperación tras incidente (con ventana de mantenimiento).

## Backup lógico

Requisitos: `pg_dump` (cliente), `DATABASE_URL` hacia la instancia (desde la VPS o túnel; **no** exponga Postgres a Internet).

```bash
export DATABASE_URL='postgresql://USER:PASS@127.0.0.1:5432/camila'
./scripts/backup-postgres.sh
```

Windows (PowerShell):

```powershell
$env:DATABASE_URL = 'postgresql://...'
node scripts/backup-postgres.mjs
```

Salida por defecto: `./backups/postgres/camila-<UTC-stamp>.dump` (formato custom).

### `[HUMANO]`

- Destino **fuera del servidor** (otro bucket, otro host, copia offline).
- Retención acordada (p. ej. 7 diarios + 4 semanales).
- Alertas si el job de backup falla o el archivo no crece.

En compose prod, Postgres no publica puerto en `0.0.0.0`. Ejecute backup **en la VPS** (`docker compose exec` + URL interna) o vía túnel SSH a loopback.

Ejemplo desde la VPS (URL interna):

```bash
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}"
docker compose -f compose.prod.yaml --env-file .env.prod run --rm --no-deps \
  -e DATABASE_URL \
  postgres pg_dump --format=custom --no-owner --no-acl -f /tmp/camila.dump "$DATABASE_URL"
```

(Ajuste montajes/volúmenes según su política; el script en host con cliente `pg_dump` es equivalente.)

## Restore drill (base scratch)

Nunca apunte el drill a la base de producción salvo mantenimiento explícito.

```bash
export DUMP=./backups/postgres/camila-20260101T120000Z.dump
export DATABASE_URL=postgresql://USER:PASS@127.0.0.1:5432/postgres
export DRILL_DB=camila_restore_drill
./scripts/restore-postgres-drill.sh
```

Valide conteos / login admin / una orden de prueba. Luego elimine la base drill.

## Restore a producción

1. Detenga tráfico (Caddy / API / worker).
2. Backup fresco de la base actual.
3. `pg_restore --clean --if-exists` contra la base de producción **solo** con runbook aprobado.
4. Migraciones: `pnpm --filter @camila/api db:migrate` si el dump no incluye el último esquema.
5. Reinicie servicios y verifique `/health/ready`.

## Bash en Windows

Los `.sh` funcionan en **Git Bash** o **WSL**. En PowerShell nativo use los `.mjs`.
