# Fase 6 — Fundamentos de seguridad

**Objetivo:** Capacidades RBAC preparadas, higiene de sesiones, inventario PII, simulación de retención, base MFA TOTP, sin romper `pnpm verify`.

**Puerta automatizable:** docs + migración + tests + CLI de simulación.  
**Puerta `[HUMANO]`:** matriz de retención legal en [retention-matrix.template.md](../../compliance/retention-matrix.template.md).

## Entregables

| Área | Artefacto |
| --- | --- |
| Compliance | [pii-inventory.md](../../compliance/pii-inventory.md), [retention-matrix.template.md](../../compliance/retention-matrix.template.md) |
| RBAC (single-owner) | `apps/api/src/modules/auth/capabilities.ts` |
| Sesiones | `purgeExpiredSessions()` en repositorio + `AuthService`; invocado cada 60s desde `runtime` workers |
| Retención (solo conteo) | `apps/api/src/cli/retention-simulate.ts`, script `retention:simulate` |
| MFA | Tablas `admin_mfa_secrets`, `admin_mfa_recovery_codes`; `totp.ts`; rutas `/api/admin/auth/mfa/*`; login con `mfaRequired` + `/auth/mfa/verify` |
| Contratos | `packages/contracts/src/auth.ts` (union login session \| MFA) |
| Admin UI | `LoginPage` — paso MFA mínimo en español |
| Tests | `totp.test.ts`, `admin-auth-login.integration.test.ts` (login sin MFA) |

## Fuera de alcance (fase siguiente)

- UI completa de enrolamiento MFA en panel
- Jobs de borrado real de retención
- RBAC multi-usuario granular

**Estado:** Implementación automatizable completada; revisión legal de retención pendiente `[HUMANO]`.
