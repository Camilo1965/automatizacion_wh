# Lanzamiento a producción

## Pre-cutover

1. Tag git de release + notas.
2. Backup cifrado off-server `[HUMANO]`.
3. `compose.prod` / imágenes en VPS `[HUMANO]`.
4. Migraciones (`pnpm db:migrate` o job migrate).
5. Worker + API health `/health/ready`.
6. DNS + HTTPS `[HUMANO]`.
7. Smoke login + búsqueda + un pedido draft.

## Cutover

1. Pausar bot si hay migración de número.
2. Apuntar webhook Meta al prod `[HUMANO]`.
3. Verificar inbound.
4. Monitorear worker (outbox, guías).

## Rollback

1. Revert DNS / webhook al staging.
2. Restore DB desde backup drill documentado.
3. Imagen previa de api/worker/admin.
