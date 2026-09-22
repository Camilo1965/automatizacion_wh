# Fase 1 — Recuperar la línea base

**Objetivo:** verificación local verde desde instalación limpia; defectos P0 de pruebas y normalización corregidos.

**Precondiciones:** Node ≥24.14, pnpm 11.19, Docker para `postgres-test` (puerto 5433).

## Tareas

### 1.1 Formato Prettier
- **Archivos:** todo el monorepo.
- **Verificación:** `pnpm format:check`
- **Estado:** completado (2026-09-21).

### 1.2 ESLint sin errores
- **Archivos:** `LocalityPicker.tsx`, `ConversationInboxPage.tsx`, `use-mobile.ts`, `meta-whatsapp-client.ts`
- **Verificación:** `pnpm lint`

### 1.3 Normalización canónica de talla en importación
- **Archivos:** `apps/api/src/modules/catalog/postgres-catalog-import-repository.ts`
- **Prueba:** `apps/api/test/catalog-import.integration.test.ts` — «updates existing references…»
- **Verificación:** `pnpm --filter @camila/api test:integration`

### 1.4 Pruebas de integración alineadas con producto
- **HTTP:** reconciliación de referencias existentes en preview/commit (`admin-http.integration.test.ts`).
- **Guías:** pedidos `confirmed` en fixture (`shipping-guide-job-repository.integration.test.ts`).

### 1.5 CSS global de enlaces
- **Archivo:** `apps/admin/src/styles.css` — eliminar `a { color: … }` que anula utilidades.

### 1.6 E2E y marca login
- **E2E:** `operations.spec.ts` — «Cierres diarios»; `catalog.spec.ts` — «Bienvenida a KAIRO».
- **UI:** `LoginPage.tsx` — KAIRO + contraste AA en texto secundario.

### 1.7 Puerta de salida
```bash
docker compose --profile test up -d postgres-test
pnpm verify
```

**Evidencia:** `pnpm verify` exit 0 local (22 E2E, 106 integración, 312 unitarias, build OK). Requiere `docker compose --profile test up -d postgres-test` antes de integración/E2E.

**Commit recomendado:** `fix: phase 1 baseline — tests, size import, lint, a11y login`
