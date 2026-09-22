# Guía de contribución

Gracias por contribuir a Camila. Este documento fija expectativas mínimas de calidad para un entorno de equipo.

## Flujo

1. Crea una rama desde `main` (`feat/…`, `fix/…`, `docs/…`).
2. Mantén el diff enfocado en un objetivo.
3. Ejecuta las comprobaciones relevantes (idealmente `pnpm verify`).
4. Abre un PR con resumen del problema, enfoque y cómo probarlo.
5. No incluyas secretos, `.env`, medias reales ni dumps de base de datos.

## Gates de CI (obligatorios)

El workflow `.github/workflows/verify.yml` debe pasar completo antes de merge. Secuencia:

1. Install congelado (`pnpm install --frozen-lockfile`)
2. `pnpm format:check`
3. `pnpm lint:ci` (ESLint con `--max-warnings=0`)
4. `pnpm typecheck`
5. Unit / contracts + integration + build + E2E/a11y
6. `pnpm test:coverage` (≥90% líneas/ramas en dominios críticos API; ≥80% resto)
7. `pnpm audit --prod`
8. Secret scan (gitleaks historial + working tree, versión/checksum pinned)
9. Filesystem scan (Trivy CRITICAL/HIGH; excepciones solo en `.trivyignore` con fecha)
10. Compose validate + Docker build + image scan (Trivy)
11. `pnpm production:smoke` (staging desechable)
12. Bundle budget: `pnpm check:bundle-budget`

Localmente (Windows):

```powershell
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint:ci
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:coverage
pnpm build
pnpm check:bundle-budget
pnpm audit --prod
pnpm check:production-config
pnpm production:smoke
```

## Estándares

- TypeScript estricto; contratos compartidos viven en `@camila/contracts`.
- Formato: Prettier. Lint: ESLint (config raíz); CI falla con cualquier warning.
- Cobertura: dominios críticos (`auth`, `orders`, `inventory`, `shipping`, `whatsapp`, `conversations`, `catalog`, `privacy`, `audit`, `integrations`) ≥90% lines/branches; no excluir código de producción difícil solo para subir el %.
- Pruebas: unitarias cerca del dominio; integración con `postgres-test`; E2E Playwright para el panel.
- Commits claros; un PR = una historia revisable.
- Actions de terceros en CI van pinneadas por SHA inmutable.

## Documentación

- Actualiza el README o `docs/` si cambias el comportamiento visible para operadores o onboarding.
- Sigue el índice Diátaxis en [docs/README.md](docs/README.md).
- No inventes capacidades en la docs: verifica contra el código.

## Seguridad

- Nunca pegues tokens en issues, PRs o chats.
- Webhooks y cookies: respeta los controles existentes; no los desactives “para probar” en ramas compartidas.
- Excepciones Trivy CRITICAL/HIGH: documentar CVE + owner + fecha de expiración en `.trivyignore`.
