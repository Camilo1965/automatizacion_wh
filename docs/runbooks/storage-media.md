# Runbook — Almacenamiento de media (fotos catálogo)

## Modelo actual (Fase 7)

- Implementación: **almacenamiento local** (`LocalPhotoStorage`) bajo `MEDIA_ROOT`.
- Producción compose: volumen Docker `media_data` montado en **api** y **worker** en `/data/media`.
- `MEDIA_ROOT=/data/media` en `.env.prod`.

API y worker deben ver **el mismo** volumen; de lo contrario las fotos subidas por HTTP no estarán disponibles para jobs del worker.

## Backup

- Incluya el volumen `media_data` (snapshot de disco, `tar`, o backup del proveedor VPS) además de Postgres.
- Restaurar media **y** base juntos mantiene coherentes `photo_storage_key` en DB.

## S3 / object storage

**No implementado en Fase 7.** No hay dependencia AWS en imágenes Docker.

Si más adelante se añade S3:

- Variables típicas: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`.
- Migración: copiar objetos existentes y actualizar keys en DB con ventana de mantenimiento.

Hasta entonces, trate el volumen como fuente de verdad.

### `[HUMANO]`

- Tamaño de disco monitoreado (fotos crecen con catálogo).
- Política de retención si se eliminan referencias (orphan files — limpieza manual o job futuro).
