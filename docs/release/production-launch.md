# Lanzamiento a producción

**Estado Task 13 (2026-09-22):** runbook `verified` (automatable). **Cutover real = `[HUMANO]` / BLOCKING.** No se ejecutó deploy VPS ni cutover Meta. **NO-GO** hasta cerrar gates.

## Pre-cutover

| #   | Paso                                          | Estado                                                        |
| --- | --------------------------------------------- | ------------------------------------------------------------- |
| 1   | Tag git de release + notas                    | Automatable cuando GO; **hoy BLOCKING** (no hay GO)           |
| 2   | Backup cifrado off-server                     | Drill auto OK; **destino prod BLOCKING** `[HUMANO]`           |
| 3   | `compose.prod` / imágenes en VPS              | Artefactos repo OK; **VPS provision BLOCKING** `[HUMANO]`     |
| 4   | Migraciones (`pnpm db:migrate` o job migrate) | Código OK; **apply en prod BLOCKING** `[HUMANO]`              |
| 5   | Worker + API health `/health/ready`           | Staging smoke `verified`; **prod health BLOCKING** `[HUMANO]` |
| 6   | DNS + HTTPS                                   | **BLOCKING** `[HUMANO]`                                       |
| 7   | Smoke login + búsqueda + un pedido draft      | Staging pattern OK; **prod smoke BLOCKING** `[HUMANO]`        |

## Cutover `[HUMANO]`

1. Pausar bot si hay migración de número.
2. Apuntar webhook Meta al prod — **BLOCKING** hasta HTTPS + credenciales.
3. Verificar inbound (evidence-log).
4. Monitorear worker (outbox, guías) + alertas externas.

## Rollback `[HUMANO]`

1. Revert DNS / webhook al staging.
2. Restore DB desde backup drill documentado (destino prod debe existir).
3. Imagen previa de api/worker/admin.

## `[HUMANO]` — inputs exactos antes de cutover

| Input                 | Acción                                      | Evidencia requerida             |
| --------------------- | ------------------------------------------- | ------------------------------- |
| VPS                   | Provisionar host; SSH harden; Docker Engine | IP + hostname en vault (no Git) |
| Dominio               | Registrar / apuntar a VPS                   | `dig` A/AAAA OK                 |
| DNS                   | Records API/admin/webhook                   | Captura DNS                     |
| TLS contact           | `CAMILA_ACME_EMAIL` / Caddy                 | Cert emitido                    |
| Object storage        | Bucket media S3-compatible + keys           | `STORAGE_DRIVER=s3` health      |
| Backup storage        | Bucket **separado** + keys                  | Restore drill prod dest         |
| Alert destination     | Alertmanager webhook / monitor              | 1 alerta externa recibida       |
| Retention / RPO / RTO | Aprobación owner/legal Colombia             | Matriz firmada                  |
| Meta + 99envíos       | Secret channel → panel                      | evidence-log filas reales       |
| Go/no-go              | Firma piloto                                | `go-no-go-checklist.md` = GO    |

**Sin checklist GO firmado = no cutover.**
