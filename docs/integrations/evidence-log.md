# Registro de evidencia — integraciones reales

**Estado Task 13 (2026-09-22):** plantillas y runbooks listos (`verified` automatable). El 2026-09-23 UTC se hicieron pruebas de lectura con credenciales locales. Existe además un registro histórico de creación de guía TCC y validación visual de PDF el 2026-09-08 ([cierre de fase 5](../history/phase-5-closeout.md)); no está ligado a un hash de la versión candidata ni sustituye la aceptación del build actual. Webhooks/mensajes Meta y una repetición verificable de guía/PDF en el release candidato siguen **`[HUMANO]` / BLOCKING**.

## Evidencia automatizada del candidato local

**Candidato `bccfea2` (2026-10-15):** `verify-local` PASS — 645 tests unitarios, 203 de integración (1 omitida por proveedor opcional), 32 E2E de navegador (1 omitida por secreto opcional de WhatsApp), build y presupuesto JS PASS. `security:all` PASS — Gitleaks sin hallazgos en 234 commits, Trivy filesystem sin vulnerabilidades críticas/altas y las cuatro imágenes de producción sin vulnerabilidades críticas/altas. `production:smoke` PASS — login/rutas, S3, backup cifrado, verificación, restauración aislada, heartbeat y separación API/worker. Este smoke usa proveedores y almacenamiento locales desechables; no prueba conexión real con Meta ni 99envíos.

Usar una fila por evento. Redactar PII (teléfonos → últimos 4). **Nunca** tokens, app secrets, JWT ni PII completa.

| Fecha UTC  | Proveedor | Acción                            | Pedido / wamid (parcial) | Resultado                                                                                          | Operador    | Autorización                                   |
| ---------- | --------- | --------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------- |
| —          | Meta      | inbound                           | —                        | **BLOCKING** — sin evidencia                                                                       | `[HUMANO]`  | —                                              |
| —          | Meta      | outbound                          | —                        | **BLOCKING** — sin evidencia                                                                       | `[HUMANO]`  | —                                              |
| —          | Meta      | template / ventana                | —                        | **BLOCKING** — sin evidencia                                                                       | `[HUMANO]`  | —                                              |
| 2026-09-23 | 99envíos  | login + quote                     | —                        | Login HTTP 200; cotización Medellín OK con cinco transportadoras; sin guía creada                  | Codex local | solicitud de pruebas 2026-09-22                |
| 2026-09-08 | 99envíos  | guía TCC + PDF (histórico)        | —                        | Creación controlada documentada; no vinculada al build candidato actual                            | Codex local | autorización registrada en cierre fase 5       |
| —          | 99envíos  | guide + PDF (release candidato)   | —                        | **BLOCKING** — repetir y asociar a hash/tag actual; abrir e imprimir PDF                           | `[HUMANO]`  | explícita                                      |
| —          | 99envíos  | uncertain/fail                    | —                        | **BLOCKING** — sin evidencia                                                                       | `[HUMANO]`  | —                                              |
| 2026-09-23 | Meta      | consulta de número (solo lectura) | —                        | HTTP 401, OAuth 190/subcódigo 463; token local vencido, sin mensaje enviado                        | Codex local | solicitud de pruebas 2026-09-22                |
| 2026-09-23 | Meta      | consulta de número (solo lectura) | —                        | HTTP 200; token recibido habilita lectura del número configurado; no se guardó ni se envió mensaje | Codex local | usuario compartió token para continuar pruebas |

Adjuntos locales (fuera de git): capturas panel, IDs de preenvío sanitizados.

## Automatizable (ya en repo)

- Plantillas: `meta-validation-template.md`, este log, runbooks `docs/runbooks/meta-whatsapp.md` + `docs/runbooks/99envios.md`
- CLI controlada: `CAMILA_ALLOW_REAL_GUIDE=YES pnpm --filter @camila/api shipping:acceptance` (solo DB `*_test`; **no** ejecutar sin credenciales + autorización)
- Tests con proveedores mock / helpers DB (Task 12) — **no** sustituyen evidencia real

## `[HUMANO]` — acciones exactas (secret channel, nunca chat/Git)

1. Entregar credenciales Meta (WABA, phone number ID, verify token, app secret, access token) y 99envíos (usuario/API) vía canal de secretos de producción (password manager / vault / panel cifrado).
2. Confirmar URL HTTPS pública de webhook + DNS/TLS listos (ver `docs/release/production-launch.md`).
3. Ejecutar validación Meta según `meta-validation-template.md`; pegar aquí solo wamid parcial, timestamps UTC, OK/FAIL.
4. En el release candidato, cotizar seguro; luego **una** guía pre-envío **explícitamente autorizada**; clasificar created / uncertain / failed; abrir e imprimir el PDF (`%PDF-`) sin registrar datos cliente.
5. Registrar request IDs / timestamps sanitizados; marcar columna Autorización con nombre + fecha.

**Go-live:** este log debe tener filas reales Meta + 99envíos antes de GO. Hoy = **NO-GO**.
