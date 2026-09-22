# Guía de contribución

Gracias por contribuir a Camila. Este documento fija expectativas mínimas de calidad para un entorno de equipo.

## Flujo

1. Crea una rama desde `main` (`feat/…`, `fix/…`, `docs/…`).
2. Mantén el diff enfocado en un objetivo.
3. Ejecuta las comprobaciones relevantes (idealmente `pnpm verify`).
4. Abre un PR con resumen del problema, enfoque y cómo probarlo.
5. No incluyas secretos, `.env`, medias reales ni dumps de base de datos.

## Gates locales de release (obligatorios)

Ejecuta `pnpm verify:release` desde una rama limpia y comprometida antes de proponer un release. El comando rechaza cambios sin commit para que el análisis del historial, el archivo de Git y la cobertura evalúen el mismo árbol. Secuencia:

1. Install congelado (`pnpm install --frozen-lockfile`)
2. `pnpm format:check`
3. `pnpm lint:strict` (ESLint con `--max-warnings=0`)
4. `pnpm typecheck`
5. Unit / contracts + integration + build + E2E/a11y
6. `pnpm test:coverage` (≥90% líneas/ramas por archivo crítico API; ≥80% por módulo modificado de decisiones de dominio puras, sin excepciones)
7. `pnpm audit --prod`
8. `pnpm security:secrets` (Gitleaks v8.30.1, historial completo)
9. `pnpm security:filesystem` (Trivy v0.74.0, CRITICAL/HIGH)
10. `pnpm production:smoke` (proyecto Compose, imágenes y credenciales S3 desechables; backup/restauración)
11. Docker build + `pnpm security:images` (cuatro imágenes)
12. Bundle budget: `pnpm check:bundle-budget`

Comando completo (Windows, Linux o macOS con Docker):

```powershell
pnpm verify:release
```

## Estándares

- TypeScript estricto; contratos compartidos viven en `@camila/contracts`.
- Formato: Prettier. Lint: ESLint (config raíz); el gate local falla con cualquier warning.
- Cobertura: archivos críticos definidos en `scripts/check-coverage-gates.mjs` ≥90% líneas/ramas cada uno; módulos modificados de decisiones de dominio puras definidos en `scripts/lib/coverage-gate.mjs` ≥80% cada uno, sin excepciones. Repositorios, adaptadores, workers y CLI quedan fuera de ese umbral por archivo y requieren pruebas de integración/smoke; los porcentajes globales se publican como dato, no se presentan como 90%.
- Pruebas: unitarias cerca del dominio; integración con `postgres-test`; E2E Playwright para el panel.
- Commits claros; un PR = una historia revisable.
- Gitleaks y Trivy se ejecutan con versiones fijadas en `scripts/lib/local-security-gates.mjs`.

## Documentación

- Actualiza el README o `docs/` si cambias el comportamiento visible para operadores o onboarding.
- Sigue el índice Diátaxis en [docs/README.md](docs/README.md).
- No inventes capacidades en la docs: verifica contra el código.

## Seguridad

- Nunca pegues tokens en issues, PRs o chats.
- Webhooks y cookies: respeta los controles existentes; no los desactives “para probar” en ramas compartidas.
- Excepciones Trivy CRITICAL/HIGH: documentar CVE + owner + fecha de expiración en `.trivyignore`.
