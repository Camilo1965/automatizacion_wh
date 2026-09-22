# Runbook — Almacenamiento de media (fotos + PDFs de guías)

## Modelo actual

- Contrato: `ObjectStorage` (`put` / `get` / `exists` / `delete`) con claves opacas path-safe.
- Drivers:
  - `STORAGE_DRIVER=local` — desarrollo y pruebas (`MEDIA_ROOT`).
  - `STORAGE_DRIVER=s3` — **obligatorio en producción**; endpoint S3-compatible externo.
- Adaptadores de dominio:
  - fotos: `LocalPhotoStorage` → ObjectStorage namespace `photos`
  - PDFs de guía: `LocalGuidePdfStorage` → ObjectStorage namespace `guides`
- Antes de marcar un objeto listo se verifican content-type, tamaño y SHA-256.

## Variables

| Variable | Uso |
| --- | --- |
| `STORAGE_DRIVER` | `local` \| `s3` |
| `MEDIA_ROOT` | raíz local / origen de migración |
| `S3_ENDPOINT` | URL del servicio S3-compatible |
| `S3_BUCKET` | bucket compartido por api y worker |
| `S3_REGION` | región (requerida por el SDK) |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | credenciales (nunca en Git) |
| `S3_FORCE_PATH_STYLE` | `true` típico para MinIO/path-style |
| `S3_TLS_REJECT_UNAUTHORIZED` | validación TLS (`true` en prod) |

API y worker deben usar **el mismo** driver y bucket.

## MinIO (solo test/staging)

```bash
docker compose --profile test up -d minio minio-init
```

No montar MinIO como almacén de `compose.prod.yaml`.

## Migración local → object storage

Dry-run (no escribe destino, no borra origen):

```bash
pnpm --filter @camila/api storage:migrate-media
```

Execute (copia + verifica hashes; **conserva** archivos locales):

```bash
pnpm --filter @camila/api storage:migrate-media -- --execute
```

Conserve origen hasta que el reporte confirme `migrated`/`skipped_existing` y `mismatched=0`.

## Backup

- Con driver `s3`: backup del bucket (proveedor) + Postgres.
- Con driver `local`: volumen `media_data` + Postgres.

### `[HUMANO]`

- Provisionar bucket S3-compatible externo y credenciales de producción.
- Monitorear crecimiento del catálogo / guías.
